# NorgesGruppen Object Detection Challenge

**NM i AI 2026** | Team PH | Score: **0.9266** |

> NM i AI 2026 consisted of 3 separate challenges. This was our solution for the NorgesGruppen object detection challenge.

## The Challenge

Detect and classify grocery products on store shelf images from Norwegian grocery stores. Given shelf photos, predict bounding boxes and product category labels for every visible product.

**Scoring:** `0.7 * detection_mAP@0.5 + 0.3 * classification_mAP@0.5`

**Constraints:**
- 248 training images, ~22,700 annotations, 357 product categories
- Sandbox: NVIDIA L4 GPU, 8 GB RAM, 300s timeout, no network
- Max submission: 420 MB, 3 weight files

## Our Solution

A 3-model YOLOv8 ensemble with flip TTA and multi-scale inference, fused with Weighted Boxes Fusion.

```
Image → YOLOv8l@1280 (orig + flip)     ──┐
      → YOLOv8m@1280 (orig + flip)     ──┼── WBF fusion → predictions
      → YOLOv8l@960 seed=42 (orig only) ─┘
```

**5 inference passes per image, ~285s total runtime.**

### Why It Works

1. **Architecture diversity** — L (44M params) and M (26M params) learn different features
2. **Scale diversity** — 1280px and 960px catch objects at different effective sizes
3. **Seed diversity** — Same model trained twice with different random seeds makes different errors
4. **WBF** — Averages overlapping box positions (more accurate than any single model)

### Key Findings

- **Simple beats fancy**: 120 epochs with mosaic=0.1 outperformed 200 epochs with mosaic=0.3 on the competition server
- **Local scores are misleading**: Our highest local score (0.886) scored lower on competition (0.918) than our simpler model (local 0.855 → competition 0.925)
- **Full-train helps**: Using all 248 images for training (no holdout) was better than keeping a validation set
- **FP16 works**: Half-precision ONNX export halves model size with negligible quality loss

See [SOLUTION.md](SOLUTION.md) for the full technical write-up.

## Project Structure

```
src/run.py                  # Inference entry point (ensemble + TTA + WBF)
training/
  train.py                  # YOLOv8 training script
  prepare_data.py           # COCO → YOLO format conversion
  augment_with_products.py  # Product reference image augmentation (experimental)
  Dockerfile                # Training Docker image
scripts/
  gcp-train.sh              # GCP training VM orchestration
sandbox/
  server.py                 # Self-hosted test server
  evaluate.py               # Local scoring
  submit_client.sh          # Test submission client
package.sh                  # Submission zip builder
Score.md                    # Full score tracking
TODO.md                     # Improvement pipeline
```

## Quick Start

```bash
# 1. Prepare dataset
python training/prepare_data.py \
  --coco assets/NM_NGD_coco_dataset/train \
  --output data/yolo \
  --full-train

# 2. Train models
python training/train.py \
  --data data/yolo/dataset.yaml \
  --model l --epochs 120 --imgsz 1280 \
  --label-smoothing 0.05 --dropout 0.1 --cos-lr \
  --close-mosaic 20 --patience 0 --mosaic 0.1 \
  --name l-model --export-onnx

python training/train.py \
  --data data/yolo/dataset.yaml \
  --model m --epochs 120 --imgsz 1280 \
  --label-smoothing 0.05 --dropout 0.1 --cos-lr \
  --close-mosaic 20 --patience 0 --mosaic 0.1 \
  --name m-model --export-onnx

python training/train.py \
  --data data/yolo/dataset.yaml \
  --model l --epochs 120 --imgsz 1280 \
  --label-smoothing 0.05 --dropout 0.1 --cos-lr \
  --close-mosaic 20 --patience 0 --mosaic 0.1 \
  --name l-seed42 --seed 42 --export-onnx

# 3. Re-export seed42 model at 960px FP16
python -c "
from ultralytics import YOLO
model = YOLO('runs/train/l-seed42/weights/best.pt')
model.export(format='onnx', imgsz=960, opset=17, simplify=True, half=True)
"

# 4. Package submission
./package.sh \
  runs/train/l-model/weights/best.onnx \
  runs/train/m-model/weights/best.onnx \
  runs/train/l-seed42/weights/best.onnx
```

## GCP Training

For faster training on remote GPUs:

```bash
scripts/gcp-train.sh create          # Provision VM
scripts/gcp-train.sh prepare         # Convert data
scripts/gcp-train.sh train --model l --epochs 120 --name l-model --export-onnx
scripts/gcp-train.sh progress l-model # Monitor
scripts/gcp-train.sh pull l-model     # Download weights
```

## Score History

| Submission | Local | Competition |
|-----------|-------|-------------|
| Single YOLOv8l | 0.796 | — |
| L+M ensemble | 0.855 | 0.925 |
| L+M+L@960 multi-scale | 0.856 | 0.926 |
| L+M+L_seed42@960 | 0.857 | **0.927** |

## License

MIT — see [LICENSE](LICENSE).
