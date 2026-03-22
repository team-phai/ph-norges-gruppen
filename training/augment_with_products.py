"""Augment COCO training data with product reference images.

Creates synthetic training samples by:
1. Mapping product reference images to category IDs via product_name matching
2. For each rare category (<=N annotations), generating synthetic COCO annotations
   using the product reference images as full-image bounding boxes
3. Merging into the existing COCO annotations file

Usage:
    python training/augment_with_products.py \
        --coco assets/NM_NGD_coco_dataset/train \
        --products assets/NM_NGD_product_images \
        --output assets/NM_NGD_coco_dataset/train/annotations_augmented.json \
        --max-ann-threshold 5
"""

import argparse
import json
from collections import Counter
from pathlib import Path


def _jpeg_dimensions(path: Path):
    """Read width, height from a JPEG file header without external libs."""
    import struct
    try:
        with open(path, "rb") as f:
            f.read(2)  # SOI marker
            while True:
                marker, size = struct.unpack(">HH", f.read(4))
                if 0xFFC0 <= marker <= 0xFFC3:
                    f.read(1)  # precision
                    h, w = struct.unpack(">HH", f.read(4))
                    return w, h
                f.read(size - 2)
    except Exception:
        return None, None


def augment(coco_path: Path, products_path: Path, output_path: Path, max_ann_threshold: int = 5):
    with open(coco_path / "annotations.json") as f:
        coco = json.load(f)

    with open(products_path / "metadata.json") as f:
        meta = json.load(f)

    cat_names = {c["id"]: c["name"] for c in coco["categories"]}
    cat_counts = Counter(a["category_id"] for a in coco["annotations"])
    prod_name_to_code = {p["product_name"]: p["product_code"] for p in meta["products"]}

    # Find next available image and annotation IDs
    max_img_id = max(img["id"] for img in coco["images"])
    max_ann_id = max(a["id"] for a in coco["annotations"])
    next_img_id = max_img_id + 1
    next_ann_id = max_ann_id + 1

    new_images = []
    new_annotations = []
    augmented_cats = 0

    for cat_id, cat_name in sorted(cat_names.items()):
        count = cat_counts.get(cat_id, 0)
        if count > max_ann_threshold:
            continue

        code = prod_name_to_code.get(cat_name)
        if not code:
            continue

        prod_dir = products_path / code
        if not prod_dir.exists():
            continue

        product_imgs = sorted(prod_dir.glob("*.jpg"))
        if not product_imgs:
            continue

        augmented_cats += 1

        for img_file in product_imgs:
            # Read JPEG dimensions from header
            w, h = _jpeg_dimensions(img_file)
            if w is None:
                continue

            # Create image entry
            # Use a path relative to the images/ dir — we'll symlink later
            file_name = f"product_{code}_{img_file.stem}.jpg"
            new_images.append({
                "id": next_img_id,
                "file_name": file_name,
                "width": w,
                "height": h,
            })

            # Create annotation: full image is the bounding box
            # Small padding to avoid edge artifacts
            pad = 5
            bbox_x = pad
            bbox_y = pad
            bbox_w = max(1, w - 2 * pad)
            bbox_h = max(1, h - 2 * pad)
            new_annotations.append({
                "id": next_ann_id,
                "image_id": next_img_id,
                "category_id": cat_id,
                "bbox": [bbox_x, bbox_y, bbox_w, bbox_h],
                "area": bbox_w * bbox_h,
                "iscrowd": 0,
            })

            next_img_id += 1
            next_ann_id += 1

    # Merge into COCO
    augmented = {
        "images": coco["images"] + new_images,
        "categories": coco["categories"],
        "annotations": coco["annotations"] + new_annotations,
    }

    with open(output_path, "w") as f:
        json.dump(augmented, f)

    print(f"Augmented dataset written to {output_path}")
    print(f"  Original: {len(coco['images'])} images, {len(coco['annotations'])} annotations")
    print(f"  Added: {len(new_images)} images, {len(new_annotations)} annotations")
    print(f"  Total: {len(augmented['images'])} images, {len(augmented['annotations'])} annotations")
    print(f"  Augmented categories: {augmented_cats}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--coco", type=Path, required=True, help="Path to COCO dataset root")
    parser.add_argument("--products", type=Path, required=True, help="Path to product images dir")
    parser.add_argument("--output", type=Path, required=True, help="Output augmented annotations JSON")
    parser.add_argument("--max-ann-threshold", type=int, default=5, help="Max annotations per category to augment")
    args = parser.parse_args()

    augment(args.coco, args.products, args.output, args.max_ann_threshold)


if __name__ == "__main__":
    main()
