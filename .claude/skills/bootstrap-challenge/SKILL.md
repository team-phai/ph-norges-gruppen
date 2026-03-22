---
name: bootstrap-challenge
description: >
  Bootstraps a new hackathon challenge workspace from documentation.
  Fetches challenge docs via Playwright, creates docs/challenge.md and
  docs/rules.md, sets up standard directories, and updates CLAUDE.md.
  Use when starting a new challenge, setting up a workspace, onboarding
  to a challenge, or on phrases like "bootstrap challenge", "set up challenge",
  "new challenge", "initialize workspace".
argument-hint: <docs-url>
context: fork
agent: general-purpose
---

# Bootstrap Challenge

End-to-end workspace setup for a new hackathon challenge from its documentation URL.

## Arguments

- `$ARGUMENTS` — Documentation URL (required). Example: `https://app.ainm.no/docs/norgesgruppen-data/overview`

## Checklist

```
- [ ] Step 1: Navigate to docs URL with Playwright
- [ ] Step 2: Scrape all documentation pages (overview, submission, scoring, examples)
- [ ] Step 3: Write docs/rules.md (full specification)
- [ ] Step 4: Write docs/challenge.md (concise overview)
- [ ] Step 5: Derive challenge ID → update CLAUDE.md
- [ ] Step 6: Create standard directories, hand off to team-leader
```

---

## Step 1 — Navigate to Documentation

Open `$ARGUMENTS` using Playwright `browser_navigate`. Take a `browser_snapshot` to capture all page content.

---

## Step 2 — Scrape All Documentation Pages

From the page navigation, identify all related documentation pages. For example, NorgesGruppen Data has:
- Overview
- Submission
- Scoring
- Examples

Navigate to each page sequentially, taking a `browser_snapshot` of each. Accumulate all content.

---

## Step 3 — Write `docs/rules.md`

Create `docs/` if it doesn't exist. Write a **complete technical reference** — omit nothing. This is the sole implementation reference for all teammates.

Required sections (adapt headings to actual content):

```markdown
# Challenge Rules

## Overview
[Challenge type, objective, how points are scored]

## Submission Format
[How to submit: zip structure, API endpoint, file format]

## Input/Output Contract
[What your code receives and must produce]

## Scoring
[Exact scoring formula, bonuses, penalties]

## Constraints
[Limits: file size, time, rate limits, sandbox restrictions]

## Environment
[Runtime environment: packages, hardware, restrictions]

## Examples
[Code examples, sample data, common errors]
```

Include all JSON schema examples, code samples, and tables exactly as found in the documentation.

---

## Step 4 — Write `docs/challenge.md`

Write a **concise overview** for quick orientation. Target: 1–2 pages.

```markdown
# Challenge Overview

## Objective
[One paragraph: what you must do to score points]

## Format
[Challenge type: object detection, optimization, real-time game, etc.]

## Scoring
[Scoring formula summary and key numbers]

## Key Constraints
[Top 5–8 most important constraints as a bullet list]

## Full Specification
See `docs/rules.md` for complete rules, schemas, and all details.
```

---

## Step 5 — Derive Challenge ID and Update `CLAUDE.md`

### Derive the challenge ID

Read `docs/challenge.md`. Produce a **lowercase, hyphen-separated slug** of 1–3 meaningful words from the challenge name.

### Update `CLAUDE.md`

Append an `## Active Challenge` section:

```markdown
## Active Challenge

- **ID**: `<challenge-id>`
- **Type**: <challenge type>
- **InfoHub segment**: `<challenge-id>`
- **Docs**: `docs/challenge.md` (overview), `docs/rules.md` (full spec)
```

---

## Step 6 — Create Dirs, Hand Off

### Create standard directories

```bash
mkdir -p docs src
```

### Spawn team-leader

Use the Agent tool with `subagent_type: "team-leader"` and pass:

1. The full content of `docs/challenge.md`
2. The path to `docs/rules.md` with instruction to read it for full details
3. The challenge ID for InfoHub segment
4. Request to design solution architecture and create initial implementation

---

## Error Handling

| Situation | Action |
|-----------|--------|
| URL unreachable | Stop immediately, report error. Do not write partial docs. |
| Missing documentation pages | Proceed with what's available, note gaps in docs. |
| `docs/rules.md` already exists | Overwrite — this is a re-bootstrap. |
