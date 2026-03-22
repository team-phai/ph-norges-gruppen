---
name: create-submission
description: >-
  Create a validated submission.zip for the NorgesGruppen object detection challenge.
  Packages run.py + ONNX model weights + optional helper files, validates against all competition
  constraints, and optionally tests on the local sandbox server. Use when: "create submission",
  "package submission", "make submission", "build zip", "submit", "package weights",
  "submission zip".
---

# Create Submission

Package a `submission.zip` for the NorgesGruppen object detection challenge.

## Zip Structure

All files at the root — no subdirectories:

```
submission.zip
├── run.py          # Required: entry point
├── model.onnx      # Model weights (ONNX format, exported from latest ultralytics)
└── utils.py        # Optional: helper code
```

The server executes: `python run.py --input /data/images --output /output/predictions.json`

## run.py Contract

`run.py` MUST:
- Accept `--input <dir>` (directory of JPEG shelf images) and `--output <path>` (where to write predictions JSON)
- Load ONNX model relative to itself: `Path(__file__).parent / "model.onnx"`
  - ultralytics 8.1.0 auto-detects ONNX format and uses onnxruntime-gpu for inference
- Write a JSON array of predictions in COCO format:
  ```json
  [{"image_id": 42, "category_id": 0, "bbox": [x, y, w, h], "score": 0.92}]
  ```
- NOT use blocked imports: os, sys, subprocess, socket, pickle, yaml, requests, urllib,
  multiprocessing, threading, eval, exec, `__import__`
- Use `pathlib` for file ops, `json` instead of `yaml`

## ONNX Workflow

Training uses latest ultralytics (>=8.3) for proper multi-GPU DDP support, then exports to ONNX:

```bash
# Train with latest ultralytics + auto ONNX export
scripts/gcp-train.sh train --model l --epochs 100 --name exp01 --export-onnx

# Or export separately after training
scripts/gcp-train.sh export exp01 --imgsz 1280

# Pull weights (includes .onnx)
scripts/gcp-train.sh pull exp01

# Package
./package.sh runs/train/exp01/weights/best.onnx
```

ONNX constraints:
- **opset <= 17** (safe for onnxruntime 1.20.0, which supports up to opset 20)
- **fp32** (half=False for maximum compatibility)
- **Fixed input size** at training imgsz (typically 1280)

## Constraints

| Constraint | Limit |
|-----------|-------|
| Uncompressed zip | 420 MB |
| Total files | 1,000 |
| Python files (.py) | 10 |
| Weight files (.pt/.pth/.onnx/.safetensors/.npy) | 3 |
| Total weight size | 420 MB |
| Allowed extensions | .py .json .yaml .yml .cfg .pt .pth .onnx .safetensors .npy |

## Sandbox Environment

- Python 3.11, NVIDIA L4 GPU (24 GB VRAM), 8 GB RAM, 300s timeout, **no network**
- Pre-installed: PyTorch 2.6.0+cu124, ultralytics 8.1.0, onnxruntime-gpu 1.20.0,
  torchvision 0.21.0, timm 0.9.12, opencv, albumentations, pillow, numpy, scipy,
  scikit-learn, pycocotools, supervision, safetensors
- **Cannot pip install at runtime**

### Version Compatibility (CRITICAL)

- **ultralytics 8.2+ weights FAIL on 8.1.0** — always export to ONNX
- **ONNX opset > 20 incompatible with onnxruntime 1.20.0** — use opset 17
- **TTA (augment=True) not supported with ONNX** in ultralytics 8.1.0

## Steps

### 1. Identify ONNX weights to package

Ask the user which weights to use if not specified. Check available runs:

```bash
ls -lh runs/train/*/weights/best.onnx 2>/dev/null
ls -lh runs/train/*/weights/best.pt 2>/dev/null
```

If only `.pt` exists, export to ONNX first:
```bash
scripts/gcp-train.sh export <name> --imgsz 1280
scripts/gcp-train.sh pull <name>
```

### 2. Verify run.py

Read `src/run.py` and check:

1. **CLI args**: Has `--input` (Path) and `--output` (Path) arguments
2. **Weight loading**: Loads from `Path(__file__).parent / "model.onnx"`
3. **Output format**: Writes JSON array with `image_id`, `category_id`, `bbox` [x,y,w,h], `score`
4. **No blocked imports**: No os, sys, subprocess, socket, pickle, yaml, etc.
5. **GPU handling**: Uses `torch.cuda.is_available()`
6. **No augment=True**: TTA not supported with ONNX inference

If anything is wrong, fix `src/run.py` before packaging.

### 3. Build the zip

Use the package script:

```bash
./package.sh runs/train/<experiment>/weights/best.onnx
```

Or manually:

```bash
STAGING=$(mktemp -d)
cp src/run.py "$STAGING/run.py"
cp runs/train/<experiment>/weights/best.onnx "$STAGING/model.onnx"
(cd "$STAGING" && zip -r "$OLDPWD/submission.zip" . -x ".*" "__MACOSX/*")
rm -rf "$STAGING"
```

### 4. Validate

```bash
python3 -c "
import zipfile
from pathlib import Path
zf = zipfile.ZipFile('submission.zip')
names = zf.namelist()
total = sum(i.file_size for i in zf.infolist())
weight_exts = {'.pt','.pth','.onnx','.safetensors','.npy'}
allowed = {'.py','.json','.yaml','.yml','.cfg'} | weight_exts
weights = sum(i.file_size for i in zf.infolist() if Path(i.filename).suffix in weight_exts)
py = sum(1 for n in names if n.endswith('.py'))
wc = sum(1 for n in names if Path(n).suffix in weight_exts)
bad = [n for n in names if Path(n).suffix and Path(n).suffix not in allowed]
nested = [n for n in names if '/' in n]
print(f'run.py at root: {\"run.py\" in names}')
print(f'Total: {total/1048576:.1f} MB / 420 MB')
print(f'Weights: {weights/1048576:.1f} MB / 420 MB ({wc} files, max 3)')
print(f'Python files: {py} / 10')
print(f'Total files: {len(names)} / 1000')
if bad: print(f'DISALLOWED: {bad}')
if nested: print(f'WARNING nested paths: {nested}')
if 'run.py' not in names: print('ERROR: run.py NOT at root!')
"
```

If any check fails, fix and re-package.

### 5. Optional: Test on sandbox server

```bash
# Direct (if port 8000 is reachable)
./sandbox/submit_client.sh submission.zip http://35.205.250.24:8000

# Via SSH tunnel (if on restricted network e.g. guest WiFi)
gcloud compute ssh nmiai-sandbox --zone=asia-southeast1-a -- -NL 8000:localhost:8000
./sandbox/submit_client.sh submission.zip http://localhost:8000
```

This saves `predictions.json` locally (COCO format, ~2 MB for ~25k detections) for visualization
in the dashboard's Predictions tab.

If you update `sandbox/server.py`, you must rebuild the Docker image on the VM:
```bash
gcloud compute scp sandbox/server.py nmiai-sandbox:/opt/norgesgruppen/sandbox/server.py --zone=asia-southeast1-a
gcloud compute ssh nmiai-sandbox --zone=asia-southeast1-a --command="cd /opt/norgesgruppen/sandbox && sudo docker compose build --no-cache server && sudo docker compose up -d server"
```

**Rate limit**: 3 real submissions/day. Always test on sandbox first (unlimited).

## Scoring

`0.7 * detection_mAP + 0.3 * classification_mAP` (mAP@0.5)

Detection-only (all `category_id: 0`) caps at 70%.
