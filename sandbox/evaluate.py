"""Local evaluation script — simulates competition scoring.

Computes the hybrid score: 0.7 * detection_mAP + 0.3 * classification_mAP (both @ IoU 0.5).
"""

import argparse
import json
from pathlib import Path

from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval


def evaluate(predictions_path: Path, annotations_path: Path) -> dict:
    """Evaluate predictions against COCO ground truth.

    Returns dict with detection_mAP, classification_mAP, and combined score.
    """
    with open(predictions_path) as f:
        preds = json.load(f)

    if not preds:
        print("No predictions found!")
        return {"detection_mAP": 0.0, "classification_mAP": 0.0, "score": 0.0}

    coco_gt = COCO(str(annotations_path))

    # --- Classification mAP (category-aware) ---
    coco_dt_cls = coco_gt.loadRes(preds)
    eval_cls = COCOeval(coco_gt, coco_dt_cls, "bbox")
    eval_cls.params.iouThrs = [0.5]
    eval_cls.params.maxDets = [100, 300, 1000]
    eval_cls.evaluate()
    eval_cls.accumulate()
    eval_cls.summarize()
    classification_mAP = eval_cls.stats[0]  # mAP@0.5

    # --- Detection mAP (category-agnostic) ---
    # Set all category_ids to 1 for both gt and predictions
    single_cat_gt = _make_single_category(coco_gt)
    single_cat_preds = [
        {**p, "category_id": 1} for p in preds
    ]
    coco_dt_det = single_cat_gt.loadRes(single_cat_preds)
    eval_det = COCOeval(single_cat_gt, coco_dt_det, "bbox")
    eval_det.params.iouThrs = [0.5]
    eval_det.params.maxDets = [100, 300, 1000]
    eval_det.evaluate()
    eval_det.accumulate()
    eval_det.summarize()
    detection_mAP = eval_det.stats[0]  # mAP@0.5

    score = 0.7 * detection_mAP + 0.3 * classification_mAP

    print(f"\n{'='*50}")
    print(f"  Detection mAP@0.5:       {detection_mAP:.4f}  (weight: 0.7)")
    print(f"  Classification mAP@0.5:  {classification_mAP:.4f}  (weight: 0.3)")
    print(f"  Combined Score:          {score:.4f}")
    print(f"{'='*50}")

    return {
        "detection_mAP": detection_mAP,
        "classification_mAP": classification_mAP,
        "score": score,
    }


def _make_single_category(coco_gt: COCO) -> COCO:
    """Create a copy of COCO ground truth with all annotations mapped to category_id=1."""
    import copy

    single = COCO()
    dataset = copy.deepcopy(coco_gt.dataset)
    dataset["categories"] = [{"id": 1, "name": "product", "supercategory": "product"}]
    for ann in dataset["annotations"]:
        ann["category_id"] = 1
    single.dataset = dataset
    single.createIndex()
    return single


def main():
    parser = argparse.ArgumentParser(description="Evaluate predictions locally")
    parser.add_argument("--predictions", type=Path, required=True, help="Path to predictions.json")
    parser.add_argument("--annotations", type=Path, required=True, help="Path to COCO annotations.json")
    args = parser.parse_args()

    evaluate(args.predictions, args.annotations)


if __name__ == "__main__":
    main()
