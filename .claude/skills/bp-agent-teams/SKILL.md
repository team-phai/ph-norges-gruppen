---
name: bp-agent-teams
description: >
  Agent teams architecture, coordination patterns, and best practices
  from Anthropic's official documentation. Provides reference knowledge
  for orchestrating multi-agent Claude Code sessions. Use when creating,
  reviewing, or working with agent teams.
---

# Agent Teams Best Practices

Reference material for orchestrating teams of Claude Code sessions, distilled from Anthropic's official agent teams documentation.

## Prerequisites

Agent teams are experimental. Requires environment variable:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

## Architecture

| Component | Role |
|-----------|------|
| **Team lead** | Main Claude Code session. Creates team, spawns teammates, coordinates work. |
| **Teammates** | Separate Claude Code instances working on assigned tasks. |
| **Task list** | Shared work items that teammates claim and complete. Stored at `~/.claude/tasks/{team-name}/`. |
| **Mailbox** | Messaging system for inter-agent communication. |

Team config stored at `~/.claude/teams/{team-name}/config.json`. Contains `members` array with each teammate's `name`, `agentId`, and `agentType`.

## Task Management

Tasks have three states: **pending**, **in progress**, **completed**. Tasks can depend on other tasks — a pending task with unresolved dependencies cannot be claimed until those dependencies complete.

Task assignment:
- **Lead assigns** — explicit delegation to a specific teammate
- **Self-claim** — after finishing a task, a teammate picks up the next unassigned, unblocked task

Task claiming uses file locking to prevent race conditions. The system manages dependencies automatically — when a task completes, blocked tasks unblock without manual intervention.

## Task Sizing

- **Too small** — coordination overhead exceeds benefit
- **Too large** — teammates work too long without check-ins, increasing risk of wasted effort
- **Right size** — self-contained units producing a clear deliverable (a function, a test file, a review)

**5–6 tasks per teammate** keeps everyone productive without excessive context switching.

## Team Sizing

- Token costs scale linearly — each teammate has its own context window
- Coordination overhead increases with more teammates
- Diminishing returns beyond a certain point

**3–5 teammates** works for most workflows. Three focused teammates often outperform five scattered ones.

## Teammate Context

Teammates load the same project context as a regular session: CLAUDE.md, MCP servers, and skills. They also receive the spawn prompt from the lead. The lead's conversation history does **not** carry over.

## Communication

- **Automatic message delivery** — messages delivered to recipients automatically. No polling needed.
- **Idle notifications** — when a teammate finishes and stops, it automatically notifies the lead.
- **Shared task list** — all agents can see task status and claim available work.

Message types:
- **message** — send to one specific teammate
- **broadcast** — send to all teammates simultaneously. Use sparingly — costs scale linearly with team size.

## Permissions

Teammates start with the lead's permission settings. If the lead uses `--dangerously-skip-permissions`, all teammates do too. Individual teammate modes can be changed after spawning but not at spawn time.

Pre-approve common operations in permission settings before spawning teammates to reduce interruptions.

## Quality Gates

Two hooks for enforcing rules:
- **`TeammateIdle`** — runs when teammate is about to go idle. Exit code 2 sends feedback and keeps teammate working.
- **`TaskCompleted`** — runs when task is being marked complete. Exit code 2 prevents completion and sends feedback.

## Git Worktrees for Teammate Isolation

Each spawned teammate should work in its own git worktree to prevent file conflicts. Do **not** rely on `isolation: worktree` — it does not work reliably. Create worktrees explicitly before spawning teammates.

### Worktree conventions

- Create worktrees at `<repo>/.claude/worktrees/<name>` with a branch named `worktree-<name>`
- Each worktree has its own files and branch while sharing git history and remote connections
- Add `.claude/worktrees/` to `.gitignore`
- Each new worktree needs its own dependency installation (`pnpm install`, `npm install`, etc.) since `node_modules` is not shared

### Spawn prompt conventions

Spawn prompts must include the worktree path so teammates operate in isolation. Since teammates don't inherit conversation history, spawn prompts should also include task-specific details, file paths, and constraints.

### Worktree cleanup

- **No changes** — worktree and branch removed automatically on exit
- **Changes or commits exist** — Claude prompts to keep or remove

## Shutdown and Cleanup

- Shutdown requests are sent to each teammate. Teammates can approve (exit) or reject (continue working).
- `TeamDelete` removes shared team resources after all teammates are shut down. Fails if active teammates remain.
- Only the lead should run cleanup. Teammates' team context may not resolve correctly.

## Anti-patterns

- **Relying on `isolation: worktree`** — does not work reliably. Create worktrees explicitly.
- **Two teammates editing the same file** — leads to overwrites. Break work so each teammate owns different files.
- **Leaving teams unattended** — increases risk of wasted effort. Monitor progress and redirect approaches that aren't working.
- **Lead implementing instead of delegating** — tell it to wait for teammates to complete their tasks.
- **Skipping permission pre-approval** — teammate permission requests bubble up to the lead, creating friction.
- **Spawning too many teammates** — three focused teammates outperform five scattered ones.
- **Tasks too large or too small** — too small adds overhead, too large risks wasted effort without check-ins.
- **Insufficient spawn prompt context** — teammates don't inherit conversation history. Include file paths, constraints, and task-specific details.
- **Broadcasting for routine messages** — costs scale linearly with team size. Use direct messages by default.

## Limitations

- **No session resumption** for in-process teammates — `/resume` and `/rewind` don't restore them.
- **Task status can lag** — teammates sometimes fail to mark tasks completed, blocking dependents.
- **One team per session** — clean up before starting a new one.
- **No nested teams** — teammates cannot spawn their own teams.
- **Lead is fixed** — cannot promote a teammate or transfer leadership.
