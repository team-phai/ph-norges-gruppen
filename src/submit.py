"""Package a submission zip for upload.

Creates a zip with run.py at the root + model weights.
Validates against competition constraints before packaging.
"""

import argparse
import zipfile
from pathlib import Path

ALLOWED_EXTENSIONS = {".py", ".json", ".yaml", ".yml", ".cfg", ".pt", ".pth", ".onnx", ".safetensors", ".npy"}
WEIGHT_EXTENSIONS = {".pt", ".pth", ".onnx", ".safetensors", ".npy"}
MAX_UNCOMPRESSED_MB = 420
MAX_WEIGHT_FILES = 3
MAX_PYTHON_FILES = 10
MAX_FILES = 1000


def package(weights_path: Path, output_zip: Path, run_py: Path | None = None):
    """Create submission zip.

    Args:
        weights_path: Path to model weights file (e.g., best.pt).
        output_zip: Output zip file path.
        run_py: Path to run.py. Defaults to src/run.py.
    """
    if run_py is None:
        run_py = Path(__file__).parent / "run.py"

    if not run_py.exists():
        raise FileNotFoundError(f"run.py not found: {run_py}")
    if not weights_path.exists():
        raise FileNotFoundError(f"Weights not found: {weights_path}")

    files_to_add: list[tuple[Path, str]] = [
        (run_py, "run.py"),
        (weights_path, "best.pt"),
    ]

    # Validate
    py_count = sum(1 for _, name in files_to_add if name.endswith(".py"))
    weight_count = sum(1 for _, name in files_to_add if Path(name).suffix in WEIGHT_EXTENSIONS)
    total_size = sum(p.stat().st_size for p, _ in files_to_add)

    assert py_count <= MAX_PYTHON_FILES, f"Too many Python files: {py_count} > {MAX_PYTHON_FILES}"
    assert weight_count <= MAX_WEIGHT_FILES, f"Too many weight files: {weight_count} > {MAX_WEIGHT_FILES}"
    assert len(files_to_add) <= MAX_FILES, f"Too many files: {len(files_to_add)} > {MAX_FILES}"

    total_mb = total_size / (1024 * 1024)
    assert total_mb <= MAX_UNCOMPRESSED_MB, f"Uncompressed size {total_mb:.1f} MB > {MAX_UNCOMPRESSED_MB} MB"

    for path, _ in files_to_add:
        assert path.suffix in ALLOWED_EXTENSIONS, f"Disallowed file type: {path.suffix}"

    # Create zip
    output_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, arcname in files_to_add:
            zf.write(path, arcname)

    zip_size_mb = output_zip.stat().st_size / (1024 * 1024)
    print(f"Created {output_zip} ({zip_size_mb:.1f} MB compressed, {total_mb:.1f} MB uncompressed)")
    print(f"  Files: {len(files_to_add)}")
    for _, arcname in files_to_add:
        print(f"    {arcname}")

    # Verify structure
    with zipfile.ZipFile(output_zip, "r") as zf:
        names = zf.namelist()
        assert "run.py" in names, "run.py not at zip root!"
    print("\nVerified: run.py is at zip root.")


def main():
    parser = argparse.ArgumentParser(description="Package submission zip")
    parser.add_argument("--weights", type=Path, required=True, help="Path to model weights (e.g., runs/train/norgesgruppen/weights/best.pt)")
    parser.add_argument("--output", type=Path, default=Path("submission.zip"), help="Output zip path")
    parser.add_argument("--run-py", type=Path, default=None, help="Path to run.py (default: src/run.py)")
    args = parser.parse_args()

    package(args.weights, args.output, args.run_py)


if __name__ == "__main__":
    main()
