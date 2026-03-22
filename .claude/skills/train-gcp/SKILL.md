---
name: train-gcp
description: >-
  Launch and manage YOLOv8 training on the dedicated GCP training VM (nmiai-train).
  Handles VM setup, data prep, Docker-based training on 4x A100 GPUs, monitoring,
  and weight retrieval. Use when: "train on GCP", "start training", "remote training",
  "GPU training", "check training", "get weights", "training status", "pull weights",
  "training progress", "how is training going".
---

# GCP Training Pipeline

Train YOLOv8 models on a dedicated GCP VM (a2-highgpu-8g, 8x A100 40GB GPUs, 96 vCPU, 680 GB RAM).
All training runs inside Docker containers via `scripts/gcp-train.sh`.

## Prerequisites

- `gcloud` CLI authenticated with A100 GPU quota (training in asia-southeast1-c)
- Training data uploaded to `gs://nmiai-norgesgruppen-data/`
- No local GPU required — all training runs remotely

## Quick Reference

| Command | Description |
|---------|-------------|
| `scripts/gcp-train.sh create` | Create VM (a2-highgpu-8g, 8x A100) + build Docker image + sync code |
| `scripts/gcp-train.sh setup` | (Re)build Docker image + sync code (idempotent) |
| `scripts/gcp-train.sh prepare` | Convert COCO → YOLO format on VM (in Docker container) |
| `scripts/gcp-train.sh sync` | Push local `src/`, training scripts + Dockerfile to VM |
| `scripts/gcp-train.sh train [args]` | Launch training in Docker container |
| `scripts/gcp-train.sh status` | Container status, all 4 GPUs, list runs |
| `scripts/gcp-train.sh progress [name]` | Formatted metrics table from results.csv |
| `scripts/gcp-train.sh logs [name]` | Tail training container logs (Ctrl+C to detach) |
| `scripts/gcp-train.sh pull <name>` | Download weights to local `runs/train/<name>/weights/` |
| `scripts/gcp-train.sh tensorboard` | Launch TensorBoard container on port 6006 |
| `scripts/gcp-train.sh stop` | Stop VM (pause billing, keep disk) |
| `scripts/gcp-train.sh start` | Start VM + wait for SSH |
| `scripts/gcp-train.sh destroy` | Delete training VM (confirmation required) |
| `scripts/gcp-train.sh push-gcs <name>` | Zip & upload entire run to GCS |
| `scripts/gcp-train.sh list-gcs` | List uploaded runs in GCS |
| `scripts/gcp-train.sh pull-gcs <zip-name>` | Download run zip from GCS to local |
| `scripts/gcp-train.sh ssh` | SSH into the VM |

## First-Time Setup

```bash
scripts/gcp-train.sh create    # provisions VM, builds Docker image, syncs code
scripts/gcp-train.sh prepare   # converts COCO → YOLO on VM (in Docker)
```

This is idempotent — safe to re-run. If the VM already exists, it skips creation
and just ensures the Docker image is built and code is synced.

## Training Iteration Loop

```bash
# 1. Push code changes to VM
scripts/gcp-train.sh sync

# 2. Launch training (uses 4 L4s by default)
scripts/gcp-train.sh train --model m --epochs 100 --name exp01

# 3. Monitor
scripts/gcp-train.sh progress exp01    # metrics summary
scripts/gcp-train.sh logs exp01        # live log stream
scripts/gcp-train.sh tensorboard       # graphical monitoring (port 6006)

# 4. Download weights when done
scripts/gcp-train.sh pull exp01

# 5. Optionally zip & upload entire run to GCS for safekeeping
scripts/gcp-train.sh push-gcs exp01

# List/download archived runs from GCS
scripts/gcp-train.sh list-gcs
scripts/gcp-train.sh pull-gcs exp01_20260320-011500.zip

# 6. Package submission
./package.sh runs/train/exp01/weights/best.pt
```

### Train arguments

| Arg | Default | Description |
|-----|---------|-------------|
| `--model` | `m` | YOLOv8 variant: n/s/m/l/x |
| `--epochs` | `100` | Training epochs |
| `--batch` | `16` | Batch size |
| `--imgsz` | `640` | Input image size |
| `--name` | `norgesgruppen` | Experiment name |
| `--device` | `0,1,2,3` | CUDA devices (multi-GPU DDP, max 4 on L4) |
| `--resume` | off | Resume from last checkpoint |

## Monitoring

- **`progress [name]`**: Parses `results.csv`, shows best mAP50, last 10 epochs formatted.
  Defaults to latest run if name omitted.
- **`status`**: Quick overview — container running/stopped, nvidia-smi for all GPUs, run listing.
- **`logs [name]`**: Docker container logs. Ctrl+C to detach.
- **`tensorboard`**: Launches TensorBoard in a separate container on port 6006.

## VM Lifecycle

```bash
scripts/gcp-train.sh stop      # pause billing (disk charges still apply)
scripts/gcp-train.sh start     # resume VM
scripts/gcp-train.sh destroy   # delete training VM
```

## Experiment Naming

Use descriptive names for tracking experiments:

```bash
scripts/gcp-train.sh train --model m --epochs 100 --name baseline-m-100ep
scripts/gcp-train.sh train --model l --epochs 150 --imgsz 1280 --name large-1280-150ep
scripts/gcp-train.sh train --model m --epochs 50 --name resume-exp --resume
scripts/gcp-train.sh train --model x --epochs 200 --device 0,1 --name xlarge-2gpu
```

## Configuration

Override defaults via environment variables:

```bash
INSTANCE=nmiai-train      # VM name (default)
ZONE=asia-southeast1-c    # GCP zone (default)
PROJECT=my-project        # GCP project (default: gcloud config)
```

## Troubleshooting

- **GPU quota error**: Need A100 GPUs. Current VMs in asia-southeast1-c / asia-southeast1-a.
- **OOM during training**: Reduce `--batch` (try 8 or -1 for auto) or `--imgsz`.
- **NVIDIA driver issues**: The setup script installs prebuilt kernel modules.
  If `nvidia-smi` fails, try rebooting: `scripts/gcp-train.sh ssh -- sudo reboot`
- **Container exited**: Check `scripts/gcp-train.sh logs` for error details.
- **Code not updated**: Always `sync` before `train` to push latest `src/` + `training/` changes.
