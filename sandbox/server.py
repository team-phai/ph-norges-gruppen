"""FastAPI submission server — competition-like test environment.

Accepts zip uploads, validates them, runs them in a sandboxed Docker container,
scores predictions against ground truth, and returns results.

Run with: uvicorn server:app --host 0.0.0.0 --port 8000
"""

import copy
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="NorgesGruppen Sandbox Server")

# --- Configuration ---
SANDBOX_IMAGE = os.environ.get("SANDBOX_IMAGE", "nmiai/norgesgruppen-sandbox:latest")
DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
ANNOTATIONS_PATH = DATA_DIR / "annotations.json"
IMAGES_DIR = DATA_DIR / "images"

# Docker-in-Docker volume mount fix:
# The server runs inside a container but spawns sandbox containers via the host
# Docker socket. Volume mounts in `docker run` reference HOST paths, not paths
# inside this server container. We use a shared work directory that is bind-mounted
# at the same path on both the host and this container so paths are consistent.
# Set HOST_WORK_DIR to the host-side path of the shared work directory.
# Set HOST_DATA_DIR to the host-side path of the data directory.
HOST_WORK_DIR = Path(os.environ.get("HOST_WORK_DIR", "/work"))
HOST_DATA_DIR = Path(os.environ.get("HOST_DATA_DIR", "/data"))
HOST_IMAGES_DIR = HOST_DATA_DIR / "images"

# Submission limits (match competition)
MAX_UNCOMPRESSED_BYTES = 420 * 1024 * 1024  # 420 MB
MAX_FILES = 1000
MAX_PY_FILES = 10
MAX_WEIGHT_FILES = 3
MAX_WEIGHT_BYTES = 420 * 1024 * 1024  # 420 MB
ALLOWED_EXTENSIONS = {".py", ".json", ".yaml", ".yml", ".cfg", ".pt", ".pth", ".onnx", ".safetensors", ".npy"}
WEIGHT_EXTENSIONS = {".pt", ".pth", ".onnx", ".safetensors", ".npy"}

# Sandbox constraints
TIMEOUT_SECONDS = 300
MEMORY_LIMIT = "8g"
CPU_LIMIT = "4"

# Blocked imports (grep-based warning, not hard block — mirrors competition scanner)
BLOCKED_IMPORTS = [
    "os", "sys", "subprocess", "socket", "ctypes", "builtins", "importlib",
    "pickle", "marshal", "shelve", "shutil",
    "yaml",
    "requests", "urllib", "http.client",
    "multiprocessing", "threading", "signal", "gc",
    "code", "codeop", "pty",
]

BLOCKED_CALLS = ["eval(", "exec(", "compile(", "__import__("]


def validate_zip(zip_path: Path) -> tuple[list[str], list[str]]:
    """Validate a submission zip against competition rules.

    Returns (errors, warnings). Empty errors means valid.
    """
    errors = []
    warnings = []

    try:
        zf = zipfile.ZipFile(zip_path, "r")
    except zipfile.BadZipFile:
        return ["Invalid zip file"], []

    with zf:
        infos = zf.infolist()

        # Check for symlinks
        for info in infos:
            if info.external_attr >> 28 == 0xA:
                errors.append(f"Symlink detected: {info.filename}")

        # Path traversal check
        for info in infos:
            if ".." in info.filename or info.filename.startswith("/"):
                errors.append(f"Path traversal detected: {info.filename}")

        # run.py at root
        names = zf.namelist()
        if "run.py" not in names:
            errors.append("run.py not found at zip root")

        # File count
        if len(infos) > MAX_FILES:
            errors.append(f"Too many files: {len(infos)} > {MAX_FILES}")

        # Uncompressed size
        total_size = sum(i.file_size for i in infos)
        if total_size > MAX_UNCOMPRESSED_BYTES:
            errors.append(
                f"Uncompressed size {total_size / 1024 / 1024:.1f} MB > "
                f"{MAX_UNCOMPRESSED_BYTES / 1024 / 1024:.0f} MB"
            )

        # File type checks
        py_count = 0
        weight_count = 0
        weight_size = 0
        for info in infos:
            if info.is_dir():
                continue
            ext = Path(info.filename).suffix.lower()
            if ext not in ALLOWED_EXTENSIONS:
                errors.append(f"Disallowed file type: {info.filename}")
            if ext == ".py":
                py_count += 1
            if ext in WEIGHT_EXTENSIONS:
                weight_count += 1
                weight_size += info.file_size

        if py_count > MAX_PY_FILES:
            errors.append(f"Too many Python files: {py_count} > {MAX_PY_FILES}")
        if weight_count > MAX_WEIGHT_FILES:
            errors.append(f"Too many weight files: {weight_count} > {MAX_WEIGHT_FILES}")
        if weight_size > MAX_WEIGHT_BYTES:
            errors.append(
                f"Weight size {weight_size / 1024 / 1024:.1f} MB > "
                f"{MAX_WEIGHT_BYTES / 1024 / 1024:.0f} MB"
            )

        # Grep for blocked imports (warning only)
        for info in infos:
            if not info.filename.endswith(".py"):
                continue
            try:
                source = zf.read(info.filename).decode("utf-8", errors="replace")
            except Exception:
                continue

            for imp in BLOCKED_IMPORTS:
                # Match 'import X' or 'from X import'
                if re.search(rf"(?:^|\s)(?:import\s+{re.escape(imp)}|from\s+{re.escape(imp)}\s+import)", source, re.MULTILINE):
                    warnings.append(f"Possible blocked import: {imp} in {info.filename}")

            for call in BLOCKED_CALLS:
                if call in source:
                    warnings.append(f"Possible blocked call: {call} in {info.filename}")

    return errors, warnings


def run_sandbox(submission_dir: Path, output_dir: Path) -> dict:
    """Run submission in Docker sandbox. Returns dict with status, exit_code, wall_time.

    Paths must be under HOST_WORK_DIR so the host Docker daemon can see them.
    Images path uses HOST_DATA_DIR for the same reason.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "docker", "run",
        "--rm",
        "--gpus", "all",
        "--network", "none",
        "--memory", MEMORY_LIMIT,
        "--cpus", CPU_LIMIT,
        "--read-only",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=512m",
        "-v", f"{submission_dir}:/submission:ro",
        "-v", f"{HOST_IMAGES_DIR}:/data/images:ro",
        "-v", f"{output_dir}:/output:rw",
        SANDBOX_IMAGE,
    ]

    logger.info("Starting sandbox: %s", " ".join(cmd))
    start = time.monotonic()

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS + 30,  # Docker overhead buffer
        )
        wall_time = time.monotonic() - start
        stdout = result.stdout[-5000:] if result.stdout else ""
        stderr = result.stderr[-5000:] if result.stderr else ""

        if result.returncode == 137:
            return {
                "status": "oom",
                "exit_code": 137,
                "wall_time_seconds": round(wall_time, 1),
                "stdout": stdout,
                "stderr": stderr,
            }

        return {
            "status": "success" if result.returncode == 0 else "runtime_error",
            "exit_code": result.returncode,
            "wall_time_seconds": round(wall_time, 1),
            "stdout": stdout,
            "stderr": stderr,
        }

    except subprocess.TimeoutExpired:
        wall_time = time.monotonic() - start
        # Kill any lingering container
        return {
            "status": "timeout",
            "exit_code": -1,
            "wall_time_seconds": round(wall_time, 1),
            "stdout": "",
            "stderr": f"Timed out after {TIMEOUT_SECONDS}s",
        }


def _make_single_category(coco_gt: COCO) -> COCO:
    """Create a copy of COCO GT with all annotations mapped to category_id=1."""
    single = COCO()
    dataset = copy.deepcopy(coco_gt.dataset)
    dataset["categories"] = [{"id": 1, "name": "product", "supercategory": "product"}]
    for ann in dataset["annotations"]:
        ann["category_id"] = 1
    single.dataset = dataset
    single.createIndex()
    return single


def score_predictions(predictions_path: Path, annotations_path: Path) -> dict:
    """Score predictions against ground truth using competition formula."""
    if not predictions_path.exists():
        return {
            "detection_mAP": 0.0,
            "classification_mAP": 0.0,
            "score": 0.0,
            "prediction_count": 0,
            "errors": ["predictions.json not found in output"],
        }

    try:
        with open(predictions_path) as f:
            preds = json.load(f)
    except (json.JSONDecodeError, Exception) as e:
        return {
            "detection_mAP": 0.0,
            "classification_mAP": 0.0,
            "score": 0.0,
            "prediction_count": 0,
            "errors": [f"Failed to parse predictions.json: {e}"],
        }

    if not preds:
        return {
            "detection_mAP": 0.0,
            "classification_mAP": 0.0,
            "score": 0.0,
            "prediction_count": 0,
            "errors": ["No predictions in output"],
        }

    coco_gt = COCO(str(annotations_path))

    # Classification mAP (category-aware)
    try:
        coco_dt_cls = coco_gt.loadRes(preds)
        eval_cls = COCOeval(coco_gt, coco_dt_cls, "bbox")
        eval_cls.params.iouThrs = [0.5]
        eval_cls.params.maxDets = [100, 300, 1000]
        eval_cls.evaluate()
        eval_cls.accumulate()
        eval_cls.summarize()
        classification_mAP = float(eval_cls.stats[0])
    except Exception as e:
        logger.error("Classification eval failed: %s", e)
        classification_mAP = 0.0

    # Detection mAP (category-agnostic)
    try:
        single_cat_gt = _make_single_category(coco_gt)
        single_cat_preds = [{**p, "category_id": 1} for p in preds]
        coco_dt_det = single_cat_gt.loadRes(single_cat_preds)
        eval_det = COCOeval(single_cat_gt, coco_dt_det, "bbox")
        eval_det.params.iouThrs = [0.5]
        eval_det.params.maxDets = [100, 300, 1000]
        eval_det.evaluate()
        eval_det.accumulate()
        eval_det.summarize()
        detection_mAP = float(eval_det.stats[0])
    except Exception as e:
        logger.error("Detection eval failed: %s", e)
        detection_mAP = 0.0

    score = 0.7 * detection_mAP + 0.3 * classification_mAP

    return {
        "detection_mAP": round(detection_mAP, 6),
        "classification_mAP": round(classification_mAP, 6),
        "score": round(score, 6),
        "prediction_count": len(preds),
        "errors": [],
    }


@app.get("/health")
def health():
    """Liveness check."""
    return {
        "status": "ok",
        "sandbox_image": SANDBOX_IMAGE,
        "annotations_exists": ANNOTATIONS_PATH.exists(),
        "images_dir_exists": IMAGES_DIR.exists(),
    }


@app.post("/submit")
async def submit(file: UploadFile = File(...)):
    """Accept a submission zip, validate, run in sandbox, and score."""
    # Use HOST_WORK_DIR for temp dirs so the host Docker daemon can see them.
    # The server container and host must share this directory at the same path.
    tmpdir = Path(tempfile.mkdtemp(prefix="submission_", dir=str(HOST_WORK_DIR)))

    try:
        # Save uploaded zip
        zip_path = tmpdir / "submission.zip"
        with open(zip_path, "wb") as f:
            content = await file.read()
            f.write(content)

        logger.info("Received submission: %s (%.1f MB)", file.filename, len(content) / 1024 / 1024)

        # Validate
        errors, warnings = validate_zip(zip_path)
        if errors:
            return JSONResponse(
                status_code=400,
                content={
                    "status": "validation_error",
                    "exit_code": -1,
                    "wall_time_seconds": 0,
                    "prediction_count": 0,
                    "detection_mAP": 0.0,
                    "classification_mAP": 0.0,
                    "score": 0.0,
                    "errors": errors,
                    "warnings": warnings,
                },
            )

        # Extract
        submission_dir = tmpdir / "extracted"
        submission_dir.mkdir()
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(submission_dir)

        # Run in sandbox — paths are host-visible since tmpdir is under HOST_WORK_DIR
        output_dir = tmpdir / "output"
        sandbox_result = run_sandbox(submission_dir, output_dir)

        if sandbox_result["status"] != "success":
            return JSONResponse(
                content={
                    "status": sandbox_result["status"],
                    "exit_code": sandbox_result["exit_code"],
                    "wall_time_seconds": sandbox_result["wall_time_seconds"],
                    "prediction_count": 0,
                    "detection_mAP": 0.0,
                    "classification_mAP": 0.0,
                    "score": 0.0,
                    "errors": [sandbox_result.get("stderr", "")],
                    "warnings": warnings,
                    "stdout": sandbox_result.get("stdout", ""),
                },
            )

        # Score
        predictions_path = output_dir / "predictions.json"
        scores = score_predictions(predictions_path, ANNOTATIONS_PATH)

        # Include raw predictions in response for local analysis/visualization
        predictions = []
        if predictions_path.exists():
            try:
                with open(predictions_path) as f:
                    predictions = json.load(f)
            except (json.JSONDecodeError, Exception):
                pass

        return JSONResponse(
            content={
                "status": "success",
                "exit_code": sandbox_result["exit_code"],
                "wall_time_seconds": sandbox_result["wall_time_seconds"],
                "prediction_count": scores["prediction_count"],
                "detection_mAP": scores["detection_mAP"],
                "classification_mAP": scores["classification_mAP"],
                "score": scores["score"],
                "errors": scores["errors"],
                "warnings": warnings,
                "stdout": sandbox_result.get("stdout", ""),
                "predictions": predictions,
            },
        )

    except Exception as e:
        logger.exception("Submission failed")
        return JSONResponse(
            status_code=500,
            content={
                "status": "runtime_error",
                "exit_code": -1,
                "wall_time_seconds": 0,
                "prediction_count": 0,
                "detection_mAP": 0.0,
                "classification_mAP": 0.0,
                "score": 0.0,
                "errors": [str(e)],
                "warnings": [],
            },
        )

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
