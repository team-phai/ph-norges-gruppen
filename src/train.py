"""Train YOLOv8 on the NorgesGruppen grocery detection dataset."""

import argparse
from pathlib import Path

from ultralytics import YOLO


def train(
    data_yaml: Path,
    model_size: str = "m",
    epochs: int = 100,
    imgsz: int = 640,
    batch: int = 16,
    project: str = "runs/train",
    name: str = "norgesgruppen",
    resume: bool = False,
):
    """Fine-tune a YOLOv8 model on the competition dataset.

    Args:
        data_yaml: Path to dataset.yaml from prepare_data.py.
        model_size: YOLOv8 variant — n/s/m/l/x.
        epochs: Number of training epochs.
        imgsz: Input image size.
        batch: Batch size (-1 for auto).
        project: Output project directory.
        name: Run name.
        resume: Resume from last checkpoint.
    """
    if resume:
        checkpoint = Path(project) / name / "weights" / "last.pt"
        if not checkpoint.exists():
            raise FileNotFoundError(f"No checkpoint to resume from: {checkpoint}")
        model = YOLO(str(checkpoint))
    else:
        model = YOLO(f"yolov8{model_size}.pt")

    model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        project=project,
        name=name,
        exist_ok=True,
        # Augmentation — tune for shelf images
        hsv_h=0.015,
        hsv_s=0.5,
        hsv_v=0.3,
        degrees=0.0,      # Shelves are horizontal — no rotation
        translate=0.1,
        scale=0.4,
        flipud=0.0,       # No vertical flip — products have orientation
        fliplr=0.5,
        mosaic=1.0,
        mixup=0.1,
        # Training params
        optimizer="AdamW",
        lr0=0.001,
        lrf=0.01,
        weight_decay=0.0005,
        warmup_epochs=3,
        patience=20,
        # Output
        save=True,
        save_period=10,
        plots=True,
        verbose=True,
    )

    best = Path(project) / name / "weights" / "best.pt"
    print(f"\nBest weights: {best}")
    print(f"Validate with: python src/evaluate.py --model {best} --data {data_yaml}")


def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8 for NorgesGruppen challenge")
    parser.add_argument("--data", type=Path, required=True, help="Path to dataset.yaml")
    parser.add_argument("--model", type=str, default="m", choices=["n", "s", "m", "l", "x"], help="YOLOv8 model size")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--project", type=str, default="runs/train")
    parser.add_argument("--name", type=str, default="norgesgruppen")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    train(
        data_yaml=args.data,
        model_size=args.model,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project=args.project,
        name=args.name,
        resume=args.resume,
    )


if __name__ == "__main__":
    main()
