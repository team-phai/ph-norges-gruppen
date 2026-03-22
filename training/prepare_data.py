"""Convert COCO annotations to YOLO format for training with ultralytics."""

import argparse
import json
import random
from collections import Counter
from pathlib import Path


def _stratified_split(images, anns_by_image, val_ratio, seed=42):
    """Stratified train/val split ensuring category coverage in both splits.

    For each image, pick its rarest category as the "stratification key".
    Sort images by that key frequency (rarest first), then greedily assign
    images to val until val_ratio is reached while ensuring every category
    with 2+ images gets val representation.
    """
    rng = random.Random(seed)

    # For each image, find its rarest category
    cat_counts = Counter()
    for img_id, anns in anns_by_image.items():
        for ann in anns:
            cat_counts[ann["category_id"]] += 1

    image_ids = sorted(images.keys())
    n_val = max(1, int(len(image_ids) * val_ratio))

    # Map each image to its rarest category
    img_rarest = {}
    for img_id in image_ids:
        anns = anns_by_image.get(img_id, [])
        if anns:
            img_rarest[img_id] = min(anns, key=lambda a: cat_counts[a["category_id"]])["category_id"]
        else:
            img_rarest[img_id] = -1

    # Group images by their rarest category
    cat_to_images = {}
    for img_id, cat_id in img_rarest.items():
        cat_to_images.setdefault(cat_id, []).append(img_id)

    val_ids = set()
    train_ids = set()

    # First pass: ensure every category with 2+ images has at least 1 val image
    for cat_id in sorted(cat_to_images.keys()):
        imgs = cat_to_images[cat_id]
        if len(imgs) >= 2:
            rng.shuffle(imgs)
            # Add one image to val if none of this category's images are in val yet
            cat_in_val = any(i in val_ids for i in imgs)
            if not cat_in_val:
                val_ids.add(imgs[0])

    # Second pass: fill remaining val quota randomly from unassigned images
    unassigned = [i for i in image_ids if i not in val_ids]
    rng.shuffle(unassigned)
    for img_id in unassigned:
        if len(val_ids) >= n_val:
            break
        val_ids.add(img_id)

    # If we overshot (too many mandatory val images), that's fine — keep them all
    train_ids = set(image_ids) - val_ids

    # Report category coverage
    val_cats = set()
    train_cats = set()
    for img_id in val_ids:
        for ann in anns_by_image.get(img_id, []):
            val_cats.add(ann["category_id"])
    for img_id in train_ids:
        for ann in anns_by_image.get(img_id, []):
            train_cats.add(ann["category_id"])

    all_cats = val_cats | train_cats
    print(f"  Stratified split: {len(train_ids)} train, {len(val_ids)} val")
    print(f"  Categories in train: {len(train_cats)}/{len(all_cats)}")
    print(f"  Categories in val: {len(val_cats)}/{len(all_cats)}")
    print(f"  Categories in both: {len(val_cats & train_cats)}/{len(all_cats)}")

    return sorted(train_ids), sorted(val_ids)


def coco_to_yolo(coco_path: Path, output_dir: Path, val_ratio: float = 0.15,
                 full_train: bool = False, annotations_file: str = "annotations.json",
                 product_images: Path = None):
    """Convert COCO dataset to YOLO format with train/val split.

    Args:
        coco_path: Path to extracted COCO dataset (contains images/ and annotations.json).
        output_dir: Where to write the YOLO-formatted dataset.
        val_ratio: Fraction of images to use for validation.
        full_train: If True, use all images for both train and val (no holdout).
        annotations_file: Name of the annotations JSON file to use.
        product_images: Path to product reference images dir (for synthetic data).
    """
    with open(coco_path / annotations_file) as f:
        coco = json.load(f)

    images = {img["id"]: img for img in coco["images"]}
    categories = {cat["id"]: cat for cat in coco["categories"]}
    num_classes = len(categories)

    # Group annotations by image
    anns_by_image: dict[int, list] = {}
    for ann in coco["annotations"]:
        anns_by_image.setdefault(ann["image_id"], []).append(ann)

    # Create train/val split
    image_ids = sorted(images.keys())
    if full_train:
        splits = {
            "train": image_ids,
            "val": image_ids,  # val = train for metric tracking during training
        }
        print(f"  Full-train mode: all {len(image_ids)} images in both train and val")
    else:
        train_ids, val_ids = _stratified_split(images, anns_by_image, val_ratio)
        splits = {
            "train": train_ids,
            "val": val_ids,
        }

    for split_name, ids in splits.items():
        img_dir = output_dir / "images" / split_name
        lbl_dir = output_dir / "labels" / split_name
        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)

        for img_id in ids:
            img_info = images[img_id]
            w, h = img_info["width"], img_info["height"]
            src = coco_path / "images" / img_info["file_name"]

            # Symlink image — product images have a different source path
            dst = img_dir / img_info["file_name"]
            if not dst.exists():
                if img_info["file_name"].startswith("product_") and product_images:
                    # product_{barcode}_{view}.jpg -> product_images/{barcode}/{view}.jpg
                    parts = img_info["file_name"].replace("product_", "", 1).rsplit("_", 1)
                    barcode = parts[0]
                    view = parts[1].replace(".jpg", "")
                    prod_src = product_images / barcode / f"{view}.jpg"
                    if prod_src.exists():
                        dst.symlink_to(prod_src.resolve())
                else:
                    src = coco_path / "images" / img_info["file_name"]
                    dst.symlink_to(src.resolve())

            # Write YOLO label file
            label_path = lbl_dir / (Path(img_info["file_name"]).stem + ".txt")
            lines = []
            for ann in anns_by_image.get(img_id, []):
                bx, by, bw, bh = ann["bbox"]
                # YOLO format: class x_center y_center width height (normalized)
                x_center = (bx + bw / 2) / w
                y_center = (by + bh / 2) / h
                nw = bw / w
                nh = bh / h
                lines.append(f"{ann['category_id']} {x_center:.6f} {y_center:.6f} {nw:.6f} {nh:.6f}")
            label_path.write_text("\n".join(lines) + "\n" if lines else "")

    # Write dataset YAML
    yaml_content = {
        "path": str(output_dir.resolve()),
        "train": "images/train",
        "val": "images/val",
        "nc": num_classes,
        "names": {cat_id: cat["name"] for cat_id, cat in sorted(categories.items())},
    }
    # Write as valid YAML manually (avoid yaml import — blocked in sandbox)
    yaml_path = output_dir / "dataset.yaml"
    with open(yaml_path, "w") as f:
        f.write(f"path: {yaml_content['path']}\n")
        f.write(f"train: {yaml_content['train']}\n")
        f.write(f"val: {yaml_content['val']}\n")
        f.write(f"nc: {yaml_content['nc']}\n")
        f.write("names:\n")
        for cat_id, name in sorted(yaml_content["names"].items()):
            # Escape quotes in product names
            safe_name = name.replace("'", "''")
            f.write(f"  {cat_id}: '{safe_name}'\n")

    print(f"Dataset written to {output_dir}")
    print(f"  Classes: {num_classes}")
    print(f"  Train images: {len(splits['train'])}")
    print(f"  Val images: {len(splits['val'])}")
    print(f"  YAML: {yaml_path}")


def main():
    parser = argparse.ArgumentParser(description="Convert COCO annotations to YOLO format")
    parser.add_argument("--coco", type=Path, required=True, help="Path to extracted COCO dataset root")
    parser.add_argument("--output", type=Path, default=Path("data/yolo"), help="Output YOLO dataset directory")
    parser.add_argument("--val-ratio", type=float, default=0.15, help="Validation split ratio")
    parser.add_argument("--full-train", action="store_true", help="Use all images for training (no holdout)")
    parser.add_argument("--annotations", type=str, default="annotations.json", help="Annotations file name")
    parser.add_argument("--product-images", type=Path, default=None, help="Path to product reference images")
    args = parser.parse_args()

    coco_to_yolo(args.coco, args.output, args.val_ratio, args.full_train,
                 args.annotations, args.product_images)


if __name__ == "__main__":
    main()
