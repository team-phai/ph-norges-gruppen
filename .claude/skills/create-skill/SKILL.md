---
name: create-skill
description: Create new agent skills for this project. Use when the user wants to add a new reusable capability, automate a repeatable workflow, capture a pattern as a skill, or says "create a skill", "make a skill", "add a skill", or "I keep doing X, can you automate it".
---

# Create Skill

Create new SKILL.md files for Claude Code.

## Skill Format

Every skill is a directory containing a `SKILL.md` file with YAML frontmatter:

```yaml
---
name: my-skill-name
description: What this skill does and when to use it. Be specific about trigger phrases and contexts.
---

# Skill Title

Instructions for the agent to follow when this skill is activated.
```

### Required Fields

- **name**: Lowercase, hyphens for spaces, max 64 characters. No reserved words ("anthropic", "claude").
- **description**: What the skill does AND when to trigger it. Max 1024 characters. Be slightly "pushy" — include trigger phrases, synonyms, and edge cases to avoid under-triggering.

## Where to Create

Place new skills in `.claude/skills/<skill-name>/SKILL.md`. Claude Code auto-discovers them.

```
.claude/skills/
├── get-token/
│   └── SKILL.md
├── analyze-challenge/
│   └── SKILL.md
├── create-skill/
│   └── SKILL.md
└── your-new-skill/
    └── SKILL.md
```

## Writing Guidelines

### Structure

1. Start with a one-line summary of what the skill does
2. List prerequisites (tools, auth, dependencies)
3. Write step-by-step instructions in imperative form
4. Include examples where helpful
5. Keep SKILL.md under 500 lines

### Description Best Practices

The description is the primary trigger mechanism. Include:
- What the skill does
- Specific user phrases that should trigger it ("get token", "start game")
- Contexts where it applies ("when beginning work in a freshly copied template")
- Adjacent scenarios it should cover

Example of a good description:
```
Retrieve a game token from app.ainm.no using Playwright. Use when the user
wants to play a challenge, get a token, start a game, needs a fresh WebSocket
URL, or says "get token", "start game", "play easy".
```

### Instruction Best Practices

- Use imperative form ("Navigate to...", "Extract the...", "Write to...")
- Explain the **why** behind important steps, not just the what
- Generalize — don't overfit to one specific example
- Include concrete examples and expected formats
- Reference bundled files when the skill needs supporting resources

### Progressive Disclosure

For complex skills, use a layered approach:

```
my-skill/
├── SKILL.md              # Main instructions (<500 lines)
├── scripts/
│   └── helper.py         # Executable scripts (run without loading into context)
└── references/
    └── api-spec.md       # Detailed docs (loaded only when needed)
```

- **SKILL.md body**: Core instructions, loaded when skill triggers
- **Bundled scripts**: Deterministic operations, executed via bash
- **Reference files**: Detailed docs, read only when relevant — reference them from SKILL.md with clear guidance on when to read

## After Creating

1. Tell the user what was created and what phrases will trigger it
2. Update AGENTS.md to list the new skill under "Available Skills"
3. Test the skill by asking the agent to perform the task it covers

## Template

Use this as a starting point for new skills:

```yaml
---
name: skill-name-here
description: Brief description of what this skill does. Use when the user wants to [specific actions], says "[trigger phrases]", or needs to [specific outcomes].
---

# Skill Name

One-line summary of what this skill does.

## Prerequisites

- List any required tools, auth, or dependencies

## Steps

### 1. First Step

Describe what to do first.

### 2. Second Step

Describe what to do next.

## Examples

Show concrete examples if helpful.
```
