---
name: refresh-token
description: Refresh auth environment variables in .claude/settings.json by generating a new raicode token. Use when the user wants to refresh a token, update a token, rotate credentials, get a new token, refresh auth, update auth, or says "refresh token", "update token", "new token", "rotate token", "refresh auth", "update auth", "token expired", "re-auth".
---

# Refresh Token

Generate a fresh raicode auth token and update `.claude/settings.json` with the new environment variables.

## Prerequisites

- `raicode` CLI must be installed and authenticated
- `.claude/settings.json` must exist in the project root

## Steps

### 1. Generate a New Token

Run the following command:

```bash
raicode manage token create --export --expires 360d --name "claude-cli"
```

This outputs a set of `export VAR="value"` lines followed by a comment with the token ID.

### 2. Parse the Output

Extract all `export KEY="VALUE"` pairs from the command output. The expected variables are:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- `ANTHROPIC_DEFAULT_OPUS_MODEL`
- `ANTHROPIC_DEFAULT_SONNET_MODEL`
- `CLAUDE_CODE_MAX_OUTPUT_TOKENS`
- `SPECIALIST_MODELS`
- `DISABLE_TELEMETRY`

### 3. Read Current Settings

Read `.claude/settings.json` from the project root. Identify all existing keys in the `env` object.

### 4. Update Environment Variables

For each variable parsed from the token command output, update the corresponding key in the `env` object of `settings.json`. **Preserve any existing env variables that are NOT in the token output** (e.g., `CLAUDE_CODE_EFFORT_LEVEL`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`, or any other custom variables).

Use the Edit tool to replace the env values in-place rather than rewriting the entire file, to minimize risk of data loss.

### 5. Confirm

After updating, tell the user:
- The token was refreshed successfully
- Which variables were updated
- Remind them to restart Claude Code for the new env variables to take effect

## Example

Command output:
```
export ANTHROPIC_API_KEY=""
export ANTHROPIC_AUTH_TOKEN="eyJhb..."
export ANTHROPIC_BASE_URL="https://gateway.raicode.no"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="eu-haiku-4-5"
export ANTHROPIC_DEFAULT_OPUS_MODEL="eu-opus-4-6"
export ANTHROPIC_DEFAULT_SONNET_MODEL="eu-sonnet-4-6"
export CLAUDE_CODE_MAX_OUTPUT_TOKENS="64000"
export DISABLE_TELEMETRY="1"
export SPECIALIST_MODELS="{...}"
# Token ID: abc123 (Name: claude-cli)
```

Each `export` line maps directly to a key in `settings.json` `env` object.
