# Skill Authoring Checklist

Run through this before sharing or committing a skill.

## Frontmatter

- [ ] `name` is lowercase, hyphens only, max 64 chars, no "anthropic" or "claude"
- [ ] `description` is non-empty, max 1024 chars, third person, includes what + when
- [ ] `disable-model-invocation: true` set if skill has side-effects (deploy, send messages)
- [ ] `user-invocable: false` set if skill is background knowledge only
- [ ] `allowed-tools` set if skill should restrict tool access
- [ ] `context: fork` set if skill needs isolated execution

## Content Quality

- [ ] SKILL.md body is under 500 lines
- [ ] Only includes context Claude doesn't already have
- [ ] Description is specific with key terms matching natural user language
- [ ] No time-sensitive information (or moved to "old patterns" section)
- [ ] Consistent terminology throughout — one term per concept
- [ ] Examples are concrete input/output pairs, not abstract
- [ ] All file references are one level deep from SKILL.md
- [ ] Reference files over 100 lines have a table of contents
- [ ] Progressive disclosure used — detailed content in separate files
- [ ] Workflows have clear numbered steps

## Scripts (if applicable)

- [ ] Scripts handle errors explicitly, not punting to Claude
- [ ] No magic numbers — all constants justified with comments
- [ ] Required packages listed in instructions
- [ ] All file paths use forward slashes
- [ ] Validation/verification steps for critical operations
- [ ] Feedback loops included for quality-critical tasks
- [ ] Clear distinction between "execute this script" vs "read as reference"

## Structure

- [ ] Skill directory matches `name` field
- [ ] SKILL.md is the single entrypoint
- [ ] Supporting files are referenced from SKILL.md with context on when to load
- [ ] No deeply nested file references (A → B → C)

## Testing

- [ ] Invoke with `/skill-name` — full content loads correctly
- [ ] Trigger contextually — ask something matching the description, skill auto-loads
- [ ] Test with real usage scenarios, not just synthetic ones
- [ ] If targeting multiple models: test with Haiku, Sonnet, and Opus

## Claude Code Integration

- [ ] Skill registered in project CLAUDE.md `## Skills` section (if project skill)
- [ ] Skill appears in "What skills are available?" query
- [ ] Arguments work correctly via `$ARGUMENTS` / `$0` substitutions (if used)
