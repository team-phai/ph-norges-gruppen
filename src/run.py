"""Inference entry point for the NorgesGruppen object detection challenge.

Executed in sandbox as:
    python run.py --input /data/images --output /output/predictions.json

Sandbox: Python 3.11, NVIDIA L4 GPU (24 GB VRAM), 8 GB RAM, no network, 300s timeout.

Supports multi-model ensemble: if model2.onnx exists alongside model.onnx,
runs both models with flip TTA and fuses all predictions with WBF.
"""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import torch
from ensemble_boxes import weighted_boxes_fusion
from ultralytics import YOLO

# TTA: original + horizontal flip per model, fused with WBF
WBF_IOU_THR = 0.55
CONF_THR = 0.01
NMS_IOU_THR = 0.5


def _extract_dets(results):
    """Extract normalized boxes, scores, labels from YOLO results."""
    boxes, scores, labels = [], [], []
    img_w, img_h = None, None
    for r in results:
        if r.boxes is None or len(r.boxes) == 0:
            continue
        if img_w is None:
            img_h, img_w = r.orig_shape
        xyxy = r.boxes.xyxy.cpu().numpy()
        confs = r.boxes.conf.cpu().numpy()
        clss = r.boxes.cls.cpu().numpy()
        for i in range(len(xyxy)):
            x1, y1, x2, y2 = xyxy[i]
            boxes.append([
                max(0, x1 / img_w), max(0, y1 / img_h),
                min(1, x2 / img_w), min(1, y2 / img_h),
            ])
            scores.append(float(confs[i]))
            labels.append(int(clss[i]))
    arr_boxes = np.array(boxes) if boxes else np.zeros((0, 4))
    arr_scores = np.array(scores) if scores else np.zeros(0)
    arr_labels = np.array(labels, dtype=int) if labels else np.zeros(0, dtype=int)
    return arr_boxes, arr_scores, arr_labels, img_w, img_h


def _get_onnx_imgsz(model):
    """Get the baked-in input size from an ONNX model."""
    if hasattr(model, 'predictor') and model.predictor is not None:
        return model.predictor.imgsz
    # Fallback: read from ONNX session
    if hasattr(model, 'model') and hasattr(model.model, 'session'):
        inp = model.model.session.get_inputs()[0]
        return inp.shape[2]  # assumes square input
    return 1280  # default


def _run_model(model, img_path, img_bgr, device, flip_tta=True, imgsz=None):
    """Run a model with optional flip TTA."""
    if imgsz is None:
        imgsz = 1280
    results_orig = model(
        str(img_path), device=device, verbose=False,
        conf=CONF_THR, iou=NMS_IOU_THR, imgsz=imgsz,
    )
    boxes_orig, scores_orig, labels_orig, img_w, img_h = _extract_dets(results_orig)

    if img_w is None:
        img_h, img_w = img_bgr.shape[:2]

    dets = [(boxes_orig, scores_orig, labels_orig)]

    if flip_tta:
        img_flip = cv2.flip(img_bgr, 1)
        results_flip = model(
            img_flip, device=device, verbose=False,
            conf=CONF_THR, iou=NMS_IOU_THR, imgsz=imgsz,
        )
        boxes_flip, scores_flip, labels_flip, _, _ = _extract_dets(results_flip)

        if len(boxes_flip) > 0:
            x1 = 1.0 - boxes_flip[:, 2]
            x2 = 1.0 - boxes_flip[:, 0]
            boxes_flip[:, 0] = x1
            boxes_flip[:, 2] = x2

        dets.append((boxes_flip, scores_flip, labels_flip))

    return dets, img_w, img_h


def predict(input_dir: Path, output_path: Path):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    base = Path(__file__).parent

    # Load models — supports single, dual, or triple-model ensemble
    model_paths = [base / "model.onnx"]
    for i in range(2, 4):
        p = base / f"model{i}.onnx"
        if p.exists():
            model_paths.append(p)

    models = [YOLO(str(p)) for p in model_paths]

    # Detect each model's baked-in input size from ONNX metadata
    model_imgsz = []
    for p in model_paths:
        import onnxruntime as ort
        sess = ort.InferenceSession(str(p), providers=["CPUExecutionProvider"])
        inp_shape = sess.get_inputs()[0].shape  # e.g. [1, 3, 1280, 1280]
        model_imgsz.append(inp_shape[2])
        del sess

    print(f"Loaded {len(models)} model(s): {list(zip([p.name for p in model_paths], model_imgsz))}")

    predictions = []
    images = sorted(
        p for p in input_dir.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png")
    )

    for img_path in images:
        image_id = int(img_path.stem.split("_")[-1])
        img_bgr = cv2.imread(str(img_path))
        if img_bgr is None:
            continue

        all_boxes = []
        all_scores = []
        all_labels = []
        img_w, img_h = None, None

        for mi, model in enumerate(models):
            use_flip = mi < 2 or len(models) <= 2
            dets_list, w, h = _run_model(model, img_path, img_bgr, device, flip_tta=use_flip, imgsz=model_imgsz[mi])
            if img_w is None:
                img_w, img_h = w, h
            for boxes, scores, labels in dets_list:
                all_boxes.append(boxes)
                all_scores.append(scores)
                all_labels.append(labels)

        if img_w is None:
            continue

        # WBF fusion across all model+TTA predictions
        merged_boxes, merged_scores, merged_labels = weighted_boxes_fusion(
            all_boxes, all_scores, all_labels,
            iou_thr=WBF_IOU_THR,
            skip_box_thr=CONF_THR,
        )

        for box, score, label in zip(merged_boxes, merged_scores, merged_labels):
            x1 = box[0] * img_w
            y1 = box[1] * img_h
            x2 = box[2] * img_w
            y2 = box[3] * img_h
            predictions.append({
                "image_id": image_id,
                "category_id": int(label),
                "bbox": [
                    round(x1, 1), round(y1, 1),
                    round(x2 - x1, 1), round(y2 - y1, 1),
                ],
                "score": round(float(score), 3),
            })

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(predictions, f)

    print(f"Wrote {len(predictions)} predictions for {len(images)} images to {output_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    with torch.no_grad():
        predict(args.input, args.output)


if __name__ == "__main__":
    main()
