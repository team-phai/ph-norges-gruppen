#!/usr/bin/env bash
# Submit a zip to the sandbox test server and display results.
#
# Usage:
#   ./sandbox/submit_client.sh <submission.zip> [server_url]
#
# Examples:
#   ./sandbox/submit_client.sh submission.zip
#   ./sandbox/submit_client.sh submission.zip http://34.90.1.2:8000

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <submission.zip> [server_url]"
    exit 1
fi

ZIP_FILE="$1"
SERVER="${2:-http://localhost:8000}"

if [[ ! -f "$ZIP_FILE" ]]; then
    echo "ERROR: File not found: $ZIP_FILE" >&2
    exit 1
fi

ZIP_SIZE=$(stat --printf="%s" "$ZIP_FILE" 2>/dev/null || stat -f "%z" "$ZIP_FILE")
ZIP_MB=$(python3 -c "print(f'{$ZIP_SIZE / 1048576:.1f}')")

echo "=== Submitting to Sandbox Server ==="
echo "  File:   $ZIP_FILE ($ZIP_MB MB)"
echo "  Server: $SERVER"
echo ""

# Check server health first
if ! curl -sf "$SERVER/health" > /dev/null 2>&1; then
    echo "ERROR: Server not reachable at $SERVER" >&2
    echo "  Check that the server is running and the URL is correct." >&2
    exit 1
fi

echo "Uploading and running (this may take several minutes)..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -F "file=@$ZIP_FILE" \
    "$SERVER/submit")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 400 ]]; then
    echo "=== Submission Failed (HTTP $HTTP_CODE) ==="
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
    exit 1
fi

echo "=== Results ==="
echo "$BODY" | python3 -c "
import sys, json
r = json.load(sys.stdin)
print(f\"  Status:              {r['status']}\")
print(f\"  Exit code:           {r['exit_code']}\")
print(f\"  Wall time:           {r['wall_time_seconds']}s\")
print(f\"  Predictions:         {r['prediction_count']}\")
print()
print(f\"  Detection mAP@0.5:   {r['detection_mAP']:.4f}  (weight: 0.7)\")
print(f\"  Classification mAP:  {r['classification_mAP']:.4f}  (weight: 0.3)\")
print(f\"  Combined Score:      {r['score']:.4f}\")
if r.get('warnings'):
    print()
    print('  Warnings:')
    for w in r['warnings']:
        print(f'    - {w}')
if r.get('errors'):
    print()
    print('  Errors:')
    for e in r['errors']:
        print(f'    - {e}')

# Save predictions to local file for visualization
preds = r.get('predictions', [])
if preds:
    with open('predictions.json', 'w') as f:
        json.dump(preds, f)
    print()
    print(f'  Predictions saved to: predictions.json ({len(preds)} detections)')
" 2>/dev/null || echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
