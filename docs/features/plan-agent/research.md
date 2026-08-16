# Plan / Agent modes and ask-user research

## Status

**Superseded as the product contract** by [`product.md`](./product.md) and [`implementation-plan.md`](./implementation-plan.md) on 2026-08-16. Kept as candidate research. Do not implement from this note.

Pho Code still has no Plan/Agent toggle, no structured ask-user tool, and no session todo surface in source.

Last evaluated: 2026-08-16 against:

- Pho Code's pinned Pi SDK `0.84.1` (`packages/runtime/node_modules/@earendil-works/pi-coding-agent`);
- the official Pi examples [`plan-mode`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/plan-mode/index.ts), [`questionnaire.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/questionnaire.ts), [`question.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/question.ts), and [`todo.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/todo.ts);
- [`@juicesharp/rpiv-ask-user-question`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question) `2.6.0` (MIT), especially the RPC dialog walker.

The numbered-version backlog already names this capability: [Plan and Agent modes with structured questions and optional session todo state](../../version/research-backlog.md). Owner promotion 2026-08-16 treats it as **one standalone add-on** with an end-to-end product (Plan/Agent, juicesharp-style ask-back, plan document). The plan document is part of that product, not a later add-on.

## Owner outcome

The owner should be able to choose, per chat, whether the agent is **planning** or **acting**, and the model should be able to **ask structured questions** instead of guessing.

A first useful product would:

- default to **Agent** (today's full tool set, still gated by the baked permission feature and V3 write/edit review);
- offer **Plan**: read-only exploration, write tools off, clarifying questions on, a numbered plan the owner can execute, stay in, or refine;
- give the model one `ask_user_question` tool in both modes;
- persist mode and plan state in Pi JSONL so resume restores them;
- stay disableable without breaking conversation, sessions, credentials, V3, permissions, context prompt, terminal, or sandbox.

The target is **mode + structured interruption**, not a second agent loop, not a TUI overlay, and not a sandbox.

## Why this can be one standalone add-on

[`research-backlog.md`](../../version/research-backlog.md) listed Plan/Agent as core-product research. It still ships or fails independently, the same way terminal and sandbox do:

- it is a baked inline factory plus a small protocol/UI slice;
- turning it off restores today's Agent-only behavior;
- it does not require session tree, subagents, OS sandbox, or a plan canvas;
- it can fail closed (no mode toggle, no ask-user tool) while chat continues.

It must **not** be described as:

- a sandbox (Plan only hides write tools; `bash` and in-process `read` still run with app authority);
- Cursor **Ask** mode (read-only Q&A with no plan). The ask-user tool is an interruption, not a third mode;
- a replacement for `@gotgenes/pi-permission-system` or V3 review;
- a plugin the user installs into another Pi.

## What exists today

| Surface | Current behavior | Plan/Agent gap |
| --- | --- | --- |
| Composer footer | Model and thinking selectors | No Plan/Agent control. Conversation UI lists Plan/Multitask as out of scope |
| Tools | Pi `read`/`write`/`edit`/`bash` plus baked retrieval, web, trash, GitHub, Cursor SDK | No session mode. Context prompt can disable tools, but that is inspect-only after the first message |
| Host UI | RPC `mode: "rpc"`. `select` / `confirm` / `input` / `notify` work. `custom` and `editor` throw. `setWidget` / `setStatus` are no-ops except permission YOLO | Official questionnaire and plan-mode TUI chrome cannot render |
| Permissions | Baby / okay / you got it / YOLO | YOLO still allows write tools. Plan must keep writes off even then |
| V3 | Tracks `write`/`edit` after they happen | Plan should prevent those calls; Execute then uses the existing ledger |
| Sandbox add-on | Approved, not implemented | Plan-mode bash regex is not that OS box. Do not wait on it |
| Slash `/` | Skills only | Pi `/plan` is a TUI command, not a Pho skill |

Pho Code already binds extensions with `mode: "rpc"` in `packages/runtime/src/pi-runtime.ts`. That is the correct host class for juicesharp's fallback and the wrong class for Pi's TUI questionnaire.

## The two references are layers, not drop-in packages

```text
Composer Plan / Agent toggle     (missing today)
        ^
        | typed session mode
Pho-owned plan-agent factory
        | tool gate + prompt + ask_user_question
        v
Pi ExtensionAPI (setActiveTools, before_agent_start, registerTool, appendEntry)
        ^
        | concepts only
Pi plan-mode example  +  juicesharp ask_user_question / Pi questionnaire
```

### Pi official plan-mode (`0.84.1` example)

Public URL: [earendil-works/pi `examples/extensions/plan-mode/index.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/plan-mode/index.ts). API source of truth: the same tree in pinned `0.84.1`.

What it actually does:

1. `/plan` or `Ctrl+Alt+P` toggles a boolean; `--plan` starts enabled.
2. While on, `pi.setActiveTools` drops `edit`/`write` and keeps `read`, `bash`, `grep`, `find`, `ls`, and `questionnaire`.
3. `tool_call` blocks `bash` unless `isSafeCommand` matches a regex allowlist.
4. `before_agent_start` injects a hidden `[PLAN MODE ACTIVE]` message, or an `[EXECUTING PLAN]` remainder list.
5. After a plan turn, it regex-extracts numbered steps under a `Plan:` header, then `ctx.ui.select`s Execute / Stay / Refine.
6. Execute restores tools, sets `executing`, and asks the model to emit `[DONE:n]` tags. A TUI widget shows progress.
7. State is `pi.appendEntry("plan-mode", { enabled, todos, executing, toolsBeforePlanMode })` and restored on `session_start`.

Take from it:

- session-scoped Plan vs execute vs normal;
- disable built-in write tools rather than asking the model to refrain;
- inject mode context each turn;
- persist a JSON-safe custom entry;
- owner confirmation before leaving Plan for execution;
- keep other currently active tools (retrieval, web, ask-user) instead of replacing the whole tool list with four names.

Do not take from it:

- `/plan`, `--plan`, or `Ctrl+Alt+P` as the desktop control (composer toggle + protocol command);
- `ctx.ui.editor` for Refine (unsupported; throws);
- `ctx.ui.setWidget` / `setStatus` progress chrome (no-ops here);
- hardcoded `PLAN_MODE_TOOLS` / `NORMAL_MODE_TOOLS` that omit `fffind`, `ffgrep`, `web_search`, `fetch_content`, `move_to_trash`, GitHub, and Cursor tools;
- regex `Plan:` / `[DONE:n]` as the only plan representation;
- `curl` classified as a safe plan-mode command (network egress);
- npm `@kmiyh/pi-plan-mode`, which is this example packaged for Pi CLI users.

The bash allowlist is defense-in-depth theater, not containment. `isSafeCommand` allows `curl` and `wget -O -`. Honest Plan mode means **no write/edit/trash/mutating GitHub**, not “shell is safe.” Future sandbox wrapping of `bash` is a different add-on.

### Pi official questionnaire (`0.84.1` example)

[`questionnaire.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/questionnaire.ts) is what plan-mode expects under the name `questionnaire`. It is a tabbed TUI overlay via `ctx.ui.custom`. It **returns immediately with “UI not available” unless `ctx.mode === "tui"`**. Pho Code is `rpc`. Baking this file would register a tool the model can call and that always fails.

Sibling examples `question.ts` (single question) and `qna.ts` (extract questions into the TUI editor) have the same host mismatch.

Take from it:

- one tool for 1–N questions with labels, prompts, options, and optional “Type something.”;
- a Submit review step when there are several questions;
- cancelled vs answered envelopes the model can continue from.

Do not take from it: `ctx.ui.custom`, `@earendil-works/pi-tui` components, or the `mode === "tui"` gate.

### juicesharp `ask_user_question` (`2.6.0`, MIT)

[`@juicesharp/rpiv-ask-user-question`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question) is the stronger **ask-back** reference because it already splits TUI vs RPC.

What it actually does:

- registers `ask_user_question` with 1–4 questions, 2–4 options each, optional `multiSelect` and markdown `preview`;
- TUI path: `ctx.ui.custom` tabbed overlay, notes, collapse, i18n, terminal BEL;
- RPC path: when `ctx.mode === "rpc"`, `runRpcQuestionnaire` walks `ui.select` then `ui.input` and returns the same result envelope;
- strips the tool when `hasUI` is false;
- reads optional `~/.config/rpiv-ask-user-question/config.json`;
- depends on `pi-tui`, TypeBox, `@juicesharp/rpiv-config`, optional `@juicesharp/rpiv-i18n`.

Pho Code already has `mode: "rpc"` and working `select`/`input`. A baked copy of this package would therefore **function**, but poorly:

- sequential permission-style dialogs, no tab review, no side-by-side preview, multi-select as comma-separated numbers;
- XDG config and prompt-snippet settings violate the “no generic/user-installable feature config” rule;
- `pi-tui` and the 560 ms TUI graph would ship unused and still call `custom` if `mode` were ever wrong;
- permission and ask-user would share one `HostDialog` surface and could collide if both wait.

Take from it:

- tool name, schema limits, reserved labels (`Other`, `Type something.`, `Next`);
- result envelope (`answers[]`, `cancelled`, `error` codes, model-facing prose);
- “do not treat host failure as a user decline”;
- RPC walker as the **first** desktop path;
- prompt guidelines that force 2–4 authored options instead of a wall of prose.

Do not take from it:

- npm `@juicesharp/rpiv-ask-user-question` as a baked path (same decision as not baking `pi-sandbox`);
- XDG config, i18n peer, BEL, collapse shortcut, TUI overlay;
- `ctx.ui.custom` as a product requirement.

## Recommended product shape

One baked feature, one factory, two owner-visible modes, one ask-user tool.

| Mode | Tools | Ask-user | Writes | Typical loop |
| --- | --- | --- | --- | --- |
| **Agent** (default) | Full enabled set (context prompt ∩ permissions) | Available | Yes, then V3 | Today's chat |
| **Plan** | Read/search/web/ask-user; `write`/`edit`/`move_to_trash` off; mutating GitHub off; `bash` still permission-gated and not claimed safe | Available and encouraged | No | Explore, ask, write a plan |
| **Execute** (transient) | Same as Agent | Available | Yes | Owner confirmed “run this plan”; restore Agent when the plan completes or the owner cancels |

Do **not** add Cursor Ask as a third mode. If the owner later wants read-only Q&A with no plan artifact, that is a flag on Plan, not a new workstream.

### Ask-user is not a mode

Cursor's Ask mode is “chat without edits.” juicesharp and Claude `AskUserQuestion` are “pause the run and collect decisions.” Pho Code wants the second. The tool stays registered in Agent so the model can still check an implementation choice mid-work; Plan should prompt it more aggressively.

### Plan is not a sandbox

Personal trust policy still applies. Plan mode is a **tool-set and prompt policy**. Renderer sandboxing, permission dialogs, and a future OS bash box are separate claims. Settings and UI copy must stay honest.

## Architecture if promoted

Stay inside the accepted direction:

```text
renderer -> protocol <- shell adapter -> application -> runtime -> Pi SDK
```

| Layer | Ownership |
| --- | --- |
| Renderer | Composer Plan/Agent control; questionnaire dock or reused `HostDialog`; compact plan/todo chip. No Electron, no Pi |
| Protocol | JSON-safe `sessionMode`, plan snapshot, ask-user request/result. No TUI objects |
| Application | Validate composite session identity; refuse mode changes on a missing/replaced chat |
| Runtime factory | Inline `pho-plan-agent`: register tool, inject prompts, intersect tools, persist custom entry, emit dialogs |
| Pi SDK | `registerTool`, `setActiveTools` / `setActiveToolsByName`, `before_agent_start`, `tool_call`, `appendEntry`, session JSONL |
| Host UI | Structured `select`/`input` first. A later questionnaire kind may extend `HostDialogKind`. Never `ctx.ui.custom` |

### Tool gating vs context prompt

Context prompt already calls `session.setActiveToolsByName(enabledToolNames(record.sections))` and becomes inspect-only after the first message. Plan mode must **intersect**, not replace:

```text
activeTools = contextPromptEnabled ∩ modeAllowlist ∪ alwaysAskUser
```

If the owner turned `bash` off in an empty chat, Plan must not turn it back on. If Plan is on, `write`/`edit`/`move_to_trash` stay off even when YOLO is on. Rebind on session replace the same way permissions already rebind.

### Persistence

Use a Pi custom session entry, same pattern as `pho-code.context-prompt`:

```ts
{
  customType: "pho-code.plan-agent",
  data: {
    mode: "plan" | "agent",
    executing?: boolean,
    todos?: { step: number; text: string; completed: boolean }[],
  },
}
```

Pi JSONL remains authoritative. Do not store mode in renderer cache only. Fork/tree is not in this add-on; last-wins custom entry is enough until that phase exists. Pi's `todo.ts` example stores todos in tool-result details so branches stay consistent — prefer that if a todo **tool** ships in a later slice.

### Host dialog collision

Permission `select` and ask-user `select` share one pending map and one renderer dock today. The promoted product adds a dedicated questionnaire kind rather than overloading permission rows. Sequential `select`/`input` is a fallback only when the questionnaire card cannot render, matching juicesharp’s RPC walker — not the intended desktop UX.

### Execute / Stay / Refine

The promoted product uses an explicit Execute / Stay / Refine control on the Plan surface (and a matching confirmation). Refine is a follow-up message, not `ctx.ui.editor`. Do not auto-prompt at every `agent_end`.

## Plan document (promoted into this add-on)

Cursor canvases are live React documents beside the chat. The sandbox research canvas is an example of why a **plan as a document** beats a `Plan:` regex in transcript text.

The promoted product takes the document, not the React compiler:

- a Plan surface on the existing right sidebar;
- bounded sanitized markdown/mermaid plus todos;
- owner edit then Execute;
- no model-generated React in the renderer.

See [`product.md`](./product.md). Live React canvases remain out of scope.

## What not to implement

- Baking `@juicesharp/rpiv-ask-user-question`, `@kmiyh/pi-plan-mode`, or Pi example paths from `node_modules` into `HarnessFeatureManifest.extensionPaths`.
- Enabling ambient Pi package discovery so the owner can `pi install` these.
- `ctx.ui.custom`, terminal widgets, `/plan` as the only entry point.
- A third Ask mode, subagents, or worktrees.
- Claiming Plan contains `bash`, MCP, or extension code.
- Parsing streaming tokens for `[DONE:n]` as authoritative todo state.
- Generic questionnaire JSON in Settings.

Implementation sequence lives in [`implementation-plan.md`](./implementation-plan.md), not here.

## Trust, data, and lifecycle

- Feature code is source-reviewed and baked. Users cannot add questionnaire extensions at runtime.
- Ask-user answers and plan todos live in the session JSONL. They are not encrypted at rest.
- Cancelled questionnaires must abort that tool call without treating it as a permission deny for other tools.
- Session replace, abort, and app quit cancel pending ask-user dialogs the same way permissions already cancel.
- Packaged builds resolve the factory from application resources; there is no npm install step for the owner.

## Owner decisions closed at promotion

Recorded in [`logs/2026-08-16-promotion.md`](./logs/2026-08-16-promotion.md). The research “first slice / dedicated dock later” split is rejected: the product is end-to-end, including the Claude/juicesharp ask-back card and the Plan document surface.

## Related records

- Product: [`product.md`](./product.md)
- Implementation contract: [`implementation-plan.md`](./implementation-plan.md)
- Backlog item: [`version/research-backlog.md`](../../version/research-backlog.md)
- Conversation chrome: [`ui/implementation/conversation-ui.md`](../../ui/implementation/conversation-ui.md)
- Host UI contract: [`architecture/extension-model.md`](../../architecture/extension-model.md)
- Sandbox (separate): [`../sandbox/product.md`](../sandbox/product.md)
- Attribution inventory: [`../../references-and-attribution.md`](../../references-and-attribution.md)
