#!/usr/bin/env bash
# Provision a GCP VM with A100 GPUs for dedicated training.
#
# Usage:
#   ./training/setup.sh [instance-name] [zone] [project] [machine-type]
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - Sufficient A100 GPU quota in the target zone (8 GPUs for a2-highgpu-8g)
#   - Data uploaded to gs://nmiai-norgesgruppen-data/
#
# Uses the Deep Learning VM image (CUDA 12.8 + PyTorch 2.7 + Python 3.12)
# which has NVIDIA drivers pre-installed — no manual driver setup needed.

set -euo pipefail

INSTANCE="${1:-nmiai-train}"
ZONE="${2:-asia-southeast1-c}"
PROJECT="${3:-$(gcloud config get-value project)}"
MACHINE_TYPE="${4:-a2-highgpu-8g}"
GCS_BUCKET="gs://nmiai-norgesgruppen-data"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Creating GCP Training VM ==="
echo "  Instance: $INSTANCE"
echo "  Zone:     $ZONE"
echo "  Project:  $PROJECT"
echo "  Machine:  $MACHINE_TYPE"
echo ""

# Write startup script to temp file (avoids gcloud metadata parsing issues with
# special chars like [], {}, = inside inline scripts)
STARTUP_SCRIPT=$(mktemp)
trap "rm -f $STARTUP_SCRIPT" EXIT

cat > "$STARTUP_SCRIPT" << 'STARTUP_EOF'
#!/bin/bash
set -eo pipefail

exec > /var/log/training-setup.log 2>&1
echo "=== Startup script begin: $(date) ==="

export DEBIAN_FRONTEND=noninteractive

# ---- Step 1: Docker + NVIDIA Container Toolkit ----
# DLVM has NVIDIA drivers + CUDA pre-installed, just need Docker.
echo "=== Installing prerequisites ==="
apt-get update -qq
apt-get install -y unzip zip

echo "=== Installing Docker ==="
curl -fsSL https://get.docker.com | sh
systemctl enable docker

echo "=== Installing NVIDIA Container Toolkit ==="
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://nvidia.github.io/libnvidia-container/stable/deb/$(dpkg --print-architecture) /" \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt-get update -qq
apt-get install -y nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

# Verify GPU access
echo "=== GPU check ==="
nvidia-smi || echo "WARNING: nvidia-smi failed"

# ---- Step 2: Pull BOTH datasets from GCS ----
echo "=== Pulling data from GCS ==="
mkdir -p /opt/norgesgruppen/assets
cd /tmp

gsutil -m cp gs://nmiai-norgesgruppen-data/NM_NGD_coco_dataset.zip .
unzip -q -o NM_NGD_coco_dataset.zip -d /opt/norgesgruppen/assets/
rm -f NM_NGD_coco_dataset.zip

gsutil -m cp gs://nmiai-norgesgruppen-data/NM_NGD_product_images.zip .
unzip -q -o NM_NGD_product_images.zip -d /opt/norgesgruppen/assets/
rm -f NM_NGD_product_images.zip

# ---- Step 3: Create workspace directories ----
echo "=== Creating workspace directories ==="
mkdir -p /opt/norgesgruppen/src
mkdir -p /opt/norgesgruppen/training
mkdir -p /opt/norgesgruppen/data
mkdir -p /opt/norgesgruppen/runs
mkdir -p /opt/norgesgruppen/logs
chown -R 1000:1000 /opt/norgesgruppen

echo "=== Startup complete: $(date) ==="
touch /var/log/training-setup-done
STARTUP_EOF

# Create VM: DLVM with CUDA 12.8 + PyTorch 2.7 + Python 3.12 (NVIDIA 570 drivers pre-installed)
gcloud compute instances create "$INSTANCE" \
    --project="$PROJECT" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --maintenance-policy=TERMINATE \
    --boot-disk-size=400GB \
    --boot-disk-type=pd-ssd \
    --image-family=pytorch-2-7-cu128-ubuntu-2404-nvidia-570 \
    --image-project=deeplearning-platform-release \
    --scopes=storage-rw,default \
    --tags=training-vm \
    --metadata-from-file=startup-script="$STARTUP_SCRIPT"

echo ""
echo "=== VM created ==="
echo "Startup script will: install Docker + NVIDIA Container Toolkit, pull both datasets from GCS."
echo "NVIDIA drivers + CUDA 12.8 + PyTorch 2.7 are pre-installed via DLVM image."
echo ""

# Open firewall for TensorBoard on port 6006
gcloud compute firewall-rules create allow-tensorboard-6006 \
    --project="$PROJECT" \
    --allow=tcp:6006 \
    --target-tags=training-vm \
    --description="Allow traffic to TensorBoard on training VM" \
    2>/dev/null || echo "Firewall rule already exists"

echo "=== Waiting for startup script to complete... ==="
echo "(Checking /var/log/training-setup-done every 30s, timeout 15min)"
echo ""

ELAPSED=0
while [ $ELAPSED -lt 900 ]; do
    if gcloud compute ssh "$INSTANCE" --zone="$ZONE" --project="$PROJECT" \
        --command="test -f /var/log/training-setup-done" 2>/dev/null; then
        echo "Startup script completed!"
        break
    fi
    if gcloud compute ssh "$INSTANCE" --zone="$ZONE" --project="$PROJECT" \
        --command="test -f /var/log/training-setup-failed" 2>/dev/null; then
        echo "ERROR: Startup script failed. Check logs:"
        echo "  gcloud compute ssh $INSTANCE --zone=$ZONE -- cat /var/log/training-setup.log"
        exit 1
    fi
    echo "  Waiting... (${ELAPSED}s elapsed)"
    sleep 30
    ELAPSED=$((ELAPSED + 30))
done

if [ $ELAPSED -ge 900 ]; then
    echo "WARNING: Timeout waiting for startup script. Check logs:"
    echo "  gcloud compute ssh $INSTANCE --zone=$ZONE -- cat /var/log/training-setup.log"
fi

echo ""
echo "=== Next steps ==="
echo ""
echo "1. Finish setup (build Docker image + sync code):"
echo "   scripts/gcp-train.sh setup"
echo ""
echo "2. Prepare data:"
echo "   scripts/gcp-train.sh prepare"
echo ""
echo "3. Train:"
echo "   scripts/gcp-train.sh train --model m --epochs 100 --name exp01"
echo ""

EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE" \
    --zone="$ZONE" --project="$PROJECT" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null || echo "pending")

echo "4. TensorBoard: http://$EXTERNAL_IP:6006"
