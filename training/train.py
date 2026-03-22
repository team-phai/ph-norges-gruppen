"""Train YOLOv8 on the NorgesGruppen grocery detection dataset."""

import argparse
from datetime import datetime
from pathlib import Path

import albumentations as A
from ultralytics import YOLO


def train(
    data_yaml: Path,
    model_size: str = "m",
    epochs: int = 100,
    imgsz: int = 1280,
    batch: int = 16,
    project: str = "runs/train",
    name: str = "norgesgruppen",
    resume: bool = False,
    device: str = "0,1,2,3",
    export_onnx: bool = False,
    perspective_aug: bool = True,
    label_smoothing: float = 0.0,
    dropout: float = 0.0,
    cos_lr: bool = False,
    close_mosaic: int = 10,
    patience: int = 50,
    mosaic: float = 0.1,
    cls_weight: float = 0.5,
    seed: int = 0,
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
        device: CUDA device(s) — e.g. "0" or "0,1,2,3" for multi-GPU DDP.
        patience: Early stopping patience (0 = disabled).
    """
    # Resolve to absolute path — ultralytics 8.4 nests relative paths under runs/detect/
    project = str(Path(project).resolve())

    if resume:
        checkpoint = Path(project) / name / "weights" / "last.pt"
        if not checkpoint.exists():
            raise FileNotFoundError(f"No checkpoint to resume from: {checkpoint}")
        model = YOLO(str(checkpoint))
    elif model_size.startswith("rtdetr"):
        model = YOLO(f"{model_size}.pt")
    else:
        model = YOLO(f"yolov8{model_size}.pt")

    model.train(
        data=str(data_yaml),
        epochs=epochs,                # Total number of passes through the training dataset
        imgsz=imgsz,                  # Input image is resized to this (px). Larger = better detail but more VRAM
        batch=batch,                  # Images per forward pass per GPU. -1 = auto-detect max that fits in VRAM
        device=device,                # Which GPU(s) to use. "0" = single, "0,1,2,3" = multi-GPU DDP
        project=project,              # Parent directory where run folders are saved
        name=name,                    # Sub-folder name for this run (under project/)
        exist_ok=True,                # Overwrite existing run folder instead of creating name2, name3, etc.

        # --- Color augmentation ---
        hsv_h=0.015,                  # Random hue shift ±1.5%. Simulates lighting color variation
        hsv_s=0.5,                    # Random saturation shift ±50%. Handles washed-out/vivid shelf lighting
        hsv_v=0.3,                    # Random brightness shift ±30%. Simulates shadows and highlights

        # --- Geometric augmentation ---
        degrees=0.0,                  # Max rotation angle. 0 = disabled (shelves are always horizontal)
        translate=0.1,                # Random shift up to 10% of image size in x/y
        scale=0.2,                    # Random zoom ±20%. Moderate scale variance without aggressive zoom-out
        flipud=0.0,                   # Vertical flip probability. 0 = disabled (products have a right-side-up)
        fliplr=0.5,                   # Horizontal flip probability. 50% chance to mirror left-right

        # --- 3D Geometric augmentation ---
        perspective=0.001 if perspective_aug else 0.0,  # Perspective warp (camera angle variation)
        shear=10.0 if perspective_aug else 0.0,         # Shear ±10° (oblique viewing angles)

        # --- Advanced augmentation ---
        mosaic=mosaic,                 # Mosaic augmentation probability
        mixup=0.15,                   # Blend 2 images with alpha transparency for regularization
        copy_paste=0.1,               # Copy-paste objects between images for density diversity

        # --- Custom albumentations for richer 3D effects ---
        augmentations=[
            A.Perspective(scale=(0.05, 0.1), p=0.3),
            A.Affine(shear=(-15, 15), p=0.2),
            A.ToGray(p=0.01),
            A.CLAHE(p=0.01),
        ] if perspective_aug else None,

        # --- Optimizer & learning rate ---
        optimizer="AdamW",            # Optimizer algorithm. AdamW = Adam with decoupled weight decay,
                                      # generally more stable than SGD for fine-tuning pretrained models
        lr0=0.001,                    # Initial learning rate. How big each weight update step is
        lrf=0.01,                     # Final LR as fraction of lr0. LR decays from 0.001 → 0.00001 over training
        weight_decay=0.0005,          # L2 regularization penalty. Prevents weights from growing too large,
                                      # reduces overfitting (important with only 248 training images)
        warmup_epochs=5,              # Gradually ramp LR from ~0 to lr0 over first 5 epochs.
                                      # Prevents unstable gradients when pretrained weights first see new data

        # --- Loss weights ---
        cls=cls_weight,                   # Classification loss weight (default 0.5)

        # --- Regularization ---
        label_smoothing=label_smoothing,  # Soften hard targets, reduce overconfidence on 357 classes
        dropout=dropout,                  # Dropout for small dataset (248 images)
        cos_lr=cos_lr,                    # Cosine annealing LR — smoother convergence than linear decay
        close_mosaic=close_mosaic,        # Disable mosaic for last N epochs to stabilize final weights

        # --- Early stopping ---
        patience=patience,            # Stop training if val mAP doesn't improve for N epochs (0 = disabled)

        # --- Checkpointing & logging ---
        save=True,                    # Save best.pt (best val mAP) and last.pt (most recent epoch)
        save_period=10,               # Also save a checkpoint every 10 epochs (epoch10.pt, epoch20.pt, ...)
        plots=True,                   # Generate training plots (loss curves, PR curves, confusion matrix)
        verbose=True,                 # Print detailed per-epoch metrics to console
        seed=seed,                    # Random seed for reproducibility / ensemble diversity
    )

    best = Path(project) / name / "weights" / "best.pt"
    print(f"\nBest weights: {best}")
    print(f"Validate with: python sandbox/evaluate.py --model {best} --data {data_yaml}")

    if export_onnx:
        print("\nExporting to ONNX...")
        export_model = YOLO(str(best))
        onnx_path = export_model.export(
            format="onnx",
            imgsz=imgsz,
            opset=17,
            simplify=True,
            half=False,
        )
        print(f"ONNX model exported: {onnx_path}")


def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8 for NorgesGruppen challenge")
    parser.add_argument("--data", type=Path, required=True, help="Path to dataset.yaml")
    parser.add_argument("--model", type=str, default="m", help="Model: n/s/m/l/x for YOLOv8, or rtdetr-l/rtdetr-x for RT-DETR")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=1280)
    parser.add_argument("--batch", type=int, default=16, help="Per-GPU batch size (total = batch * num_gpus)")
    parser.add_argument("--project", type=str, default="runs/train")
    parser.add_argument("--name", type=str, default="norgesgruppen")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--device", type=str, default="0,1,2,3", help="CUDA device(s), e.g. '0' or '0,1,2,3' for multi-GPU DDP")
    parser.add_argument("--export-onnx", action="store_true", help="Export best weights to ONNX after training")
    parser.add_argument("--no-perspective", action="store_true", help="Disable 3D perspective augmentation")
    parser.add_argument("--label-smoothing", type=float, default=0.0, help="Label smoothing factor (0.0–0.1)")
    parser.add_argument("--dropout", type=float, default=0.0, help="Dropout rate (0.0–0.5)")
    parser.add_argument("--cos-lr", action="store_true", help="Use cosine annealing LR schedule")
    parser.add_argument("--no-cos-lr", dest="cos_lr", action="store_false")
    parser.add_argument("--close-mosaic", type=int, default=10, help="Disable mosaic for last N epochs")
    parser.add_argument("--patience", type=int, default=50, help="Early stopping patience (0 = disabled)")
    parser.add_argument("--mosaic", type=float, default=0.1, help="Mosaic augmentation probability (0.0-1.0)")
    parser.add_argument("--cls-weight", type=float, default=0.5, help="Classification loss weight (default 0.5)")
    parser.add_argument("--seed", type=int, default=0, help="Random seed (change for seed ensembles)")
    args = parser.parse_args()

    # Append datetime to run name for unique identification
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = f"{args.name}_{timestamp}"

    train(
        data_yaml=args.data,
        model_size=args.model,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project=args.project,
        name=name,
        resume=args.resume,
        device=args.device,
        export_onnx=args.export_onnx,
        perspective_aug=not args.no_perspective,
        label_smoothing=args.label_smoothing,
        dropout=args.dropout,
        cos_lr=args.cos_lr,
        close_mosaic=args.close_mosaic,
        patience=args.patience,
        mosaic=args.mosaic,
        cls_weight=args.cls_weight,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
