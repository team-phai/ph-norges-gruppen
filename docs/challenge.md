# Challenge Overview — NorgesGruppen Data: Object Detection

## Objective

Detect and classify grocery products on store shelf images. Upload a `.zip` containing a `run.py` script and model weights. The server runs your code in a sandboxed Docker container with GPU (NVIDIA L4, 24 GB VRAM) against a test set of shelf images. Your predictions are scored: **70% detection** (did you find products?) + **30% classification** (did you identify the right product?).

## Format

- **Type**: Offline ML / Computer Vision — object detection + classification
- **Submission**: Upload `.zip` file via the competition website
- **Execution**: Sandboxed Docker container, no network access, 300s timeout
- **Input**: Shelf images in `/data/images/` (JPEG, `img_XXXXX.jpg` format)
- **Output**: JSON array of predictions written to `--output` path

## Scoring

```
Score = 0.7 × detection_mAP + 0.3 × classification_mAP
```

- Both use **mAP@0.5** (Mean Average Precision at IoU threshold 0.5)
- **Detection mAP**: Did you find the products? (bounding box IoU >= 0.5, category ignored)
- **Classification mAP**: Did you identify the right product? (IoU >= 0.5 AND correct `category_id`)
- Detection-only submissions (`category_id: 0` for all) can score up to **0.70**
- Score range: 0.0 (worst) to 1.0 (perfect)

## Key Constraints

- **Max zip size**: 420 MB (uncompressed)
- **Max weight files**: 3 (`.pt`, `.pth`, `.onnx`, `.safetensors`, `.npy`)
- **Max weight size total**: 420 MB
- **Max Python files**: 10
- **Sandbox timeout**: 300 seconds
- **Sandbox GPU**: NVIDIA L4 (24 GB VRAM), CUDA 12.4
- **Sandbox memory**: 8 GB RAM, 4 vCPU
- **No network access** in sandbox
- **No `pip install`** at runtime
- **Submissions per day**: 3 per team (+ 2 infrastructure failure freebies)
- **Submissions in-flight**: 2 per team
- **Security restrictions**: No `import os`, `sys`, `subprocess`, `socket`, `ctypes`, `builtins`, `importlib`, `pickle`, `marshal`, `shelve`, `shutil`, `yaml`, `requests`, `urllib`, `multiprocessing`, `threading`, `signal`, `gc`; no `eval()`, `exec()`, `compile()`, `__import__()`, `getattr()` with dangerous names; use `pathlib` and `json` instead

## Training Data

- **COCO Dataset** (`NM_NGD_coco_dataset.zip`, ~864 MB): 248 shelf images, ~22,700 annotations, 356 product categories (ID 0-355)
- **Product Reference Images** (`NM_NGD_product_images.zip`, ~60 MB): 327 products with multi-angle photos
- Images from 4 store sections: Egg, Frokost, Knekkebrod, Varmedrikker
- Download from the Submit page on the competition website (login required)

## Pre-installed Sandbox Packages

PyTorch 2.6.0+cu124, torchvision 0.21.0+cu124, ultralytics 8.1.0, onnxruntime-gpu 1.20.0, opencv-python-headless 4.9.0.80, albumentations 1.3.1, Pillow 10.2.0, numpy 1.26.4, scipy 1.12.0, scikit-learn 1.4.0, pycocotools 2.0.7, ensemble-boxes 1.0.9, timm 0.9.12, supervision 0.18.0, safetensors 0.4.2

## MCP Docs Server

Connect docs to your AI coding tool:
```bash
claude mcp add --transport http nmiai https://mcp-docs.ainm.no/mcp
```

## Full Specification

See `docs/rules.md` for complete rules, schemas, sandbox details, examples, and all mechanics.
