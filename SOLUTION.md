# NorgesGruppen Object Detection — Solution Write-up

**Team:** Team PH 
**Competition Score:** 0.9266
**Approach:** YOLOv8 ensemble with multi-scale TTA and Weighted Boxes Fusion

---

## Overview

Our solution uses an ensemble of three YOLOv8 models with horizontal flip test-time augmentation (TTA) and multi-scale inference, fused using Weighted Boxes Fusion (WBF). All models were trained on the full 248-image dataset with no validation holdout.

## Models

| Model | Architecture | Input Size | Precision | Size | Seed |
|-------|-------------|-----------|-----------|------|------|
| Primary | YOLOv8l | 1280 | FP32 | 169 MB | 0 |
| Secondary | YOLOv8m | 1280 | FP32 | 101 MB | 0 |
| Diversity | YOLOv8l | 960 | FP16 | 85 MB | 42 |

**Total weight size:** 355 MB / 420 MB limit

The ensemble gets its strength from three types of diversity:
1. **Architecture diversity** — L (44M params) vs M (26M params) learn different feature representations
2. **Scale diversity** — 1280px vs 960px captures objects at different effective resolutions
3. **Seed diversity** — Same architecture trained with different random initialization makes different errors

## Training

All models use identical training configuration:

```
Framework: ultralytics (latest for training, ONNX export for inference)
Base weights: COCO pretrained (yolov8l.pt / yolov8m.pt)
Epochs: 120
Image size: 1280
Optimizer: AdamW (lr0=0.001, lrf=0.01, weight_decay=0.0005)
Warmup: 5 epochs
Label smoothing: 0.05
Dropout: 0.1
Cosine LR: yes
Mosaic: 0.1
Close mosaic: 20 (disable mosaic for last 20 epochs)
Patience: 0 (no early stopping — fixed 120 epochs)
Full-train: all 248 images used for both train and val
```

Training was done on 4x A100 40GB GPUs using DDP (multi-GPU), taking ~30 minutes per model. Single-GPU training with seed=42 took ~2 hours.

### Key Training Decisions

**Full-train (no holdout):** With only 248 images, every image matters. We use all images for training and set val=train for checkpoint selection. The risk of overfitting is managed by the short training duration (120 epochs) and moderate augmentation.

**Low mosaic (0.1):** Counter-intuitively, lower mosaic augmentation generalized better than higher values. We tested mosaic=0.3 with 200 epochs which scored higher on our local sandbox but significantly worse on the competition server. The training data's distribution is close to the test data, so heavy augmentation adds noise rather than useful variety.

**120 epochs, not more:** Longer training (200 epochs) memorized the training data. The 120-epoch models generalized better to unseen test images.

### What Didn't Work

| Approach | Why It Failed |
|----------|--------------|
| 200 epochs + mosaic=0.3 | Overfit — higher local score but lower competition score |
| cls_weight=1.0 | Overfit classification — same pattern as above |
| YOLOv8x | Larger model overfit on 248 images |
| Product reference images as training data | Domain gap between clean product shots and cluttered shelf photos |
| SAHI tiled inference | Tile boundary artifacts hurt precision |
| RT-DETR | Too slow for 300s inference timeout |

## Inference Pipeline

```
For each image:
  1. Run YOLOv8l@1280 (original + horizontal flip) → 2 prediction sets
  2. Run YOLOv8m@1280 (original + horizontal flip) → 2 prediction sets
  3. Run YOLOv8l@960 seed=42 (original only, no flip) → 1 prediction set
  4. Normalize all boxes to [0,1] range
  5. Merge all 5 prediction sets using Weighted Boxes Fusion
  6. Convert back to COCO format
```

**Runtime:** ~285 seconds on NVIDIA L4 GPU (300s limit)

### Weighted Boxes Fusion

We use the `ensemble_boxes` library (pre-installed in the sandbox) with default parameters:

```python
from ensemble_boxes import weighted_boxes_fusion

merged_boxes, merged_scores, merged_labels = weighted_boxes_fusion(
    all_boxes, all_scores, all_labels,
    iou_thr=0.55,
    skip_box_thr=0.01,
)
```

WBF is strictly better than NMS for ensembles because it averages box coordinates rather than just picking the highest-confidence one. A detection confirmed by multiple models gets a position that's the weighted average of all predictions — more accurate than any single model.

### Multi-scale via Separate ONNX Models

Since the sandbox uses ultralytics 8.1.0 (which doesn't support dynamic ONNX input sizes efficiently), we export separate ONNX models at different fixed resolutions. Each model reads its baked-in input size from the ONNX metadata:

```python
import onnxruntime as ort
sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
imgsz = sess.get_inputs()[0].shape[2]  # reads 1280 or 960
```

### Horizontal Flip TTA

For each model (except the 3rd to save time), we run inference twice:
1. Original image
2. Horizontally flipped image → flip detected boxes back

This catches objects that the model might miss due to directional biases in the training data.

## ONNX Export

We train with the latest ultralytics (8.4+) for proper multi-GPU DDP support, then export to ONNX for sandbox compatibility (which runs ultralytics 8.1.0):

```python
from ultralytics import YOLO
model = YOLO("best.pt")
model.export(format="onnx", imgsz=1280, opset=17, simplify=True, half=False)
```

For the FP16 model: `half=True` halves the file size with negligible quality loss.

## Data Preparation

We used the provided COCO dataset as-is with a stratified train/val split for initial experimentation, then switched to full-train for the final models. The `prepare_data.py` script converts COCO annotations to YOLO format with symlinks to avoid duplicating images.

The product reference images (`NM_NGD_product_images.zip`) were explored but ultimately not used — the domain gap between clean product shots and cluttered shelf images hurt rather than helped.

## Infrastructure

- **Training:** GCP VM with 4x A100 40GB GPUs (or single GPU for seed variants)
- **Testing:** Self-hosted sandbox server mimicking competition environment (L4 GPU, 300s timeout)
- **Orchestration:** Custom `gcp-train.sh` script for remote training, monitoring, and weight management

## Score Progression

| Milestone | Sandbox | Competition |
|-----------|---------|-------------|
| Single YOLOv8l (baseline) | 0.796 | — |
| + conf tuning + flip TTA | 0.832 | — |
| + stratified split + full-train | 0.848 | — |
| + L+M ensemble | 0.855 | 0.925 |
| + multi-scale (L@960) | 0.856 | 0.926 |
| + seed diversity (L_seed42@960) | 0.857 | **0.927** |

**Important finding:** Our local sandbox scores did NOT correlate well with competition scores. Models that scored higher locally sometimes scored lower on competition. The simpler training configs (120ep, mosaic=0.1) generalized better than aggressive augmentation (200ep, mosaic=0.3).

## Files

```
src/run.py              # Inference entry point (ensemble + TTA + WBF)
training/train.py       # YOLOv8 training script
training/prepare_data.py # COCO → YOLO format conversion
package.sh              # Submission zip builder
scripts/gcp-train.sh    # GCP training orchestration
```

## Reproduction

```bash
# 1. Prepare data (full-train mode)
python training/prepare_data.py --coco assets/NM_NGD_coco_dataset/train --output data/yolo --full-train

# 2. Train models
python training/train.py --data data/yolo/dataset.yaml --model l --epochs 120 --imgsz 1280 --batch 16 --name l-model --device 0 --export-onnx --label-smoothing 0.05 --dropout 0.1 --cos-lr --close-mosaic 20 --patience 0 --mosaic 0.1

python training/train.py --data data/yolo/dataset.yaml --model m --epochs 120 --imgsz 1280 --batch 16 --name m-model --device 0 --export-onnx --label-smoothing 0.05 --dropout 0.1 --cos-lr --close-mosaic 20 --patience 0 --mosaic 0.1

python training/train.py --data data/yolo/dataset.yaml --model l --epochs 120 --imgsz 1280 --batch 16 --name l-seed42 --device 0 --export-onnx --label-smoothing 0.05 --dropout 0.1 --cos-lr --close-mosaic 20 --patience 0 --mosaic 0.1 --seed 42

# 3. Export L_seed42 at 960px FP16 (re-export after training)
python -c "
from ultralytics import YOLO
model = YOLO('runs/train/l-seed42/weights/best.pt')
model.export(format='onnx', imgsz=960, opset=17, simplify=True, half=True)
"

# 4. Package
./package.sh runs/train/l-model/weights/best.onnx runs/train/m-model/weights/best.onnx runs/train/l-seed42/weights/best.onnx
```
