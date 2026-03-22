"""Convert COCO annotations to YOLO format for training with ultralytics."""

import argparse
import json
from pathlib import Path


def coco_to_yolo(coco_path: Path, output_dir: Path, val_ratio: float = 0.15):
    """Convert COCO dataset to YOLO format with train/val split.

    Args:
        coco_path: Path to extracted COCO dataset (contains images/ and annotations.json).
        output_dir: Where to write the YOLO-formatted dataset.
        val_ratio: Fraction of images to use for validation.
    """
    with open(coco_path / "annotations.json") as f:
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
    split_idx = int(len(image_ids) * (1 - val_ratio))
    splits = {
        "train": image_ids[:split_idx],
        "val": image_ids[split_idx:],
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

            # Symlink image
            dst = img_dir / img_info["file_name"]
            if not dst.exists():
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
    args = parser.parse_args()

    coco_to_yolo(args.coco, args.output, args.val_ratio)


if __name__ == "__main__":
    main()
