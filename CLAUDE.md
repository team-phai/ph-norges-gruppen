# Agent Team Workflow

## Parallelizing Tasks

Use Claude Team Agent (`TeamCreate`) to coordinate parallel work across multiple agents.

### Team Setup

1. **Create a team** with `TeamCreate` — this creates the team and its shared task list
2. **Create tasks** using `TaskCreate` — break work into independent, parallelizable units
3. **Spawn teammates** using the `Agent` tool with `team_name` parameter

### Plan Before Executing

ALL agents (team lead and teammates) MUST plan before doing any implementation work:

1. **Outline your plan** — describe what you intend to do, which files you'll change, and your approach
2. **Send the plan** — teammates MUST send their plan to the team lead via `SendMessage` before writing any code
3. **Wait for acknowledgment** — do not begin implementation until the plan has been communicated
4. This applies to every task, not just the first one

### Teammate Configuration

- **Model**: Use the model defined in each agent's `.claude/agents/*.md` frontmatter (currently Opus 4.6 with 1M context)
- **Isolation**: Each teammate MUST work in its own **git worktree** — do NOT rely on `isolation: "worktree"` parameter as it is unreliable
- **Worktree creation**: Before spawning each teammate, manually create a worktree:
  ```bash
  git worktree add .claude/worktrees/<teammate-name> -b <teammate-name> HEAD
  ```
  Then instruct the teammate to `cd` into `.claude/worktrees/<teammate-name>` as its working directory.
- **Cleanup**: After a teammate completes, remove its worktree:
  ```bash
  git worktree remove .claude/worktrees/<teammate-name>
  ```

### Team Lead Responsibilities

1. **Plan first** — design the task breakdown before spawning any agents
2. **Create worktrees** — set up isolated worktrees in `.claude/worktrees/` for each teammate before spawning them
3. **Coordinate via task list** — use `TaskCreate`/`TaskUpdate`/`TaskList` for task assignment, not direct messages
4. **Merge results** — after teammates complete, merge their branches back and resolve conflicts
5. **Do not implement** — the lead coordinates, reviews, and merges; teammates do the implementation

# Contributing Guidelines

## Commits

All changes must use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`.

## Active Challenge

- **ID**: `norgesgruppen`
- **Type**: Object Detection / Computer Vision (offline ML)
- **InfoHub segment**: `norgesgruppen`
- **Docs**: `docs/challenge.md` (overview), `docs/rules.md` (full spec)
- **Submission**: Upload `.zip` with `run.py` + model weights to competition website
- **Scoring**: `0.7 × detection_mAP + 0.3 × classification_mAP` (mAP@0.5)
- **Sandbox**: Python 3.11, NVIDIA L4 GPU (24 GB VRAM), 8 GB RAM, 300s timeout, no network
- **Rate limit**: 3 submissions/day per team

## Data Layout

Training data is stored in `assets/` (gitignored):

```
assets/
├── NM_NGD_coco_dataset.zip          # Original zip (~864 MB)
├── NM_NGD_coco_dataset/
│   └── train/
│       ├── annotations.json         # COCO annotations (248 images, ~22,700 boxes, 357 categories)
│       └── images/                  # Shelf images (img_XXXXX.jpg)
├── NM_NGD_product_images.zip        # Original zip (~60 MB)
└── NM_NGD_product_images/           # 345 product folders by barcode
    └── {barcode}/                   # main.jpg, front.jpg, back.jpg, etc.
```

## GCS Bucket

Training data and model weights are stored in a GCS bucket for fast VM provisioning:

- **Bucket**: `gs://nmiai-norgesgruppen-data/`
- **Location**: `europe-west4`
- **Contents**:
  - `NM_NGD_coco_dataset.zip` — COCO shelf images + annotations (~864 MB)
  - `NM_NGD_product_images.zip` — Product reference images (~60 MB)
  - `runs/{name}_{timestamp}.zip` — Archived training runs (weights + metrics + plots)

### Pull data on a new VM

```bash
gsutil -m cp gs://nmiai-norgesgruppen-data/NM_NGD_coco_dataset.zip assets/
gsutil -m cp gs://nmiai-norgesgruppen-data/NM_NGD_product_images.zip assets/
cd assets && unzip NM_NGD_coco_dataset.zip && unzip NM_NGD_product_images.zip
```

## Training Runs

Training runs are stored in `runs/train/` with timestamped names: `{name}_{YYYYMMDD-HHMMSS}`.
Archived runs (zipped) go in `runs/archives/`.

```
runs/
├── train/                              # Active training runs
│   └── {name}_{YYYYMMDD-HHMMSS}/      # e.g. onnx-l-1280_20260320-092009/
│       ├── weights/                    # best.pt, last.pt, best.onnx
│       ├── results.csv                 # Epoch-by-epoch metrics
│       ├── args.yaml                   # Training hyperparameters
│       └── *.png, *.jpg                # Training plots
└── archives/                           # Zipped runs for safekeeping
    └── {name}_{YYYYMMDD-HHMMSS}.zip
```

## Source Code

```
src/
└── run.py                  # Sandbox inference entry point (packaged in submission zip)

training/
├── Dockerfile              # Training Docker image (CUDA 12.4 + Python 3.11 + tensorboard)
├── docker-compose.yml      # Reference compose file for local use
├── setup.sh                # GCP VM provisioning
├── train.py                # Fine-tune YOLOv8 on competition data
└── prepare_data.py         # Convert COCO → YOLO format with train/val split

sandbox/
├── evaluate.py             # Local scoring (mirrors competition formula)
├── submit.py               # Package & validate submission zip
├── server.py               # Submission endpoint (validate → docker run → score → return JSON)
└── ...                     # Dockerfiles, setup scripts, test data

package.sh                  # Bash script to create validated submission zip
```

### Workflow

```bash
# 1. Prepare YOLO dataset
python training/prepare_data.py --coco assets/NM_NGD_coco_dataset/train --output data/yolo

# 2. Train
python training/train.py --data data/yolo/dataset.yaml --model m --epochs 100

# 3. Evaluate locally
python sandbox/evaluate.py --predictions predictions.json --annotations assets/NM_NGD_coco_dataset/train/annotations.json

# 4. Package submission (either)
./package.sh runs/train/norgesgruppen/weights/best.pt
python sandbox/submit.py --weights runs/train/norgesgruppen/weights/best.pt

# 5. Test on sandbox server (unlimited, no rate limit)
#    Saves predictions.json locally for visualization
./sandbox/submit_client.sh submission.zip http://<server>:8000
```

### Remote Training (GCP)

Training runs on a dedicated `nmiai-train` VM (a2-highgpu-8g, 8x A100 40GB GPUs, asia-southeast1-c) via
`scripts/gcp-train.sh`. All training executes inside Docker containers for reproducibility.
Override zone with `ZONE=` env var. DDP limited to 4 GPUs due to ultralytics container limitations.

```
training/
├── Dockerfile          # Training image (CUDA 12.4 + Python 3.11 + sandbox packages + tensorboard)
├── docker-compose.yml  # Reference compose file for local use
├── setup.sh            # GCP VM provisioning (machine type configurable via MACHINE_TYPE env)
├── train.py            # Fine-tune YOLOv8 on competition data
└── prepare_data.py     # Convert COCO → YOLO format with train/val split
```

```bash
# One-time setup (dedicated training VM)
scripts/gcp-train.sh create     # provision VM + build Docker image + sync code
scripts/gcp-train.sh prepare    # COCO → YOLO conversion on VM (in Docker)

# Per-experiment loop
scripts/gcp-train.sh sync                                        # push src/ + training/ changes
scripts/gcp-train.sh train --model m --epochs 100 --name exp01  # launch training
scripts/gcp-train.sh progress exp01                              # metrics summary
scripts/gcp-train.sh logs exp01                                  # live log (Ctrl+C)
scripts/gcp-train.sh pull exp01                                  # download weights
scripts/gcp-train.sh push-gcs exp01                              # zip & upload run to GCS
scripts/gcp-train.sh list-gcs                                    # list uploaded runs in GCS
scripts/gcp-train.sh pull-gcs exp01_20260320-011500.zip          # download run zip from GCS
./package.sh runs/train/exp01/weights/best.pt                    # package submission

# VM lifecycle
scripts/gcp-train.sh stop       # pause billing
scripts/gcp-train.sh start      # resume
scripts/gcp-train.sh destroy    # delete training VM
```

All subcommands: `create`, `setup`, `prepare`, `sync`, `train`, `status`, `progress`,
`logs`, `pull`, `tensorboard`, `stop`, `start`, `destroy`, `push-gcs`, `list-gcs`, `pull-gcs`, `ssh`.

## VM Separation Policy

The **training VM** (`nmiai-train`) and **sandbox VM** (`nmiai-sandbox`) are separate VMs
with separate purposes. NEVER mix them:

- **`nmiai-train`**: Training only. Do not deploy sandbox server or submission infrastructure here.
- **`nmiai-sandbox`**: Submission testing only. Do not run training workloads here.

## Sandbox Test Server

Self-hosted server for testing submissions before burning a real one (3/day limit).
This is **submission infrastructure only** — NOT for training. Do not run training workloads
on the sandbox VM or modify sandbox files for training purposes. For training, use the
dedicated training VM.

```
sandbox/
├── Dockerfile              # Sandbox runner image (CUDA 12.4 + Python 3.11 + pinned packages)
├── Dockerfile.server       # FastAPI server image
├── server.py               # Submission endpoint (validate → docker run → score → return JSON)
├── docker-compose.yml      # Orchestration (server + Docker socket for spawning sandboxes)
├── requirements.server.txt # Server Python dependencies
├── setup.sh                # GCP VM provisioning (a2-highgpu-8g + 8x A100 40GB)
├── submit_client.sh        # Local convenience script for submitting
├── evaluate.py             # Local scoring (mirrors competition formula)
├── submit.py               # Package & validate submission zip
└── data/                   # Test images + annotations (copied to server)
    ├── annotations.json
    └── images/
```

### Local usage (if you have a GPU + Docker with nvidia-container-toolkit)

```bash
docker build -t nmiai/norgesgruppen-sandbox -f sandbox/Dockerfile sandbox/
docker compose -f sandbox/docker-compose.yml up -d
./sandbox/submit_client.sh submission.zip
```

### GCP deployment

```bash
./sandbox/setup.sh [instance-name] [zone] [project]
# Default: nmiai-sandbox in asia-southeast1-a
# Pulls data from gs://nmiai-norgesgruppen-data/ automatically
```

### GCP VM notes

- **NVIDIA drivers on GCP Ubuntu**: NEVER use `cuda-drivers-NNN` or `nvidia-dkms-NNN` packages.
  DKMS module compilation fails on GCP kernels (`6.8.0-*-gcp`) due to missing/mismatched headers.
  Use **prebuilt kernel modules** instead: `linux-modules-nvidia-NNN-$(uname -r)`.
- **Install order**: Install Docker BEFORE the NVIDIA driver. If the NVIDIA dkms package
  fails, it leaves dpkg in a broken state that blocks all subsequent `apt-get install` commands
  (including Docker). Docker has no dpkg risk and should go first.
- **Data transfer**: Use GCS (`gsutil`) not `gcloud compute scp` for large files. SCP from a
  local machine to a GCP VM is slow; GCS-to-VM transfers are fast (same-region bandwidth).
- **VM scopes**: Use `--scopes=storage-ro,default` to allow `gsutil` access from the VM.
- **Zone**: Training VM in `asia-southeast1-c`, sandbox VM in `asia-southeast1-a` (8x A100 40GB each).
- **Sandbox server updates**: `server.py` is baked into the Docker image. To deploy changes:
  `scp` the file to VM → `docker compose build --no-cache server` → `docker compose up -d server`
- **SSH tunnel**: If port 8000 is blocked (e.g. guest WiFi), use:
  `gcloud compute ssh nmiai-sandbox --zone=asia-southeast1-a -- -NL 8000:localhost:8000`
