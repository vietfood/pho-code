# Agent can load enabled skills without `/`

Kind: change
Status: in source
Owner: V5 / Pho Agent skill primitives
Owning plan: [`../implementation-plan.md`](../implementation-plan.md)
Related logs: [`2026-08-20-m0-harness-ownership-expansion.md`](./2026-08-20-m0-harness-ownership-expansion.md), [`../../../ui/logs/2026-08-27-change-agent-skill-invocation.md`](../../../ui/logs/2026-08-27-change-agent-skill-invocation.md)

## Intent

Owner showed a Skill (`read_skill`) call that failed unless a skill had been inserted with `/`. Agents should load enabled skills on their own when the task matches.

## Affected contracts

- `@pho-agent/runtime` `read_skill` tool description, guidelines, and execute miss copy
- `SkillSourceRegistry.listInvocableSkills()`
- `disable-model-invocation` frontmatter (slash-only, matching Pi / Agent Skills)
- Settings Skills trust notice and enable-source compatibility copy
- Accepted architecture: skill catalog is advertised; full Markdown is still not baked into Pi `additionalSkillPaths`

## Changes and decisions

- `read_skill` now tells the model to call it when a listed skill matches. `/` remains an owner shortcut that expands the body on send.
- The tool description includes an `<available_skills>` catalog of name + description (no filesystem paths). The catalog is a getter over the live registry.
- Compatible and limited skills from enabled sources are invocable. Shadowed, incompatible, and `disable-model-invocation: true` skills are not advertised; named load and `/` still work for an enabled slash-only skill.
- Project `.agents/skills` paths are still not a Pho Code source. A name such as `test-pho-code` only loads if that directory exists in an enabled user root (or Built in).

## Verification

- **unit verified:** `bun test packages/pho-agent/packages/runtime/test/skill-invoke.test.ts packages/runtime/test/skill-source.test.ts packages/protocol/test/skills.test.ts packages/ui/test/skills-settings.test.ts` — 20 pass.
- **typecheck:** `bun run --filter @pho-agent/runtime typecheck`, `bun run --filter @pho-agent/protocol typecheck`, `bun run --filter @pho-code/protocol typecheck`, `bun run --filter @pho-code/ui typecheck` — pass. `@pho-code/runtime` still fails on pre-existing hosted-runtime/Codex types unrelated to this slice.
- **lint:** `bunx eslint` on the changed skill files — pass.
- **desktop / packaged:** not verified. Tool description and Settings copy only; no IPC shape change.

## Handoff

Living behavior: [`../../../architecture/extension-model.md`](../../../architecture/extension-model.md). Settings copy is in the reciprocal UI log.
