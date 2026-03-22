---
name: infohub-read
description: >-
  Reads all persisted entries from an InfoHub segment.
  Use when an agent needs shared context, findings, or decisions
  from a hackathon challenge segment (e.g. challenge-1, global).
allowed-tools: Bash
argument-hint: <segment>
---

# Read InfoHub Segment

Fetch all entries from a segment of the shared InfoHub memory store.

## Usage

`$ARGUMENTS` is the segment name (e.g. `challenge-1`, `challenge-2`, `challenge-3`, `global`).

## Steps

1. Run the following command, substituting the segment name:

```bash
curl -s "${INFOHUB_URL:-http://localhost:3456}/api/v1/segments/$ARGUMENTS/entries"
```

2. Parse the JSON response. The `entries` array contains objects with:
   - `id` — entry ID
   - `source` — which agent wrote it
   - `kind` — category (`note`, `finding`, `decision`, `summary`)
   - `content` — the information
   - `created_at` — timestamp

3. The `locked` field indicates if a compaction is in progress. If `true`, entries may change shortly.

4. Present the entries to the user or incorporate them into your working context.

If no segment name is provided, list all available segments instead:

```bash
curl -s "${INFOHUB_URL:-http://localhost:3456}/api/v1/segments"
```
