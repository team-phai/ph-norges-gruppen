#!/usr/bin/env python3
"""Sweep inference hyperparameters (conf, iou) to find optimal values.

Two modes:
  1. Post-hoc confidence sweep (no GPU needed):
     Filters existing predictions.json by score threshold and evaluates.

  2. Full sweep (requires GPU + model):
     Re-runs inference with different conf/iou combos and evaluates each.

Usage:
  # Post-hoc sweep on existing predictions (fast, no GPU)
  python scripts/sweep_inference.py --posthoc \
      --predictions predictions.json \
      --annotations assets/NM_NGD_coco_dataset/train/annotations.json

  # Full sweep (requires GPU)
  python scripts/sweep_inference.py \
      --model runs/train/l-4gpu-200ep_20260320-152554/weights/best.onnx \
      --images assets/NM_NGD_coco_dataset/train/images \
      --annotations assets/NM_NGD_coco_dataset/train/annotations.json
"""

import argparse
import json
import itertools
from pathlib import Path

from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval


def evaluate_predictions(preds: list, annotations_path: Path) -> dict:
    """Score predictions using the competition formula."""
    if not preds:
        return {"detection_mAP": 0.0, "classification_mAP": 0.0, "score": 0.0}

    import copy
    coco_gt = COCO(str(annotations_path))

    # Classification mAP (category-aware)
    coco_dt_cls = coco_gt.loadRes(preds)
    eval_cls = COCOeval(coco_gt, coco_dt_cls, "bbox")
    eval_cls.params.maxDets = [100, 300, 1000]
    eval_cls.evaluate()
    eval_cls.accumulate()
    eval_cls.summarize()
    classification_mAP = eval_cls.stats[1]  # mAP@IoU=0.50

    # Detection mAP (category-agnostic)
    single = COCO()
    dataset = copy.deepcopy(coco_gt.dataset)
    dataset["categories"] = [{"id": 1, "name": "product", "supercategory": "product"}]
    for ann in dataset["annotations"]:
        ann["category_id"] = 1
    single.dataset = dataset
    single.createIndex()

    single_preds = [{**p, "category_id": 1} for p in preds]
    coco_dt_det = single.loadRes(single_preds)
    eval_det = COCOeval(single, coco_dt_det, "bbox")
    eval_det.params.maxDets = [100, 300, 1000]
    eval_det.evaluate()
    eval_det.accumulate()
    eval_det.summarize()
    detection_mAP = eval_det.stats[1]  # mAP@IoU=0.50

    score = 0.7 * detection_mAP + 0.3 * classification_mAP
    return {
        "detection_mAP": detection_mAP,
        "classification_mAP": classification_mAP,
        "score": score,
        "num_preds": len(preds),
    }


def posthoc_sweep(predictions_path: Path, annotations_path: Path):
    """Sweep confidence thresholds by filtering existing predictions."""
    with open(predictions_path) as f:
        all_preds = json.load(f)

    print(f"Loaded {len(all_preds)} predictions")
    print(f"Score range: [{min(p['score'] for p in all_preds):.3f}, {max(p['score'] for p in all_preds):.3f}]")
    print()

    conf_thresholds = [0.01, 0.03, 0.05, 0.08, 0.10, 0.12, 0.15, 0.20, 0.25, 0.30]

    results = []
    header = f"{'conf':>6}  {'preds':>7}  {'det_mAP':>8}  {'cls_mAP':>8}  {'score':>8}"
    print(header)
    print("-" * len(header))

    for conf in conf_thresholds:
        filtered = [p for p in all_preds if p["score"] >= conf]
        r = evaluate_predictions(filtered, annotations_path)
        r["conf"] = conf
        results.append(r)
        print(f"{conf:>6.2f}  {r['num_preds']:>7}  {r['detection_mAP']:>8.4f}  {r['classification_mAP']:>8.4f}  {r['score']:>8.4f}")

    best = max(results, key=lambda r: r["score"])
    print(f"\nBest: conf={best['conf']:.2f} → score={best['score']:.4f} "
          f"(det={best['detection_mAP']:.4f}, cls={best['classification_mAP']:.4f}, preds={best['num_preds']})")


def full_sweep(model_path: Path, images_dir: Path, annotations_path: Path,
               conf_filter: float | None = None, device_id: str = "cuda"):
    """Full sweep re-running inference with different conf/iou combos."""
    import torch
    from ultralytics import YOLO

    device = device_id if torch.cuda.is_available() else "cpu"
    model = YOLO(str(model_path))

    images = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    print(f"Model: {model_path}")
    print(f"Images: {len(images)}")
    print(f"Device: {device}")
    print()

    all_conf_values = [0.01, 0.02, 0.03, 0.05, 0.08, 0.10, 0.15]
    iou_values = [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65]

    conf_values = [conf_filter] if conf_filter is not None else all_conf_values

    results = []
    header = f"{'conf':>6}  {'iou':>5}  {'preds':>7}  {'det_mAP':>8}  {'cls_mAP':>8}  {'score':>8}"
    print(header)
    print("-" * len(header))

    for conf, iou in itertools.product(conf_values, iou_values):
        predictions = []
        for img_path in images:
            image_id = int(img_path.stem.split("_")[-1])
            res = model(str(img_path), device=device, verbose=False, conf=conf, iou=iou, imgsz=1280)
            for r in res:
                if r.boxes is None:
                    continue
                for i in range(len(r.boxes)):
                    x1, y1, x2, y2 = r.boxes.xyxy[i].tolist()
                    predictions.append({
                        "image_id": image_id,
                        "category_id": int(r.boxes.cls[i].item()),
                        "bbox": [round(x1, 1), round(y1, 1), round(x2 - x1, 1), round(y2 - y1, 1)],
                        "score": round(float(r.boxes.conf[i].item()), 3),
                    })

        r = evaluate_predictions(predictions, annotations_path)
        r["conf"] = conf
        r["iou"] = iou
        results.append(r)
        print(f"{conf:>6.2f}  {iou:>5.2f}  {r['num_preds']:>7}  {r['detection_mAP']:>8.4f}  {r['classification_mAP']:>8.4f}  {r['score']:>8.4f}")

    best = max(results, key=lambda r: r["score"])
    print(f"\nBest: conf={best['conf']:.2f}, iou={best['iou']:.2f} → score={best['score']:.4f} "
          f"(det={best['detection_mAP']:.4f}, cls={best['classification_mAP']:.4f}, preds={best['num_preds']})")

    # Save full results
    output = Path("sweep_results.json")
    with open(output, "w") as f:
        json.dump(sorted(results, key=lambda r: -r["score"]), f, indent=2)
    print(f"\nFull results saved to {output}")


def main():
    parser = argparse.ArgumentParser(description="Sweep inference hyperparameters")
    parser.add_argument("--posthoc", action="store_true", help="Post-hoc confidence sweep (no GPU needed)")
    parser.add_argument("--predictions", type=Path, help="Path to predictions.json (for --posthoc)")
    parser.add_argument("--model", type=Path, help="Path to model (.onnx or .pt) for full sweep")
    parser.add_argument("--images", type=Path, help="Path to images directory for full sweep")
    parser.add_argument("--annotations", type=Path, required=True, help="Path to COCO annotations.json")
    parser.add_argument("--conf", type=float, default=None, help="Single conf value (for parallel runs)")
    parser.add_argument("--device", type=str, default="cuda", help="Device — e.g. 'cuda:0', 'cuda:3'")
    args = parser.parse_args()

    if args.posthoc:
        if not args.predictions:
            parser.error("--predictions required for --posthoc mode")
        posthoc_sweep(args.predictions, args.annotations)
    else:
        if not args.model or not args.images:
            parser.error("--model and --images required for full sweep mode")
        full_sweep(args.model, args.images, args.annotations,
                   conf_filter=args.conf, device_id=args.device)


if __name__ == "__main__":
    main()
