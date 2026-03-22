# Score Improvement TODO

Current best: **0.8554** (det=0.8395, cls=0.8923) — L+M ensemble + flip TTA + WBF
Target: **0.87–0.88**

---

## Phase 1: No Retraining (immediate, parallel)

### 1.1 WBF Parameter Sweep — DONE (no improvement)
- [x] Test WBF IoU thresholds: 0.45, 0.50, 0.55 (current), 0.60 — all within 0.0006
- [x] Test model weights + conf_type='box_and_model_avg' — 0.8553, no gain
- [x] Test skip_box_thr=0.005 — 0.8554, no change
- [x] Test NMS IoU: 0.4, 0.5 (current), 0.6 — no change
- **Conclusion**: Default params (WBF_IOU=0.55, NMS=0.5, conf=0.01) are already optimal

### 1.2 FP16 ONNX Export — DONE
- [x] Added `--half` flag to `cmd_export()` in `gcp-train.sh`
- [x] Re-exported L model: 169MB → 85MB
- [x] Re-exported M model: 101MB → 51MB
- [x] Total: 270MB → 136MB (freed **284MB** of weight budget)
- [x] Sandbox score: 0.8553 (vs 0.8554 FP32) — negligible drop
- **FP16 is now the baseline. 284MB free for more ensemble members.**

---

## Phase 2: Quick Training Runs (start after Phase 1 validated)

### 2.1 Train YOLOv8s (3rd ensemble member) — DONE
- [x] Trained YOLOv8s, 120 epochs, best mAP50=0.8489
- [x] Exported FP16 ONNX: 22MB
- [x] Updated run.py and package.sh for 3 models
- [x] 3-model ensemble (L+M+S): **0.8561** (cls=0.8946, +0.0024 cls boost)
- [x] Dropped flip TTA on S model (293s runtime, tight but fits)
- **L(85) + M(51) + S(22) = 158MB / 420MB, 262MB free**

### 2.2 Snapshot Ensemble — DONE (no improvement)
- [x] Tested L_v2 + M_v2 + L_old(120ep): 0.8761 (no gain over 0.8762)
- [x] Tested L_v2 + M_v2 + L_reg(val-split): 0.8760 (no gain)
- **Conclusion**: Old models don't add useful diversity to v2 ensemble

### 2.3 Retrain L+M with Better Augmentation (200 epochs) — DONE
- [x] Added `--mosaic` flag to train.py and gcp-train.sh
- [x] L_v2: 200ep, mosaic=0.3, close_mosaic=40, mAP50=0.9655 (vs old 0.9060)
- [x] M_v2: 200ep, mosaic=0.3, close_mosaic=40, mAP50=0.9433 (vs old 0.8925)
- [x] L_v2 solo: 0.8735 — massive cls boost (0.9497)
- [x] L_v2 + M_v2 ensemble: **0.8762** — new best
- **Higher mosaic + longer training was the single biggest improvement**

---

## Phase 3: Advanced (if Phases 1-2 don't reach target)

### 3.1 Higher Classification Loss Weight — DONE (big improvement!)
- [x] Added `--cls-weight` flag to train.py and gcp-train.sh
- [x] Trained L with cls=1.0: training mAP50=0.9700 (vs v2's 0.9655)
- [x] Solo sandbox: **0.8842** (det=0.8507, cls=0.9622) — det AND cls both improved!
- [x] L_cls1.0 + M_v2 ensemble: **0.8860** — new best
- **cls=1.0 is a clear win. Next: retrain M with cls=1.0 too**

### 3.2 SAHI Tiled Inference — DONE (no improvement, hurts score)
- [x] Implemented tiled inference in run.py
- [x] Tested L_cls1.0 + SAHI (>4000px): 0.8760 (vs 0.8842 without SAHI)
- **Conclusion**: Tile boundary artifacts + duplicates lower precision. Model trained on
  full images, not crops. Would need SAHI-aware training (not worth the complexity).

### 3.3 Product Reference Images — DONE (hurts score)
- [x] Built augment_with_products.py: maps 323/356 categories by name, 75 rare cats with images
- [x] Generated 340 synthetic images (product shots as full-image bboxes)
- [x] Trained L with augmented data (588 images): training mAP50=0.8936
- [x] Solo sandbox: 0.8632 (vs 0.8842 without aug) — cls dropped 0.9622→0.9173
- [x] Ensemble sandbox: 0.8699 (vs 0.8860 without aug) — still worse
- **Conclusion**: Product reference images have too much domain gap (clean product shots
  vs cluttered shelves). Would need copy-paste augmentation onto shelf backgrounds,
  not standalone product images.

### 3.4 RT-DETR Ensemble Member — ABANDONED (too slow)
- [x] Fixed train.py to accept RT-DETR model names
- [x] Launched RT-DETR-l training: epoch 1 train=16s, but validation took 11+ min (stuck)
- **Conclusion**: RT-DETR at 1280 is impractical — ~12 min/epoch (40+ hours for 200 epochs).
  Inference would also exceed 300s sandbox timeout on L4 GPU. Not viable.

---

## Execution Order

```
Phase 1.1 (WBF sweep)     ─┐
                            ├── parallel, no retraining
Phase 1.2 (FP16 export)   ─┘
         │
         ▼
Phase 2.1 (train YOLOv8s) ─┐
                            ├── parallel training + testing
Phase 2.2 (snapshot test)  ─┘
         │
         ▼
Phase 2.3 (retrain L+M 200ep with mosaic=0.3)
         │
         ▼
Phase 3 (only if needed)
```
