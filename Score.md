# Score Tracking

Scoring formula: `0.7 * detection_mAP@0.5 + 0.3 * classification_mAP@0.5`

| Run | Model | GPUs | Epochs | imgsz | Det mAP | Cls mAP | Sandbox | Competition | Preds | Pred Score | Time | Notes |
|-----|-------|------|--------|-------|---------|---------|---------|-------------|-------|------------|------|-------|
| onnx-l-1280_20260320-092009 | YOLOv8l | 1x L4 | - | 1280 | 0.8101 | 0.7636 | 0.7961 | - | 24750 | 0.7961 | 65s | First ONNX submission |
| l-4gpu-200ep_20260320-152554 | YOLOv8l | 4x A100 | 103 (early stop) | 1280 | 0.8109 | 0.7946 | 0.8060 | - | 25173 | 0.8060 | 63s | Best so far |
| x-4gpu-200ep_20260320-155001 | YOLOv8x | 4x A100 | - | 1280 | 0.7950 | 0.7117 | 0.7700 | - | 26611 | 0.7700 | 67s | Overfit, worse than l |
| l-perspective-200ep_20260320-164442 | YOLOv8l | 4x A100 | - | 1280 | 0.8112 | 0.7862 | 0.8037 | - | 25694 | 0.8037 | 65s | Perspective aug, no improvement |
| l-tuned-200ep_20260320-182925 | YOLOv8l | 4x A100 | - | 1280 | 0.8095 | 0.7520 | 0.7922 | - | 27098 | 0.7922 | 64s | Tuned hyperparams, cls dropped |
| l-reg-200ep_20260320-194516 | YOLOv8l | 4x A100 | 158 (early stop) | 1280 | 0.8205 | 0.8394 | 0.8262 | - | 28405 | 0.8262 | 69s | label_smooth=0.05, dropout=0.1, cos_lr, conf=0.05, iou=0.5 |
| l-reg-200ep (conf=0.01) | YOLOv8l | 4x A100 | 158 (early stop) | 1280 | 0.8205 | 0.8439 | 0.8276 | - | 37711 | 0.8276 | 74s | Same weights, conf=0.01, iou=0.5 |
| l-reg-200ep + flip TTA | YOLOv8l | 4x A100 | 158 (early stop) | 1280 | 0.8218 | 0.8558 | 0.8320 | - | 44298 | 0.8320 | 123s | Horizontal flip TTA + WBF fusion |
| l-stratified-200ep_20260321-003757 | YOLOv8l | 4x A100 | 200 (109 best) | 1280 | 0.8252 | 0.8822 | 0.8423 | - | 38189 | 0.8423 | 129s | Stratified split + flip TTA |
| l-fulltrain-120ep_20260321-010448 | YOLOv8l | 4x A100 | 120 (full-train) | 1280 | 0.8384 | 0.8718 | 0.8484 | - | 39090 | 0.8484 | 124s | Full-train (248 imgs) + flip TTA |
| l+m ensemble (fulltrain) | YOLOv8l+m | 4x A100 | 120 (full-train) | 1280 | 0.8395 | 0.8923 | 0.8554 | 0.9252 | 51122 | 0.8554 | 206s | L(169MB)+M(101MB) ensemble + flip TTA + WBF |
| l+m FP16 ensemble | YOLOv8l+m | 4x A100 | 120 (full-train) | 1280 | 0.8395 | 0.8922 | 0.8553 | - | 51162 | 0.8553 | 238s | FP16: L(85MB)+M(51MB) = 136MB. Same quality |
| l+m+s FP16 ensemble | YOLOv8l+m+s | 4x A100 | 120 (full-train) | 1280 | 0.8395 | 0.8946 | 0.8561 | - | 62060 | 0.8561 | 293s | FP16: L(85)+M(51)+S(22)=158MB. S no flip TTA |
| l-v2 solo FP16 | YOLOv8l | 4x A100 | 200 (full-train) | 1280 | 0.8408 | 0.9497 | 0.8735 | - | 33570 | 0.8735 | 136s | mosaic=0.3, close_mosaic=40, 200ep. FP16 85MB |
| l-v2+m FP16 ensemble | YOLOv8l+m | 4x A100 | 200+120 (full-train) | 1280 | 0.8407 | 0.9471 | 0.8726 | - | 47791 | 0.8726 | 236s | Old M hurts cls |
| l-v2+m+s FP16 ensemble | YOLOv8l+m+s | 4x A100 | 200+120+120 | 1280 | 0.8406 | 0.9467 | 0.8724 | - | 59394 | 0.8724 | 300s | Old M+S hurt cls, near timeout |
| l-v2+m-v2 FP16 ensemble | YOLOv8l+m | 4x A100 | 200+200 (full-train) | 1280 | 0.8411 | 0.9582 | 0.8762 | - | 43591 | 0.8762 | 205s | Both v2 (mosaic=0.3, 200ep). FP16: 85+51=136MB |
| l-cls1.0 solo FP16 | YOLOv8l | 4x A100 | 200 (full-train) | 1280 | 0.8507 | 0.9622 | 0.8842 | - | 30342 | 0.8842 | 153s | cls_weight=1.0, mosaic=0.3, 200ep |
| l-cls1.0+m-v2 FP16 ensemble | YOLOv8l+m | 4x A100 | 200+200 (full-train) | 1280 | 0.8506 | 0.9687 | 0.8860 | 0.9184 | 41408 | 0.8860 | 272s | L(cls=1.0)+M(cls=0.5), mosaic=0.3, 200ep |
| l-cls1.0+m-cls1.0 FP16 ensemble | YOLOv8l+m | 4x A100 | 200+200 (full-train) | 1280 | 0.8510 | 0.9650 | 0.8852 | - | 37063 | 0.8852 | 290s | Both cls=1.0. Less diverse, slightly worse |
| L@1280+M+L@960 (multi-scale) | YOLOv8l+m+l | 4x A100 | 120 (full-train) | 1280+960 | 0.8397 | 0.8947 | 0.8562 | 0.9261 | 55598 | 0.8562 | 239s | L FP32 + M FP32 + L@960 FP16. Multi-scale TTA |
| L@1280+M+L_seed42@960 | YOLOv8l+m+l | 4x A100 | 120 (full-train) | 1280+960 | 0.8396 | 0.8981 | 0.8572 | 0.9266 | 56938 | 0.8572 | 285s | Seed+scale diversity. **Competition best** |
