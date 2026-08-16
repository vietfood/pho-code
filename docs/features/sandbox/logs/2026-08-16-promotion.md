# Agent-tool sandbox promotion

Status: ready for review  
Owner: features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`2026-08-16-decision-pi-official-example.md`](./2026-08-16-decision-pi-official-example.md)

## Intent

Record owner decisions that close the sandbox research note and promote an end-to-end add-on product plus implementation plan. Implementation has not started.

## Contracts and files

- Product: [`../product.md`](../product.md)
- Plan: [`../implementation-plan.md`](../implementation-plan.md)
- Research retained as [`../research.md`](../research.md)
- Roadmap Phase F remains process extraction; this add-on does not wait on it

## Changes and decisions

Owner answers (2026-08-16):

1. Prefer the convenient path. If process extraction were required, the plan could exist but stay pending. **Selected: do not wait.** OS wrap of agent `bash` children does not need Phase F.
2. File-tool sandboxing was unknown; research of Cursor, Claude Code, and Codex informs the split in the product contract.
3. Permission-system does **not** ask for in-box agent `bash` once sandbox is on and healthy.
4. Network policy lives in **Settings**, not runtime grant prompts.
5. Pin Anthropic `@anthropic-ai/sandbox-runtime` and write a Pho-owned factory. Do not bake `pi-sandbox`.
6. macOS is the first verified surface.

## Verification

Not verified: every implementation and acceptance check in the sandbox plan remains outstanding.

## Mistakes and corrections

Do not describe this promoted plan as shipped. Do not call renderer sandboxing or permission dialogs OS containment. Do not treat this add-on as Phase F.

## Owner feedback

End-to-end product first; milestones may be expanded later if the contract is insufficient. Default remains research-informed: Cursor/Claude Code bash-box, not Codex’s sandboxed `apply_patch` helper.

## UI impact

A new Settings section **Sandbox** beside Permissions. Conversation chrome is unchanged except honesty/status copy. The owner terminal stays unsandboxed.

## Blockers and handoff

- Milestone 0 must pin `sandbox-runtime`, prove `sandbox-exec` from Electron main, and stage `rg` so GUI PATH is not a Homebrew dependency.
- Permission skip for sandboxed `bash` must preserve permanent-removal denies and must not auto-allow unsandboxed execution.
- In-process `read`/`write`/`edit` policy is part of the end-to-end product (Milestone 3), not an optional extra, because those tools never enter Seatbelt.
