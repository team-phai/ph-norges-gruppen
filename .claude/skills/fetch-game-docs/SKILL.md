---
name: fetch-game-docs
description: Fetch and parse challenge documentation from a given URL using Playwright. Use when the user wants to fetch docs, get challenge rules, update challenge docs, read a challenge specification, or says "fetch game docs", "get game rules", "update challenge docs", "what are the rules", "fetch docs". First argument is the URL of the page to scrape.
---

# Fetch Challenge Documentation

Scrape a challenge documentation page and save it as a structured markdown file that other agents can consume.

## Arguments

1. **URL** (required) — The URL of the documentation page to scrape. Example: `https://app.ainm.no/docs/norgesgruppen-data/overview`

## Prerequisites

- Playwright MCP tools must be available (browser_navigate, browser_snapshot)

## Steps

### 1. Navigate to the Documentation Page

Use Playwright to open the provided URL:

```
browser_navigate -> <URL from argument>
```

### 2. Capture the Page Content

Take an accessibility snapshot of the page. This captures all text, tables, code blocks, and structure without needing screenshots.

```
browser_snapshot
```

### 3. Identify Related Pages

Check the page navigation for related documentation pages (e.g., Submission, Scoring, Examples). Navigate to each and capture their content too.

### 4. Parse and Write the Markdown File

Extract all sections from the snapshots and write a well-structured markdown file to `docs/rules.md`. Preserve all content from all pages including:

- Overview and challenge description
- Submission format and requirements
- Input/output contract (data format, JSON schemas)
- Scoring formula and details
- Constraints (size limits, time limits, rate limits)
- Environment details (sandbox, packages, hardware)
- Code examples (with proper language-hinted code blocks)
- Common errors and troubleshooting
- Tips and best practices

Adapt to whatever sections the pages actually contain — do not assume a fixed structure.

### 5. Write Challenge Overview

Also write a concise `docs/challenge.md` with:
- Objective (1 paragraph)
- Format (challenge type)
- Scoring formula summary
- Key constraints (bullet list)
- Pointer to `docs/rules.md` for full details

### 6. Formatting Guidelines

- Use proper markdown tables, code blocks (with language hints like `json` and `python`), and headers
- Bold key values (limits, rules) so they stand out when scanning
- Structure the file so an agent reading it can build a working solution without visiting the website
- If the page content has changed from what's expected, adapt — extract whatever sections are present

## Output

The files `docs/rules.md` and `docs/challenge.md` will contain the complete challenge specification. Inform the user what was written and summarize the key mechanics.
