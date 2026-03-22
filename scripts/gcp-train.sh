#!/usr/bin/env bash
# Orchestrate YOLOv8 training on a dedicated GCP VM with 8x L4 GPUs.
# All training runs inside Docker containers for reproducibility.
#
# Usage:
#   scripts/gcp-train.sh <subcommand> [args...]
#
# Subcommands:
#   create       Create VM (delegates to training/setup.sh) + run setup
#   setup        Build Docker image on VM + sync code (idempotent)
#   prepare      Convert COCO → YOLO format on VM (in Docker container)
#   sync         SCP local src/, training scripts + Dockerfile to VM
#   train        Launch training in Docker container (passthrough args)
#   status       Show container status, GPU info, tail log
#   progress     Show formatted metrics table from results.csv
#   logs         Tail training container logs (Ctrl+C to detach)
#   pull         Download weights from VM → local
#   tensorboard  Launch TensorBoard in separate container on port 6006
#   stop         Stop VM (pause billing)
#   start        Start VM + wait for SSH
#   destroy      Delete VM (with confirmation)
#   push-gcs     Zip & upload entire run to GCS
#   list-gcs     List uploaded runs in GCS
#   pull-gcs     Download run zip from GCS to local
#   ssh          Convenience SSH wrapper

set -euo pipefail

# --- Configuration (override via env vars) ---
INSTANCE="${INSTANCE:-nmiai-train}"
ZONE="${ZONE:-asia-southeast1-c}"
MACHINE_TYPE="${MACHINE_TYPE:-a2-highgpu-8g}"
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
GCS_BUCKET="gs://nmiai-norgesgruppen-data"
REMOTE_DIR="/opt/norgesgruppen"
DOCKER_IMAGE="nmiai/norgesgruppen-train:latest"
TRAIN_CONTAINER="norgesgruppen-train"
TB_CONTAINER="norgesgruppen-tensorboard"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Helpers ---
die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "=== $* ==="; }

gcp_ssh() {
    gcloud compute ssh "$INSTANCE" \
        --zone="$ZONE" --project="$PROJECT" \
        --command="$1"
}

gcp_ssh_interactive() {
    gcloud compute ssh "$INSTANCE" \
        --zone="$ZONE" --project="$PROJECT" \
        -- "$@"
}

gcp_scp_to() {
    gcloud compute scp --recurse "$1" \
        "$INSTANCE:$2" \
        --zone="$ZONE" --project="$PROJECT"
}

gcp_scp_from() {
    gcloud compute scp --recurse \
        "$INSTANCE:$1" "$2" \
        --zone="$ZONE" --project="$PROJECT"
}

vm_exists() {
    gcloud compute instances describe "$INSTANCE" \
        --zone="$ZONE" --project="$PROJECT" \
        &>/dev/null
}

wait_for_ssh() {
    info "Waiting for SSH"
    local elapsed=0
    while [ $elapsed -lt 120 ]; do
        if gcp_ssh "true" 2>/dev/null; then
            echo "SSH ready."
            return 0
        fi
        echo "  Waiting... (${elapsed}s)"
        sleep 10
        elapsed=$((elapsed + 10))
    done
    die "Timeout waiting for SSH after 120s"
}

# Docker volume mounts for training containers
docker_volumes() {
    echo "-v $REMOTE_DIR/src:/workspace/src:ro \
          -v $REMOTE_DIR/training:/workspace/training:ro \
          -v $REMOTE_DIR/assets:/workspace/assets:ro \
          -v $REMOTE_DIR/data:/workspace/data:rw \
          -v $REMOTE_DIR/runs:/workspace/runs:rw \
          -v $REMOTE_DIR/logs:/workspace/logs:rw"
}

# --- Subcommands ---

cmd_create() {
    if vm_exists; then
        echo "VM '$INSTANCE' already exists."
        cmd_setup
    else
        info "Creating VM '$INSTANCE' via training/setup.sh"
        bash "$PROJECT_ROOT/training/setup.sh" "$INSTANCE" "$ZONE" "$PROJECT" "$MACHINE_TYPE"
        cmd_setup
    fi
}

cmd_setup() {
    info "Setting up Docker training environment on '$INSTANCE'"

    # Sync Dockerfile + src
    cmd_sync

    # Build Docker image on the VM
    info "Building Docker image '$DOCKER_IMAGE' on VM"
    gcp_ssh "cd $REMOTE_DIR && sudo docker build -t $DOCKER_IMAGE -f Dockerfile ."

    echo "Setup complete. Docker image '$DOCKER_IMAGE' built on VM."
}

cmd_prepare() {
    local full_train="" augmented=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --full-train) full_train="--full-train"; shift ;;
            --augmented) augmented="1"; shift ;;
            *) die "Unknown arg: $1" ;;
        esac
    done

    info "Preparing YOLO dataset on '$INSTANCE' (in Docker container) ${full_train:+(full-train mode)} ${augmented:+(augmented)}"
    gcp_ssh "
        cd $REMOTE_DIR
        # Detect COCO path on host
        if [ -d assets/NM_NGD_coco_dataset/train ]; then
            COCO_PATH=/workspace/assets/NM_NGD_coco_dataset/train
        elif [ -d assets/train ]; then
            COCO_PATH=/workspace/assets/train
        else
            echo 'ERROR: Cannot find COCO train directory in assets/' >&2
            exit 1
        fi

        # Clear old data to avoid stale symlinks
        rm -rf data/yolo

        EXTRA_ARGS=''
        PRODUCT_ARGS=''

        # If augmented, first generate augmented annotations, then use them
        if [ -n \"$augmented\" ]; then
            echo 'Generating augmented annotations with product reference images...'
            # Product images may be in assets/NM_NGD_product_images/ or directly in assets/
            if [ -d assets/NM_NGD_product_images ]; then
                PROD_PATH=/workspace/assets/NM_NGD_product_images
            else
                PROD_PATH=/workspace/assets
            fi

            sudo docker run --rm \
                -v $REMOTE_DIR/training:/workspace/training:ro \
                -v $REMOTE_DIR/assets:/workspace/assets:rw \
                -w /workspace \
                $DOCKER_IMAGE \
                python training/augment_with_products.py \
                    --coco \$COCO_PATH \
                    --products \$PROD_PATH \
                    --output \$COCO_PATH/annotations_augmented.json
            EXTRA_ARGS='--annotations annotations_augmented.json'
            PRODUCT_ARGS=\"--product-images \$PROD_PATH\"
        fi

        echo \"Using COCO path: \$COCO_PATH\"
        sudo docker run --rm \
            -v $REMOTE_DIR/training:/workspace/training:ro \
            -v $REMOTE_DIR/assets:/workspace/assets:ro \
            -v $REMOTE_DIR/data:/workspace/data:rw \
            -w /workspace \
            $DOCKER_IMAGE \
            python training/prepare_data.py \
                --coco \$COCO_PATH \
                --output /workspace/data/yolo \
                $full_train \
                \$EXTRA_ARGS \
                \$PRODUCT_ARGS
    "
}

cmd_sync() {
    info "Syncing src/, training scripts, and Dockerfile to '$INSTANCE'"

    # Ensure remote directory exists and is writable
    gcp_ssh "sudo mkdir -p $REMOTE_DIR/training && sudo chown -R \$(whoami):\$(whoami) $REMOTE_DIR"

    # Remove old src/ and copy fresh (run.py for submission packaging)
    gcp_ssh "rm -rf $REMOTE_DIR/src"
    gcp_scp_to "$PROJECT_ROOT/src" "$REMOTE_DIR/"

    # Sync training scripts
    gcp_scp_to "$PROJECT_ROOT/training/train.py" "$REMOTE_DIR/training/"
    gcp_scp_to "$PROJECT_ROOT/training/prepare_data.py" "$REMOTE_DIR/training/"
    gcp_scp_to "$PROJECT_ROOT/training/augment_with_products.py" "$REMOTE_DIR/training/"

    # Sync Dockerfile for building
    gcp_scp_to "$PROJECT_ROOT/training/Dockerfile" "$REMOTE_DIR/Dockerfile"

    echo "Done."
}

cmd_train() {
    # Parse passthrough args
    local model="m" epochs=100 batch=16 imgsz=1280 name="norgesgruppen" resume="" device="0,1,2,3" export_onnx="" no_perspective=""
    local label_smoothing="" dropout="" cos_lr="" close_mosaic="" patience="" mosaic="" cls_weight="" seed=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --model)  model="$2"; shift 2 ;;
            --epochs) epochs="$2"; shift 2 ;;
            --batch)  batch="$2"; shift 2 ;;
            --imgsz)  imgsz="$2"; shift 2 ;;
            --name)   name="$2"; shift 2 ;;
            --device) device="$2"; shift 2 ;;
            --resume) resume="--resume"; shift ;;
            --export-onnx) export_onnx="--export-onnx"; shift ;;
            --no-perspective) no_perspective="--no-perspective"; shift ;;
            --label-smoothing) label_smoothing="--label-smoothing $2"; shift 2 ;;
            --dropout) dropout="--dropout $2"; shift 2 ;;
            --cos-lr) cos_lr="--cos-lr"; shift ;;
            --no-cos-lr) cos_lr="--no-cos-lr"; shift ;;
            --close-mosaic) close_mosaic="--close-mosaic $2"; shift 2 ;;
            --patience) patience="--patience $2"; shift 2 ;;
            --mosaic) mosaic="--mosaic $2"; shift 2 ;;
            --cls-weight) cls_weight="--cls-weight $2"; shift 2 ;;
            --seed) seed="--seed $2"; shift 2 ;;
            *) die "Unknown arg: $1" ;;
        esac
    done

    info "Launching training: model=$model epochs=$epochs batch=$batch imgsz=$imgsz name=$name device=$device"

    # Stop any existing training container
    gcp_ssh "sudo docker rm -f $TRAIN_CONTAINER 2>/dev/null || true"

    gcp_ssh "
        cd $REMOTE_DIR && \
        sudo docker run -d \
            --name $TRAIN_CONTAINER \
            --gpus all \
            --ipc=host \
            --shm-size=16g \
            --ulimit nofile=65536:65536 \
            -v $REMOTE_DIR/src:/workspace/src:ro \
            -v $REMOTE_DIR/training:/workspace/training:ro \
            -v $REMOTE_DIR/assets:/workspace/assets:ro \
            -v $REMOTE_DIR/data:/workspace/data:rw \
            -v $REMOTE_DIR/runs:/workspace/runs:rw \
            -v $REMOTE_DIR/logs:/workspace/logs:rw \
            -w /workspace \
            $DOCKER_IMAGE \
            python training/train.py \
                --data data/yolo/dataset.yaml \
                --model $model \
                --epochs $epochs \
                --batch $batch \
                --imgsz $imgsz \
                --name $name \
                --device $device \
                $resume \
                $export_onnx \
                $no_perspective \
                $label_smoothing \
                $dropout \
                $cos_lr \
                $close_mosaic \
                $patience \
                $mosaic \
                $cls_weight \
                $seed

        sleep 2
        if sudo docker ps -q -f name=$TRAIN_CONTAINER | grep -q .; then
            echo \"Training started in container '$TRAIN_CONTAINER'\"
            echo \"Use 'scripts/gcp-train.sh logs $name' to follow progress\"
        else
            echo \"ERROR: Training container exited immediately. Logs:\" >&2
            sudo docker logs $TRAIN_CONTAINER 2>&1 | tail -20 >&2
            exit 1
        fi
    "
}

cmd_export() {
    local name="${1:?Usage: gcp-train.sh export <name> [--imgsz 1280] [--dynamic] [--half]}"
    shift
    local imgsz=1280 dynamic="False" half="False"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --imgsz) imgsz="$2"; shift 2 ;;
            --dynamic) dynamic="True"; shift ;;
            --half) half="True"; shift ;;
            *) die "Unknown arg: $1" ;;
        esac
    done

    info "Exporting ONNX for run '$name' (imgsz=$imgsz, dynamic=$dynamic, half=$half)"
    gcp_ssh "
        cd $REMOTE_DIR
        BEST=\"runs/train/$name/weights/best.pt\"
        if [ ! -f \"\$BEST\" ]; then
            echo \"ERROR: best.pt not found: \$BEST\" >&2
            exit 1
        fi

        sudo docker run --rm \
            --gpus all \
            $(docker_volumes) \
            -w /workspace \
            $DOCKER_IMAGE \
            python -c \"
from ultralytics import YOLO
model = YOLO('runs/train/$name/weights/best.pt')
path = model.export(format='onnx', imgsz=$imgsz, opset=17, simplify=True, half=$half, dynamic=$dynamic)
print(f'Exported: {path}')
\"

        ls -lh runs/train/$name/weights/best.onnx
    "
}

cmd_status() {
    info "Status of '$INSTANCE'"
    gcp_ssh "
        # Container status
        echo 'Container status:'
        if sudo docker ps -q -f name=$TRAIN_CONTAINER | grep -q .; then
            echo \"  Training: RUNNING\"
            sudo docker ps -f name=$TRAIN_CONTAINER --format 'table {{.Status}}\t{{.RunningFor}}'
        elif sudo docker ps -aq -f name=$TRAIN_CONTAINER | grep -q .; then
            echo \"  Training: STOPPED\"
            sudo docker ps -a -f name=$TRAIN_CONTAINER --format 'table {{.Status}}\t{{.RunningFor}}'
        else
            echo \"  Training: no container\"
        fi
        echo ''

        # GPU info (all 4 A100s)
        echo 'GPUs:'
        nvidia-smi --query-gpu=index,name,temperature.gpu,utilization.gpu,memory.used,memory.total \
            --format=csv,noheader 2>/dev/null || echo '  nvidia-smi not available'
        echo ''

        # Training runs
        echo 'Training runs:'
        ls -la $REMOTE_DIR/runs/train/ 2>/dev/null || echo '  (none)'
    "
}

cmd_progress() {
    local name="${1:-}"

    gcp_ssh "
cd $REMOTE_DIR

# Determine run name
NAME='$name'
if [ -z \"\$NAME\" ]; then
    # Find latest run directory
    NAME=\$(ls -t runs/train/ 2>/dev/null | head -1)
    if [ -z \"\$NAME\" ]; then
        echo 'No training runs found.'
        exit 1
    fi
fi

RESULTS=\"runs/train/\${NAME}/results.csv\"
if [ ! -f \"\$RESULTS\" ]; then
    echo \"No results.csv found for run '\$NAME'.\"
    echo \"Training may not have started yet.\"
    exit 1
fi

# Check container status
STATUS='UNKNOWN'
if sudo docker ps -q -f name=$TRAIN_CONTAINER | grep -q .; then
    STATUS='RUNNING'
elif sudo docker ps -aq -f name=$TRAIN_CONTAINER | grep -q .; then
    STATUS='STOPPED'
else
    STATUS='NO CONTAINER'
fi

# Parse results.csv with inline Python
python3 - \"\$NAME\" \"\$STATUS\" \"\$RESULTS\" <<'PYEOF'
import csv, sys

name, status, results_path = sys.argv[1], sys.argv[2], sys.argv[3]

with open(results_path) as f:
    reader = csv.reader(f)
    header = [h.strip() for h in next(reader)]
    rows = []
    for row in reader:
        if row:
            rows.append([v.strip() for v in row])

if not rows:
    print(f'Experiment: {name} | Status: {status}')
    print('No epoch data yet.')
    sys.exit(0)

# Find column indices
def col(prefix):
    for i, h in enumerate(header):
        if prefix in h:
            return i
    return -1

epoch_col = col('epoch')
map50_col = col('mAP50(B)')
map5095_col = col('mAP50-95(B)')
tbox_col = col('train/box')
tcls_col = col('train/cls')
vbox_col = col('val/box')
vcls_col = col('val/cls')
lr_col = col('lr/pg0')

# Find total epochs (from last row epoch number)
total_epochs = '?'
current_epoch = rows[-1][epoch_col] if epoch_col >= 0 else '?'

# Find best mAP50
best_map50 = 0.0
best_map50_epoch = 0
best_map5095 = 0.0
best_map5095_epoch = 0
for row in rows:
    try:
        m50 = float(row[map50_col]) if map50_col >= 0 else 0
        m5095 = float(row[map5095_col]) if map5095_col >= 0 else 0
        ep = int(float(row[epoch_col])) if epoch_col >= 0 else 0
        if m50 > best_map50:
            best_map50 = m50
            best_map50_epoch = ep
        if m5095 > best_map5095:
            best_map5095 = m5095
            best_map5095_epoch = ep
    except (ValueError, IndexError):
        pass

print(f'Experiment: {name} | Status: {status}')
print(f'Epoch: {current_epoch} | Best mAP50: {best_map50:.4f} (epoch {best_map50_epoch}) | Best mAP50-95: {best_map5095:.4f} (epoch {best_map5095_epoch})')
print()

# Show last 10 rows
display_rows = rows[-10:]
fmt = '{:>7}  {:>10}  {:>10}  {:>9}  {:>9}  {:>8}  {:>10}  {:>10}'
print(fmt.format('Epoch', 'train/box', 'train/cls', 'val/box', 'val/cls', 'mAP50', 'mAP50-95', 'lr'))
print('-' * 90)
for row in display_rows:
    try:
        ep = row[epoch_col] if epoch_col >= 0 else '?'
        tb = f\"{float(row[tbox_col]):.4f}\" if tbox_col >= 0 else '?'
        tc = f\"{float(row[tcls_col]):.4f}\" if tcls_col >= 0 else '?'
        vb = f\"{float(row[vbox_col]):.4f}\" if vbox_col >= 0 else '?'
        vc = f\"{float(row[vcls_col]):.4f}\" if vcls_col >= 0 else '?'
        m50 = f\"{float(row[map50_col]):.4f}\" if map50_col >= 0 else '?'
        m5095 = f\"{float(row[map5095_col]):.4f}\" if map5095_col >= 0 else '?'
        lr = f\"{float(row[lr_col]):.6f}\" if lr_col >= 0 else '?'
        marker = ' *' if map50_col >= 0 and float(row[map50_col]) == best_map50 else ''
        print(fmt.format(ep, tb, tc, vb, vc, m50, m5095, lr) + marker)
    except (ValueError, IndexError):
        pass

print()
print('* = best mAP50 epoch')
PYEOF
    "
}

cmd_logs() {
    local name="${1:-}"

    info "Tailing training container logs on '$INSTANCE' (Ctrl+C to detach)"
    if [ -n "$name" ]; then
        # Try container logs first, fall back to log file
        gcp_ssh_interactive -t "sudo docker logs -f $TRAIN_CONTAINER 2>&1 || tail -f $REMOTE_DIR/logs/${name}.log"
    else
        gcp_ssh_interactive -t "sudo docker logs -f $TRAIN_CONTAINER 2>&1"
    fi
}

cmd_pull() {
    local name="${1:?Usage: gcp-train.sh pull <name>}"
    local run_dir="$PROJECT_ROOT/runs/train/$name"
    local weights_dir="$run_dir/weights"
    mkdir -p "$weights_dir"

    info "Pulling weights for '$name'"
    gcp_scp_from "$REMOTE_DIR/runs/train/$name/weights/best.pt" "$weights_dir/best.pt"
    gcp_scp_from "$REMOTE_DIR/runs/train/$name/weights/last.pt" "$weights_dir/last.pt" 2>/dev/null || true
    gcp_scp_from "$REMOTE_DIR/runs/train/$name/weights/best.onnx" "$weights_dir/best.onnx" 2>/dev/null || true
    echo "Weights saved to $weights_dir/"
    ls -lh "$weights_dir/"

    info "Pulling training artifacts for '$name'"
    gcp_scp_from "$REMOTE_DIR/runs/train/$name/results.csv" "$run_dir/results.csv" 2>/dev/null || true
    gcp_scp_from "$REMOTE_DIR/runs/train/$name/args.yaml" "$run_dir/args.yaml" 2>/dev/null || true

    # Pull training plots (PNGs and JPGs)
    for ext in png jpg; do
        local remote_files
        remote_files=$(gcp_ssh "ls $REMOTE_DIR/runs/train/$name/*.$ext 2>/dev/null" 2>/dev/null) || true
        for f in $remote_files; do
            local basename
            basename=$(basename "$f")
            gcp_scp_from "$f" "$run_dir/$basename" 2>/dev/null || true
        done
    done
    echo "Training artifacts saved to $run_dir/"
    ls -lh "$run_dir/" 2>/dev/null || true
}

cmd_tensorboard() {
    info "Launching TensorBoard on '$INSTANCE'"

    gcp_ssh "
        # Stop existing TensorBoard container if any
        sudo docker rm -f $TB_CONTAINER 2>/dev/null || true

        sudo docker run -d \
            --name $TB_CONTAINER \
            -v $REMOTE_DIR/runs:/workspace/runs:ro \
            -p 6006:6006 \
            $DOCKER_IMAGE \
            python -m tensorboard.main --logdir /workspace/runs/train --port 6006 --bind_all

        echo 'TensorBoard started on port 6006'
    "

    EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE" \
        --zone="$ZONE" --project="$PROJECT" \
        --format='get(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null || echo "unknown")

    echo ""
    echo "TensorBoard available at: http://$EXTERNAL_IP:6006"
    echo ""
    echo "Or use SSH tunnel: gcloud compute ssh $INSTANCE --zone=$ZONE -- -NL 6006:localhost:6006"
}

cmd_stop() {
    info "Stopping '$INSTANCE'"
    gcloud compute instances stop "$INSTANCE" \
        --zone="$ZONE" --project="$PROJECT"
    echo "Training VM stopped. Billing paused (disk charges still apply)."
}

cmd_start() {
    info "Starting '$INSTANCE'"
    gcloud compute instances start "$INSTANCE" \
        --zone="$ZONE" --project="$PROJECT"
    wait_for_ssh
    echo "Training VM running."
}

cmd_destroy() {
    echo "This will DELETE training VM '$INSTANCE' and all its data (including training runs on disk)."
    read -rp "Type 'yes' to confirm: " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 1
    fi

    info "Deleting '$INSTANCE'"
    gcloud compute instances delete "$INSTANCE" \
        --zone="$ZONE" --project="$PROJECT" --quiet
    echo "Training VM deleted."
}

cmd_push_gcs() {
    local name="${1:?Usage: gcp-train.sh push-gcs <name>}"

    info "Zipping and pushing run '$name' to GCS"
    gcp_ssh "
        cd $REMOTE_DIR
        RUN_DIR=\"runs/train/$name\"
        if [ ! -d \"\$RUN_DIR\" ]; then
            echo \"ERROR: Run directory not found: \$RUN_DIR\" >&2
            exit 1
        fi

        # Create timestamped zip of the entire run
        TIMESTAMP=\$(date +%Y%m%d-%H%M%S)
        ZIP_NAME=\"${name}_\${TIMESTAMP}.zip\"
        cd runs/train
        zip -r \"/tmp/\$ZIP_NAME\" \"$name/\"
        cd $REMOTE_DIR

        # Upload to GCS
        gsutil cp \"/tmp/\$ZIP_NAME\" \"$GCS_BUCKET/runs/\$ZIP_NAME\"
        rm -f \"/tmp/\$ZIP_NAME\"

        echo \"Uploaded to $GCS_BUCKET/runs/\$ZIP_NAME\"
        gsutil ls -lh \"$GCS_BUCKET/runs/\$ZIP_NAME\"
    "
}

cmd_list_gcs() {
    gsutil ls -lh "$GCS_BUCKET/runs/" 2>/dev/null || echo "No runs uploaded yet."
}

cmd_pull_gcs() {
    local zip_name="${1:?Usage: gcp-train.sh pull-gcs <zip-name>}"
    local local_dir="$PROJECT_ROOT/runs/train"
    mkdir -p "$local_dir"
    gsutil cp "$GCS_BUCKET/runs/$zip_name" "$local_dir/$zip_name"
    echo "Downloaded to $local_dir/$zip_name"
}

cmd_ssh() {
    gcloud compute ssh "$INSTANCE" \
        --zone="$ZONE" --project="$PROJECT" \
        -- "$@"
}

# --- Main ---
SUBCOMMAND="${1:-help}"
shift || true

case "$SUBCOMMAND" in
    create)      cmd_create "$@" ;;
    setup)       cmd_setup "$@" ;;
    prepare)     cmd_prepare "$@" ;;
    sync)        cmd_sync "$@" ;;
    train)       cmd_train "$@" ;;
    export)      cmd_export "$@" ;;
    status)      cmd_status "$@" ;;
    progress)    cmd_progress "$@" ;;
    logs)        cmd_logs "$@" ;;
    pull)        cmd_pull "$@" ;;
    tensorboard) cmd_tensorboard "$@" ;;
    stop)        cmd_stop "$@" ;;
    start)       cmd_start "$@" ;;
    destroy)     cmd_destroy "$@" ;;
    push-gcs)    cmd_push_gcs "$@" ;;
    list-gcs)    cmd_list_gcs "$@" ;;
    pull-gcs)    cmd_pull_gcs "$@" ;;
    ssh)         cmd_ssh "$@" ;;
    help|--help|-h)
        echo "Usage: scripts/gcp-train.sh <subcommand> [args...]"
        echo ""
        echo "Subcommands:"
        echo "  create       Create training VM (a2-highgpu-8g, 8x A100 40GB) + build Docker image"
        echo "  setup        Build Docker image on VM + sync code (idempotent)"
        echo "  prepare      Convert COCO → YOLO format on VM (in Docker container)"
        echo "  sync         SCP local src/, training scripts + Dockerfile to VM"
        echo "  train        Launch training (--model, --epochs, --batch, --imgsz, --name, --device, --resume, --export-onnx, --no-perspective, --label-smoothing, --dropout, --cos-lr, --close-mosaic)"
        echo "  export       Export best.pt to ONNX (export <name> [--imgsz 1280])"
        echo "  status       Show container status, all 8 GPUs, list runs"
        echo "  progress     Show formatted metrics table [name]"
        echo "  logs         Tail training container logs [name] (Ctrl+C to detach)"
        echo "  pull         Download weights from VM (pull <name>)"
        echo "  tensorboard  Launch TensorBoard container on port 6006"
        echo "  stop         Stop VM (pause billing)"
        echo "  start        Start VM + wait for SSH"
        echo "  destroy      Delete training VM (confirmation required)"
        echo "  push-gcs     Zip & upload entire run to GCS (push-gcs <name>)"
        echo "  list-gcs     List uploaded runs in GCS"
        echo "  pull-gcs     Download run zip from GCS (pull-gcs <zip-name>)"
        echo "  ssh          Convenience SSH wrapper"
        echo ""
        echo "Configuration (env vars):"
        echo "  INSTANCE      VM name (default: nmiai-train)"
        echo "  ZONE          GCP zone (default: asia-southeast1-c)"
        echo "  PROJECT       GCP project (default: gcloud config)"
        ;;
    *)
        die "Unknown subcommand: $SUBCOMMAND (try 'help')"
        ;;
esac
