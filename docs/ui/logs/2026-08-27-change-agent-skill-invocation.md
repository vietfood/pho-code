# Agent skill invocation without `/`

Kind: change
Status: in source
Surface: Settings Skills trust notice; transcript Skill (`read_skill`) tool
Owner: conversation UI track (copy) / V5 skill primitives (behavior)
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`../../version/v5/logs/2026-08-27-change-agent-skill-invocation.md`](../../version/v5/logs/2026-08-27-change-agent-skill-invocation.md)

## Intent

Owner: skills could only be injected at prompt time with `/`. The agent should be able to call them.

## Expected / actual (before)

Expected: the agent sees enabled skills and calls Skill (`read_skill`) when the task matches.
Actual: the tool told the model to call only when the owner named the skill; missing-name copy said to insert with `/`.

## Changes

- Settings trust notice and enable-source dialog now say skills are available in `/` **and** to the agent. Names and descriptions go to the model; full instructions load on insert or `read_skill`.
- Composer `/` chips are unchanged.

## Verification

- **unit verified:** `bun test packages/ui/test/skills-settings.test.ts packages/protocol/test/skills.test.ts` with the V5 skill-invoke/source tests — 20 pass across the four focused files.
- **desktop:** not verified.

## Handoff

Product behavior lives in architecture / V5. This record covers Settings copy only.
