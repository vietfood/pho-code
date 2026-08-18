# Product definition: Plan / Agent and ask-user

## Status

Owner-approved add-on product boundary, 2026-08-16. This is **not** v3, **not** the sandbox, **not** Cursor Ask mode, and **not** a numbered v4.

Personal v1–v3 remain accepted. The implementation contract is [`implementation-plan.md`](./implementation-plan.md). Status is **Accepted and archived** (workstream closed 2026-08-18). Review: [`logs/2026-08-18-acceptance-review.md`](./logs/2026-08-18-acceptance-review.md). Closure: [`logs/2026-08-18-workstream-closure.md`](./logs/2026-08-18-workstream-closure.md). Milestone 3: [`logs/2026-08-18-m3-packaged-honesty.md`](./logs/2026-08-18-m3-packaged-honesty.md).

Earlier candidate research lives in [`research.md`](./research.md). This file is the product contract. The owner asked for the **end-to-end product**, not a toggle-only first slice.

## Outcome

The owner can choose, per chat, whether the agent is **planning** or **acting**. While it works, the model can **ask back** with structured choices — pick A, B, C (or D), or type an answer — instead of guessing. A Plan is a **document** the owner can read, edit, comment on, and Execute.

The conversation stays primary. This is mode + structured interruption + a plan document, not a second agent loop, not a TUI overlay, and not a sandbox.

## Audience and trust model

The add-on continues the personal, trusted-workspace assumptions of accepted v2:

- the owner selects and trusts the workspace for ordinary coding work;
- baked feature code still runs with the app process’s authority;
- macOS is the first verification surface; Linux-compatible UI and path behavior is required;
- Windows is out of scope.

Honest disclosure is required where Plan is introduced:

- Plan turns **write tools off**. It does not sandbox `bash`, MCP, Cursor SDK, or the Pi process.
- Renderer `sandbox: true` is a Chromium UI boundary. It does not make Plan safe for untrusted workspaces.
- Permission dialogs and YOLO are unchanged for tools that remain enabled. Plan still forbids `write` / `edit` / `move_to_trash` under YOLO.
- V3 still tracks Execute-time `write`/`edit` only. Plan-mode `bash` is not undoable.
- Ask-user is not a permission grant. Cancelling a questionnaire declines that tool call only.

## Why this is one standalone add-on

Plan without ask-back still guesses. Ask-back without Plan is only a dialog. The Plan document is how the owner reviews work before Execute. Those three pieces ship or fail together, the same way sandbox’s bash wrap and file-tool policy are one product.

The add-on does not wait on session tree, subagents, OS sandbox, or Phase F. Turning it off restores today’s Agent-only chat.

## How current harnesses split the problem

These are research inputs, not licenses to copy TUI chrome.

| Harness | Mode | Ask-back | Plan artifact |
| --- | --- | --- | --- |
| **Pi official plan-mode** | `/plan` disables `write`/`edit`; bash regex allowlist | Expects a separate TUI `questionnaire` | Regex `Plan:` + `[DONE:n]` + TUI widget |
| **Pi questionnaire.ts** | n/a | Tabbed TUI overlay; **TUI-only** (`mode === "tui"`) | n/a |
| **juicesharp ask_user_question** | n/a | 1–4 questions, 2–4 options, Type something, multi-select, preview; TUI overlay **or** RPC `select`/`input` walker | n/a |
| **Claude Code** | Plan vs default | `AskUserQuestion`: A/B/C plus Other | Plan then user starts execution |
| **Cursor** | Agent / Plan / Ask | Clarifying questions in Plan | Live canvas / plan document beside chat |

Pho Code follows **Pi plan-mode** for write-tool policy and JSONL persist, **juicesharp + Claude** for ask-back (options plus typed answer), and **Cursor’s plan document** (not Cursor Ask mode, not a React compiler).

Pi plan-mode is the first-party integration pattern:

- public URL: [earendil-works/pi `examples/extensions/plan-mode/index.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/plan-mode/index.ts)
- API source of truth: the same tree in pinned Pi `0.84.1`

Take from it: disable built-in write tools; inject mode context; persist a custom JSONL entry; owner confirmation before Execute; keep other active tools.

Do not take from it: `/plan` as the desktop control; `ctx.ui.editor` / widgets; hardcoded four-tool lists; `curl` as a “safe” command; npm `@kmiyh/pi-plan-mode`.

Ask-back follows juicesharp `2.6.0` (MIT):

- public URL: [juicesharp/rpiv-mono `packages/rpiv-ask-user-question`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question)

Take from it: tool name `ask_user_question`; 1–4 questions; 2–4 options with label + description; optional `multiSelect` and markdown `preview`; reserved labels (`Other`, `Type something.`, `Next`); result envelope (`answers`, `cancelled`, `error`); prompt guidelines; RPC walker as **fallback** when the questionnaire card cannot render.

Do not take from it: baking the npm package; XDG config; i18n peer; terminal BEL; `ctx.ui.custom` / `pi-tui`; sequential permission dialogs as the intended desktop UX.

Material adaptation of juicesharp schema, validation, envelope, and guidelines requires an attribution row when code lands.

## Selected product decisions

| Decision | Selection |
| --- | --- |
| Packaging | **One add-on**, one Pho-owned inline factory. Do not bake juicesharp or `pi-plan-mode`. |
| Modes | **Agent** (default) and **Plan**. Execute is a transient Agent run of the current plan. No third Cursor Ask mode. |
| Control | Composer footer **Plan / Agent** chip (icon + label, hover description). Session-scoped. Not slash-only. Not buried in a + menu. |
| Ask-back | Tool `ask_user_question` in **both** modes. Plan prompt tells the model to use it when requirements are ambiguous. |
| Ask-back UX | Dedicated questionnaire card: numbered **A/B/C/(D)** (or 1–4) with descriptions; always **Type something**; multi-select; 1–4 questions with tabs + Submit; optional preview. Claude/juicesharp, not permission copy. |
| Ask-back fallback | If the card cannot render, walk `select`/`input` like juicesharp’s RPC path. Host failure is **not** a user decline. |
| Write tools in Plan | Off: `write`, `edit`, `move_to_trash`. Cursor SDK tools off in Plan until proven read-only. GitHub MCP stays (already read-only). |
| `bash` in Plan | Still present and permission-gated. **No** Pi regex allowlist. Not claimed safe. Future sandbox add-on may wrap it. |
| YOLO | Does **not** restore write tools in Plan. |
| Context prompt | **Intersect.** Plan must not re-enable a tool the owner turned off. |
| Plan artifact | Right-sidebar **Plan** surface: sanitized markdown/mermaid document + todos. Not transcript regex alone. Not model-generated React. |
| Execute | Explicit owner action: **Execute** on the Plan surface, **or** the model calling `execute_plan` after the owner asks in chat (go ahead / implement this). Not every `agent_end`. Switching the composer chip Plan → Agent does not start work. Injected execute context is hidden from the transcript. A comment box on the Plan surface sends a follow-up. Remaining in Plan needs no Stay button. |
| Todos | **Same add-on, both modes** — not a second feature and not Plan-only. One `todo` tool (Cursor `TodoWrite` / Pi `todo.ts`). One session list. Plan document and Execute read that list; Agent shows it without opening Plan. |
| Host UI | Never `ctx.ui.custom`. New `HostDialogKind` (or equivalent JSON-safe questionnaire request). One dialog at a time with permissions. |
| Default | Agent. No Settings flag required to “enable the feature”; the baked factory is always loaded. |

## Non-goals

This add-on will not:

- add Cursor Ask as a third mode;
- compile model-generated React, MDX, or arbitrary HTML canvases;
- bake `npm:@juicesharp/rpiv-ask-user-question`, `@kmiyh/pi-plan-mode`, or Pi example paths as `extensionPaths`;
- enable ambient Pi package discovery;
- implement `ctx.ui.custom`, TUI widgets, `/plan`, or `--plan`;
- copy Pi’s bash regex allowlist or claim Plan is a sandbox;
- replace permission-system, V3, terminal, or sandbox;
- spawn subagents or worktrees;
- store mode only in renderer `localStorage`;
- expose generic questionnaire JSON in Settings;
- ship a second todos-only add-on or a Plan-only duplicate checklist.

## Product invariants

1. **Conversation remains primary.** Plan is a right-rail document. Ask-back is a docked card. Neither replaces the transcript.
2. **Agent is the default.** New chats start in Agent with today’s tools.
3. **Plan is a tool-set policy, not a sandbox.** Copy must say writes are off and shell is not boxed.
4. **Ask-back is a tool, not a mode.** The owner always answers or declines; the model never treats a host failure as a decline.
5. **Todos are a tool, not a mode.** Agent and Plan share one list. Do not keep a second Plan-only checklist.
6. **One questionnaire, one permission dialog.** Shared request-id lifecycle. Distinct copy and chrome. Ask-user, plan document, todo, and execute_plan never compete for the permission dock.
7. **Intersect context prompt.** `activeTools = contextPromptEnabled ∩ modeAllowlist`, then always include `ask_user_question` and `todo` when the factory is healthy. `execute_plan` is Plan-only.
8. **JSONL is authoritative.** Mode, plan document, and todos persist as Pi custom entries (and tool results where that keeps forks honest later). Resume restores them.
9. **Fail closed without breaking chat.** A failed factory leaves Agent-only behavior. Conversation, credentials, V3, and permissions continue.
10. **Packaged resources are app-owned.** No `pi install` step for the owner.

## Modes

| Mode | Tools | Ask-back | Todos | Writes | Owner loop |
| --- | --- | --- | --- | --- | --- |
| **Agent** | Full enabled set (context prompt ∩ permissions) | Available | Available | Yes, then V3 | Today’s chat, with a live checklist |
| **Plan** | Read/search/web/ask-user/todo; mutating file/trash/Cursor-SDK tools off | Available and encouraged | Same list; becomes the Execute steps | No | Explore, ask, write the Plan document |
| **Execute** (transient) | Same as Agent | Available | Same list; in_progress / completed as work proceeds | Yes, then V3 | Owner confirmed Execute (button or `execute_plan`); return to Agent when complete or cancelled |

Switching Plan → Agent without Execute does not start work. Execute (the button or `execute_plan` after the owner asks in chat) is the only path that injects “run these steps.”

## Ask-user contract

The model calls:

```ts
ask_user_question({
  questions: [
    {
      question: string,       // ends with "?"
      header: string,         // chip, max 16 chars
      options: [
        { label: string, description: string, preview?: string },
        // 2–4 options
      ],
      multiSelect?: boolean,
    },
    // 1–4 questions
  ],
})
```

The owner sees a questionnaire card, not a permission prompt:

- `ask_user_question` is allow-listed with `todo` and `update_plan_document`. It must not open a permission dock. Runtime start writes those allows onto existing configs so `"*": "ask"` cannot catch them.
- options labeled **A. B. C.** (and **D.** when present) with the option description under the label;
- a **Type something** row on every question so a custom answer is always possible; typing there must not fire A/B/C letter shortcuts;
- multi-select as checkboxes; Type something remains available;
- several questions: tabs (header chips) plus a Submit review that names unanswered items;
- optional markdown `preview` beside the focused single-select option, sanitized like assistant markdown;
- optional per-question note, returned with the answer;
- Escape or Cancel declines the whole questionnaire.

Result envelope (model-facing), adapted from juicesharp:

```ts
{
  content: [{ type: "text", text: string }],
  details: {
    answers: Array<{
      questionIndex: number,
      question: string,
      kind: "option" | "custom" | "multi",
      answer: string | null,
      selected?: string[],
      notes?: string,
      preview?: string,
    }>,
    cancelled: boolean,
    error?: string,
  },
}
```

Validation rejects empty/too-many questions, fewer than two options, duplicate question text, duplicate option labels, and reserved labels (`Other`, `Type something.`, `Next`). Recommended options may append `(Recommended)` to the label.

Cancel copy for the model: `User declined to answer questions`. Host/render failure copy must say the owner **never saw** the questions and must not use the decline string.

## Session todos

Cursor’s todo list is **not** Plan-only. In Agent, the model writes a checklist, marks one item in progress, and checks items off as it works. Pho Code does the same, in this add-on, with one list.

The model calls a Pho-owned `todo` tool (name may be `todo` or `todo_write`; pick one in Milestone 2 and keep it). Shape, adapted from Cursor `TodoWrite` and Pi `examples/extensions/todo.ts`:

```ts
todo({
  todos: [
    {
      id: string,
      content: string,
      status: "pending" | "in_progress" | "completed",
    },
  ],
})
```

Rules:

- The call **replaces** the session list (Cursor merge-replace), rather than a pile of add/toggle RPCs. Reconstruct the latest list from tool-result details on the Pi branch so resume and a future fork stay honest (Pi `todo.ts`).
- At most **one** `in_progress` item at a time.
- Empty `todos: []` clears the list.
- Bounds: 50 items, 200 characters per `content`.
- Always registered when the factory is healthy, including Plan (writing a checklist is not a file mutation).
- Streaming `[DONE:n]` in assistant prose is never authoritative.

Chrome:

| Surface | When | What |
| --- | --- | --- |
| Transcript | Any mode, whenever the list is non-empty | Compact checklist from the latest tool result (untrusted text). Not a second dashboard. |
| Composer chip | Any mode, non-empty list | `3/7` plus the current `in_progress` title when present |
| Plan surface | Plan / Execute | **The same list**, not a copy. Execute runs remaining `pending` / `in_progress` items |

Do **not** ship a standalone todos add-on. A second factory would duplicate persist, protocol, and chrome. Owner-authored lists without the agent still go through this tool or through editing the Plan document, which writes the same list.

## Plan document

The right sidebar gains a **Plan** surface beside Changes, Context prompt, and (when that add-on exists) Terminal.

| Behavior | Contract |
| --- | --- |
| Host chrome | Existing right sidebar. Re-click of Plan hides the panel. No dedicated Collapse control. ⌘R / Ctrl+R still toggles the host. |
| Content | Settled sanitized markdown, same pipeline as chat: GFM, KaTeX, mermaid, Shiki, fenced SVG. No `rehype-raw`, no React. |
| Todos | Checklist bound to the **session todo list**, rendered **under** the document. Completing a step during Execute updates that list. |
| Edit | Pen icon while idle. Opens the source markdown; check saves, X cancels. A live Execute run is inspect-only. |
| Execute | **Execute** on this surface, or tell the agent in chat to execute (`execute_plan`). Switches to transient Agent, injects remaining steps, and starts a turn. The injected kickoff is not shown in the transcript. No Stay or Refine buttons. A comment box under the document (Enter or send) is the follow-up. |
| Empty | Wait for the agent to write markdown. Do not show a blank editor. |
| Size | Reject oversized documents (implementation plan names the byte bound). |

The agent updates the document through a Pho-owned plan tool or custom entry — not by hoping a `Plan:` heading appears in chat. Transcript text may still show a summary; the sidebar document is source of truth for Execute.

## User-visible contract

- Composer footer: Plan / Agent **chip** next to model/thinking (icon + label). Description is hover-only. Disabled while a run is live.
- Plan mode does not show a standing “Writes off” line. Honesty lives on the Plan chip hover: writes off, shell not sandboxed.
- A non-empty todo list shows `completed/total` in any mode.
- The Plan document appears after the agent writes markdown and **renders like chat** (KaTeX, mermaid, Shiki). Empty Plan waits rather than showing a blank editor. A pen icon edits the source; a single comment box under the document (send / Enter) talks to the agent. Todos sit at the end. Execute stays on the footer; the owner can also say go ahead in chat.
- Ask-user cards dock like permission cards but use questionnaire chrome (options A/B/C, Type something, Submit). Enter confirms the focused option on single-select; it does not submit an incomplete multi-question set.
- Opening Plan from the rail expands the right sidebar. Clicking Plan again collapses it.
- Switching chats restores that chat’s mode, document, and todos. A questionnaire pending on chat A does not appear on chat B.

## Lifecycle

| Owner action | Runtime |
| --- | --- |
| New chat | Agent. No plan entry. |
| Toggle Plan while idle | Persist mode; intersect tools; next turn gets Plan context. |
| Toggle Agent while idle, not executing | Persist Agent; restore tools ∩ context prompt. Do not auto-run. |
| Ask-user tool call | Emit questionnaire request; block that tool until resolve/cancel/abort. |
| Save Plan document | Custom JSONL entry; bounded. |
| Execute | `executing=true`; Agent tools; inject remaining todos; start a hidden turn (button) or continue this turn (`execute_plan`). |
| Plan complete or owner cancel Execute | `executing=false`; mode Agent unless the owner stayed in Plan. |
| Abort run | Cancel pending questionnaire; leave mode as persisted. |
| Resume / reopen | Restore mode, document, todos from JSONL; re-intersect tools. |
| Session replace | Cancel stale questionnaires; rebind factory. |
| Quit | Cancel pending questionnaires under bounded shutdown. |

Application restart restores JSONL state. It does not resume an in-flight questionnaire; that tool call is cancelled.

## Data

| Data | Owner | Location | User consequence |
| --- | --- | --- | --- |
| Mode, executing flag | Plan-agent factory | Pi custom entry `pho-code.plan-agent` | Restored on resume |
| Plan markdown | Plan-agent factory | Pi custom entry `pho-code.plan-agent` | Restored on resume |
| Session todos | `todo` tool results (latest on the branch) | JSONL transcript | Same list in Agent, Plan, and Execute |
| Ask-user answers | Pi tool results | JSONL transcript | Visible in the thread |
| Composer Plan/Agent choice | Snapshot projection | Not a second store | Renderer cache only after snapshot |
| Right-sidebar surface `"plan"` | Renderer | existing surface `localStorage` | Chrome only |

Diagnostics may report factory loaded/failed. They must not ship raw TUI objects or unsanitized questionnaire HTML.

## Relationship to other tracks

| Track | Relationship |
| --- | --- |
| Conversation UI | Owns composer footer chrome and right-sidebar **host**. This add-on owns Plan/Agent meaning, questionnaire card, and Plan surface content. |
| Permission feature | Stays. Ask-user is not a permission. Plan does not skip permission asks for remaining tools. |
| V3 change review | Independent. Execute writes still capture. Plan should produce no write/edit ledger rows. |
| Context prompt | Intersect tool sets. Plan does not edit the context-prompt entry. |
| Integrated terminal | Independent. Plan surface is another rail icon with the same host rules. |
| Sandbox | Independent. Plan must not wait on Seatbelt and must not claim to be that box. |
| Phase E subagents | Out of scope. |

## References

- Implementation contract: [`implementation-plan.md`](./implementation-plan.md)
- Research: [`research.md`](./research.md)
- Add-on tracker: [`../README.md`](../README.md)
- Architecture: [`../../../architecture/overview.md`](../../../architecture/overview.md), [`../../../architecture/extension-model.md`](../../../architecture/extension-model.md)
- Conversation UI: [`../../../ui/implementation/conversation-ui.md`](../../../ui/implementation/conversation-ui.md)
- Right-sidebar host: [`../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md`](../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md)
- Pi official plan-mode: [earendil-works/pi `examples/extensions/plan-mode`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/plan-mode/index.ts) (read against pinned `0.84.1`)
- juicesharp ask-user: [rpiv-ask-user-question](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question) `2.6.0` MIT
