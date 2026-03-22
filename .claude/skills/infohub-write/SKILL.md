---
name: infohub-write
description: >-
  Appends an entry to an InfoHub segment, persisting context for other agents.
  Use when an agent discovers a finding, makes a decision, or has information
  that other agents working on the same hackathon challenge should know about.
allowed-tools: Bash
argument-hint: <segment>
---

# Write to InfoHub Segment

Append a new entry to the shared InfoHub memory store. All writes are preserved — entries are never overwritten.

## Usage

`$ARGUMENTS` is the segment name (e.g. `challenge-1`, `challenge-2`, `challenge-3`, `global`).

## Steps

1. Determine the entry to write:
   - **source** — your agent identifier (required)
   - **kind** — one of `note`, `finding`, `decision`, `summary` (defaults to `note`)
   - **content** — the information to persist (required)

2. Run the following command:

```bash
curl -s -X POST "${INFOHUB_URL:-http://localhost:3456}/api/v1/segments/$ARGUMENTS/entries" \
  -H 'Content-Type: application/json' \
  -d '{"source":"<agent-id>","kind":"<kind>","content":"<content>"}'
```

3. A `201` response confirms the entry was persisted. If you get `423`, the segment is locked for compaction — wait for the `retry_after_ms` duration and retry.

## Guidelines

- Write entries as soon as you have a meaningful finding, decision, or piece of context.
- Keep `content` concise but self-contained — another agent reading it should understand it without extra context.
- Use `kind` to categorize: `finding` for discovered facts, `decision` for choices made, `note` for general context.
- Use a consistent `source` identifier so entries can be attributed.
