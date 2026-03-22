#!/usr/bin/env bash
# Package a submission zip that follows the competition rules.
#
# Usage:
#   ./package.sh <weights_file> [weights_file2] [output.zip]
#
# Example:
#   ./package.sh runs/train/norgesgruppen/weights/best.onnx
#   ./package.sh model.onnx submission.zip
#   ./package.sh model_l.onnx model_m.onnx  # dual-model ensemble

set -euo pipefail

# --- Config ---
MAX_UNCOMPRESSED_MB=420
MAX_FILES=1000
MAX_PY_FILES=10
MAX_WEIGHT_FILES=3
MAX_WEIGHT_MB=420
ALLOWED_EXT="py json yaml yml cfg pt pth onnx safetensors npy"
WEIGHT_EXT="pt pth onnx safetensors npy"
RUN_PY="src/run.py"

# --- Args ---
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <weights_file> [weights_file2] [output.zip]"
    echo "  weights_file   Path to primary model weights (.onnx, .pt, etc.)"
    echo "  weights_file2  Optional second model for ensemble"
    echo "  output.zip     Output path (default: submission.zip)"
    exit 1
fi

WEIGHTS="$1"
EXTRA_WEIGHTS=()
OUTPUT="submission.zip"
shift
# Parse remaining args: additional weights and/or output zip
while [[ $# -gt 0 ]]; do
    if [[ "$1" == *.onnx || "$1" == *.pt || "$1" == *.pth || "$1" == *.safetensors || "$1" == *.npy ]]; then
        EXTRA_WEIGHTS+=("$1")
    else
        OUTPUT="$1"
    fi
    shift
done

# --- Helpers ---
die() { echo "ERROR: $*" >&2; exit 1; }

is_allowed_ext() {
    local ext="${1##*.}"
    for a in $ALLOWED_EXT; do [[ "$ext" == "$a" ]] && return 0; done
    return 1
}

is_weight_ext() {
    local ext="${1##*.}"
    for w in $WEIGHT_EXT; do [[ "$ext" == "$w" ]] && return 0; done
    return 1
}

file_size_mb() {
    local bytes
    bytes=$(stat --printf="%s" "$1" 2>/dev/null || stat -f "%z" "$1")
    python3 -c "print(f'{$bytes / 1048576:.2f}')"
}

# --- Validate inputs ---
[[ -f "$RUN_PY" ]] || die "run.py not found at $RUN_PY"
[[ -f "$WEIGHTS" ]] || die "Weights file not found: $WEIGHTS"
is_allowed_ext "$WEIGHTS" || die "Disallowed file type: $WEIGHTS"
for ew in "${EXTRA_WEIGHTS[@]}"; do
    [[ -f "$ew" ]] || die "Weights file not found: $ew"
    is_allowed_ext "$ew" || die "Disallowed file type: $ew"
done

# --- Build file list ---
# Always include run.py; weights go as model.{ext}, model2.{ext}, model3.{ext}
WEIGHT_EXT_ACTUAL="${WEIGHTS##*.}"

STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT

cp "$RUN_PY" "$STAGING/run.py"
cp "$WEIGHTS" "$STAGING/model.${WEIGHT_EXT_ACTUAL}"

MODEL_NAMES="model.${WEIGHT_EXT_ACTUAL}"
for i in "${!EXTRA_WEIGHTS[@]}"; do
    ew="${EXTRA_WEIGHTS[$i]}"
    ext="${ew##*.}"
    idx=$((i + 2))
    cp "$ew" "$STAGING/model${idx}.${ext}"
    MODEL_NAMES="$MODEL_NAMES + model${idx}.${ext}"
done

if [[ ${#EXTRA_WEIGHTS[@]} -gt 0 ]]; then
    echo "  (Ensemble: $MODEL_NAMES)"
fi

# --- Validate limits ---
FILE_COUNT=$(find "$STAGING" -type f | wc -l)
PY_COUNT=$(find "$STAGING" -name "*.py" -type f | wc -l)
WEIGHT_COUNT=0
WEIGHT_SIZE_TOTAL=0
for f in "$STAGING"/*; do
    [[ -f "$f" ]] || continue
    if is_weight_ext "$f"; then
        WEIGHT_COUNT=$((WEIGHT_COUNT + 1))
        sz=$(file_size_mb "$f")
        WEIGHT_SIZE_TOTAL=$(echo "$WEIGHT_SIZE_TOTAL + $sz" | python3 -c "import sys; print(eval(sys.stdin.read()))")
    fi
done

TOTAL_SIZE=0
for f in "$STAGING"/*; do
    [[ -f "$f" ]] || continue
    sz=$(file_size_mb "$f")
    TOTAL_SIZE=$(echo "$TOTAL_SIZE + $sz" | python3 -c "import sys; print(eval(sys.stdin.read()))")
done

echo "=== Submission Validation ==="
echo "  Files:        $FILE_COUNT / $MAX_FILES"
echo "  Python files: $PY_COUNT / $MAX_PY_FILES"
echo "  Weight files: $WEIGHT_COUNT / $MAX_WEIGHT_FILES"
echo "  Weight size:  ${WEIGHT_SIZE_TOTAL} MB / ${MAX_WEIGHT_MB} MB"
echo "  Total size:   ${TOTAL_SIZE} MB / ${MAX_UNCOMPRESSED_MB} MB"

[[ $FILE_COUNT -le $MAX_FILES ]] || die "Too many files: $FILE_COUNT > $MAX_FILES"
[[ $PY_COUNT -le $MAX_PY_FILES ]] || die "Too many Python files: $PY_COUNT > $MAX_PY_FILES"
[[ $WEIGHT_COUNT -le $MAX_WEIGHT_FILES ]] || die "Too many weight files: $WEIGHT_COUNT > $MAX_WEIGHT_FILES"
python3 -c "exit(0 if $WEIGHT_SIZE_TOTAL <= $MAX_WEIGHT_MB else 1)" || die "Weight size ${WEIGHT_SIZE_TOTAL} MB > ${MAX_WEIGHT_MB} MB"
python3 -c "exit(0 if $TOTAL_SIZE <= $MAX_UNCOMPRESSED_MB else 1)" || die "Total size ${TOTAL_SIZE} MB > ${MAX_UNCOMPRESSED_MB} MB"

# --- Create zip ---
(cd "$STAGING" && zip -r - . -x ".*" "__MACOSX/*") > "$OUTPUT"

# --- Verify ---
echo ""
echo "=== Zip Contents ==="
unzip -l "$OUTPUT"

# Confirm run.py at root
if unzip -l "$OUTPUT" | grep -q "  run.py$"; then
    echo ""
    echo "OK: run.py is at zip root"
else
    die "run.py is NOT at zip root!"
fi

ZIP_SIZE=$(file_size_mb "$OUTPUT")
echo "Created $OUTPUT (${ZIP_SIZE} MB compressed, ${TOTAL_SIZE} MB uncompressed)"
