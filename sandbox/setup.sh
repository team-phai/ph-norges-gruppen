#!/usr/bin/env bash
# Provision a GCP VM with A100 GPUs for the sandbox test server.
#
# Usage:
#   ./sandbox/setup.sh [instance-name] [zone] [project] [machine-type]
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - Sufficient A100 GPU quota in the target zone (8 GPUs for a2-highgpu-8g)
#   - Data uploaded to gs://nmiai-norgesgruppen-data/
#
# Uses the Deep Learning VM image (CUDA 12.8 + PyTorch 2.7 + Python 3.12)
# which has NVIDIA drivers pre-installed — no manual driver setup needed.

set -euo pipefail

INSTANCE="${1:-nmiai-sandbox}"
ZONE="${2:-asia-southeast1-a}"
PROJECT="${3:-$(gcloud config get-value project)}"
MACHINE_TYPE="${4:-a2-highgpu-8g}"
GCS_BUCKET="gs://nmiai-norgesgruppen-data"

echo "=== Creating GCP VM ==="
echo "  Instance: $INSTANCE"
echo "  Zone:     $ZONE"
echo "  Project:  $PROJECT"
echo "  Machine:  $MACHINE_TYPE"
echo ""

# Write startup script to temp file (avoids gcloud metadata parsing issues)
STARTUP_SCRIPT=$(mktemp)
trap "rm -f $STARTUP_SCRIPT" EXIT

cat > "$STARTUP_SCRIPT" << 'STARTUP_EOF'
#!/bin/bash
set -eo pipefail

exec > /var/log/sandbox-setup.log 2>&1
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

# ---- Step 2: Pull data from GCS ----
echo "=== Pulling data from GCS ==="
mkdir -p /opt/norgesgruppen/sandbox/data/images
cd /tmp
gsutil -m cp gs://nmiai-norgesgruppen-data/NM_NGD_coco_dataset.zip .
unzip -q -o NM_NGD_coco_dataset.zip -d NM_NGD_coco_dataset
cp NM_NGD_coco_dataset/train/annotations.json /opt/norgesgruppen/sandbox/data/
cp NM_NGD_coco_dataset/train/images/* /opt/norgesgruppen/sandbox/data/images/
rm -rf NM_NGD_coco_dataset NM_NGD_coco_dataset.zip

echo "=== Startup complete: $(date) ==="
touch /var/log/sandbox-setup-done
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
    --tags=sandbox-server \
    --metadata-from-file=startup-script="$STARTUP_SCRIPT"

echo ""
echo "=== VM created ==="
echo "Startup script will: install Docker + NVIDIA Container Toolkit, pull data from GCS."
echo "NVIDIA drivers + CUDA 12.8 + PyTorch 2.7 are pre-installed via DLVM image."
echo ""

# Open firewall for port 8000
gcloud compute firewall-rules create allow-sandbox-8000 \
    --project="$PROJECT" \
    --allow=tcp:8000 \
    --target-tags=sandbox-server \
    --description="Allow traffic to sandbox test server" \
    2>/dev/null || echo "Firewall rule already exists"

echo "=== Waiting for startup script to complete... ==="
echo "(Checking /var/log/sandbox-setup-done every 30s, timeout 10min)"
echo ""

ELAPSED=0
while [ $ELAPSED -lt 600 ]; do
    if gcloud compute ssh "$INSTANCE" --zone="$ZONE" --project="$PROJECT" \
        --command="test -f /var/log/sandbox-setup-done" 2>/dev/null; then
        echo "Startup script completed!"
        break
    fi
    if gcloud compute ssh "$INSTANCE" --zone="$ZONE" --project="$PROJECT" \
        --command="test -f /var/log/sandbox-setup-failed" 2>/dev/null; then
        echo "ERROR: Startup script failed. Check logs:"
        echo "  gcloud compute ssh $INSTANCE --zone=$ZONE -- cat /var/log/sandbox-setup.log"
        exit 1
    fi
    echo "  Waiting... (${ELAPSED}s elapsed)"
    sleep 30
    ELAPSED=$((ELAPSED + 30))
done

if [ $ELAPSED -ge 600 ]; then
    echo "WARNING: Timeout waiting for startup script. Check logs:"
    echo "  gcloud compute ssh $INSTANCE --zone=$ZONE -- cat /var/log/sandbox-setup.log"
fi

echo ""
echo "=== Next steps ==="
echo ""
echo "1. Copy sandbox files to the VM:"
echo "   gcloud compute scp --recurse sandbox/ $INSTANCE:/opt/norgesgruppen/sandbox/ --zone=$ZONE"
echo ""
echo "2. SSH in and build + start:"
echo "   gcloud compute ssh $INSTANCE --zone=$ZONE"
echo "   cd /opt/norgesgruppen"
echo "   sudo docker build -t nmiai/norgesgruppen-sandbox -f sandbox/Dockerfile sandbox/"
echo "   sudo docker compose -f sandbox/docker-compose.yml up -d"
echo ""

EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE" \
    --zone="$ZONE" --project="$PROJECT" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null || echo "pending")

echo "3. Test:"
echo "   ./sandbox/submit_client.sh submission.zip http://$EXTERNAL_IP:8000"
