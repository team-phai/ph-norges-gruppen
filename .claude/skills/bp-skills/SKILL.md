---
name: bp-skills
description: >
  Skill authoring best practices and conventions from Anthropic's official documentation.
  Provides reference knowledge for writing effective SKILL.md files.
  Use when creating, reviewing, or improving Claude Code skills.
---

# Skill Authoring Best Practices

Reference material for writing effective Claude Code skills, distilled from Anthropic's official skill authoring documentation.

## Skill Structure

A skill is a directory with `SKILL.md` as entrypoint. Supporting files are optional.

```
my-skill/
├── SKILL.md           # Required — YAML frontmatter + markdown body
├── reference.md       # Optional — loaded by Claude on-demand
├── examples.md        # Optional — loaded by Claude on-demand
└── scripts/
    └── helper.py      # Optional — executed by Claude, not loaded into context
```

### YAML Frontmatter Fields

All fields are optional. Only `description` is recommended.

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `name` | string | Lowercase letters, numbers, hyphens. Max 64 chars. No "anthropic" or "claude". | Slash command name. Defaults to directory name. |
| `description` | string | Max 1024 chars. No XML tags. Third person. | Discovery: what + when. |
| `disable-model-invocation` | boolean | — | `true` prevents Claude from auto-loading. For side-effect skills. |
| `user-invocable` | boolean | — | `false` hides from `/` menu. For background knowledge only. |
| `allowed-tools` | string | Comma-separated tool names | Restricts tools when skill is active. |
| `context` | string | `fork` | Runs in isolated subagent. |
| `agent` | string | `Explore`, `Plan`, `general-purpose`, or custom | Subagent type when `context: fork`. |
| `argument-hint` | string | — | Autocomplete hint, e.g. `[issue-number]`. |
| `model` | string | — | Override model when skill is active. |
| `hooks` | object | — | Lifecycle hooks scoped to this skill. |

### String Substitutions

| Variable | Resolves to |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed at invocation |
| `$ARGUMENTS[N]` or `$N` | Argument by 0-based index |
| `${CLAUDE_SKILL_DIR}` | Absolute path to the skill's directory |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `` !`command` `` | Shell command output (preprocessed before Claude sees it) |

### Invocation Control

| Frontmatter | User can invoke | Claude can invoke | Context behavior |
|-------------|-----------------|-------------------|------------------|
| (default) | Yes | Yes | Description always loaded; body loaded when invoked |
| `disable-model-invocation: true` | Yes | No | Not in context at all |
| `user-invocable: false` | No | Yes | Description always loaded; body loaded when invoked |

## Content Types

**Reference content** — Conventions, patterns, domain knowledge. Runs inline alongside conversation context. No `context: fork`.

**Task content** — Step-by-step instructions for a specific action. Often paired with `disable-model-invocation: true` to prevent auto-triggering.

**Orchestration content** — Complex workflows run in a subagent via `context: fork` + `agent`. The skill body becomes the subagent's prompt and needs an actionable task, not just guidelines.

## Skill Locations

| Level | Path | Scope | Priority |
|-------|------|-------|----------|
| Enterprise | Managed settings | All org users | Highest |
| Personal | `~/.claude/skills/<name>/SKILL.md` | All your projects | |
| Project | `.claude/skills/<name>/SKILL.md` | This project | |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | Where enabled | Namespaced (no conflicts) |

Same-name skills: enterprise > personal > project.

## Core Quality Principles

### Conciseness

The context window is a shared resource. Skill metadata (name + description) is pre-loaded at startup. The full SKILL.md body loads only when invoked. Once loaded, every token competes with conversation history and other context.

Default assumption: Claude is already very capable. Only include context Claude doesn't already have. Each piece of content should justify its token cost.

Concise (~50 tokens):
```markdown
Use pdfplumber for text extraction:
\`\`\`python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
\`\`\`
```

Verbose (~150 tokens, bad):
```markdown
PDF (Portable Document Format) files are a common file format...
There are many libraries available... pdfplumber is recommended
because it's easy to use... First, you'll need to install it...
```

### Degrees of Freedom

Match specificity to fragility:

- **High freedom** (prose) — Multiple valid approaches. Code review, analysis tasks.
- **Medium freedom** (pseudocode/templates) — Preferred pattern exists, some variation OK.
- **Low freedom** (exact scripts) — Fragile operations, consistency critical. Database migrations, deployments.

### Progressive Disclosure

SKILL.md is a table of contents. Body should stay under 500 lines. Detailed reference material belongs in separate files — they consume zero context tokens until Claude reads them.

All file references must be **one level deep** from SKILL.md. Nested references (A references B which references C) cause partial reads.

Reference files over 100 lines should include a table of contents at the top.

## Description Conventions

The description drives skill discovery from potentially 100+ available skills.

- **Third person always** — "Processes files and generates reports." Not "I can help you" or "You can use this to."
- **What + when** — "Extracts text from PDFs. Use when working with PDF files or document extraction."
- **Specific key terms** — Match natural user language. "Helps with documents" is too vague.

## Naming Conventions

- **Gerund form preferred**: `writing-skills`, `processing-pdfs`, `testing-code`
- **Acceptable**: noun phrases (`pdf-processing`) or action verbs (`process-pdfs`)
- **Avoid**: vague names (`helper`, `utils`, `tools`, `documents`)
- **Forbidden**: reserved words "anthropic" or "claude" in the name

## Structure Patterns

### Guide with references
SKILL.md has a quick start + links to detailed files. Claude loads only what's needed.

### Domain-specific organization
Separate files per domain (`reference/finance.md`, `reference/sales.md`). SKILL.md links each. Claude reads only the relevant domain file.

### Conditional details
Basic content inline, advanced content in separate files loaded on condition.

## Workflow Patterns

### Checklist pattern
Provide a copyable checklist Claude can track through multi-step operations.

### Validation loop
Run validator, fix errors, repeat. Catches errors before they propagate.

### Conditional workflow
Decision points that route to different sub-workflows based on context.

### Template pattern
Output templates with explicit strictness level ("ALWAYS use this exact structure" vs. "sensible default, adapt as needed").

### Examples pattern
Input/output pairs demonstrate desired style more precisely than descriptions.

## Anti-patterns

- **Verbose explanations** of concepts Claude already knows
- **Multiple equivalent options** without a clear default
- **Deeply nested file references** (SKILL.md → A.md → B.md)
- **Time-sensitive content** ("if before August 2025...") — use an "old patterns" section instead
- **Inconsistent terminology** — one term per concept throughout
- **Windows-style paths** — always forward slashes
- **Magic numbers** in scripts without justification
- **Scripts that crash** instead of handling errors explicitly
- **Assuming tools are installed** without listing dependencies

## Script Conventions

- Scripts should handle errors explicitly, not punt to Claude
- All constants should be justified with comments
- Required packages must be listed in SKILL.md
- Clear distinction between "execute this script" and "read as reference"
- Validation/verification steps for critical operations
- Feedback loops for quality-critical tasks

## Testing Guidance

- Test skill discovery: ask something matching the description, verify auto-trigger
- Test direct invocation: `/skill-name` loads full content correctly
- Test with real usage scenarios, not just synthetic
- If targeting multiple models: Haiku needs more guidance, Opus needs less — aim for instructions that work across all

## Full Checklist

For the complete pre-publish authoring checklist, see [checklist.md](checklist.md).
