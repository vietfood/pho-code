# Product: agent stop

## Status

Accepted and archived urgent track, closed 2026-08-20. This is **not** a numbered version, **not** an add-on, and **not** Phase F process extraction. Its accepted behavior is current architecture; its immutable evidence ends with the [closure review](./logs/2026-08-20-m2-acceptance-and-closure.md).

Personal v1–v3 remain accepted. The implementation contract and completed gates are in [`implementation-plan.md`](./implementation-plan.md).

## Outcome

The owner can press Stop and get the chat back. The current run cancels within a **bounded deadline** even when the agent is waiting on a permission card, ask-user questionnaire, bash child, retry, or a slow model. Send becomes available again. Background chats can be stopped the same way.

If Pi is in a busy-loop or has already crashed inside Electron main, Stop cannot help. Archived [`window-first-pi-core`](../window-first-pi-core/product.md) deferred that crash-isolation problem to roadmap Phase F.

## Why this is urgent, not a feature

Stop is already a v1 conversation control. The defect is that it **waits for Pi to become idle**. During owner testing a stuck run (permission dock, hung tool, long stream) can ignore Stop, keep `busy` true, and make Playwright teardown wait on the same path. That blocks a trustworthy daily driver and blocks verifying other work.

It did not belong under [`features/`](../../../features/README.md): it is a safety fix to an existing command, not a capability that can ship or fail independently of the runtime abort path. It did not belong under [`version/`](../../../version/README.md) as v4. It stayed in [`urgent/`](../../../urgent/README.md) until accepted, then moved here with its evidence.

## Isolation glossary

Do not use “isolation” or “sandbox” without naming which boundary. Copied from the window-first track so agents do not collapse these jobs.

| Kind | What it stops | Pho Code today | This track |
| --- | --- | --- | --- |
| Cooperative abort | A run that still observes `AbortSignal` / `session.abort()` | **Accepted.** Bounded Stop and Stop-all | Milestones 1–2 |
| Crash / process isolation | A hung or crashed Pi taking down the window | **Not done.** Pi runs inside Electron main | Out of scope here. Deferred from archived [`window-first-pi-core`](../window-first-pi-core/product.md) to roadmap Phase F |
| Permission isolation | Agent `bash` / file tools acting outside an OS policy | **Accepted.** [`sandbox`](../../features/sandbox/README.md) | Out of scope |
| Renderer isolation | The chat page reading disk or seeing tokens | **Done** | Unchanged |

## Original defect before Milestone 1

Composer Stop was visible while `run.status` was `admitted` or `streaming`. The renderer called `abortRun({ sessionId, workspaceId, runId })`.

Runtime `abortRun` originally:

1. sets `abortRequested`;
2. `session.clearQueue()`;
3. **awaits** `session.abort()`;
4. **awaits** `promptDone`.

Pinned Pi `0.84.1` `AgentSession.abort()` is `abortRetry()`, `agent.abort()`, then **`await waitForIdle()`**. It does **not** call `abortBash()`.

Host dialogs listened to Pi’s abort signal, but `abortRun` did not call `extensionHost.cancelPending()`. Renderer `onStop` used `runCommand()` without `{ busy: false }`, so global `busy` stayed true until idle.

Runtime integration covered abort on the cooperative `ABORT_ME` stream. Desktop specs used it as a long background stream and **never clicked Stop**.

pi-gui’s `cancelCurrentRun` is the contrast: abort is best-effort, then the UI is marked idle even if abort throws.

Related UI record: [`bug-stop-does-not-cancel-stuck-run.md`](../../../ui/logs/2026-08-16-bug-stop-does-not-cancel-stuck-run.md).

## Selected decisions

These decisions were implemented and accepted.

| Decision | Selection |
| --- | --- |
| First slice | **Bounded in-process abort.** Do not wait on Phase F or window-first Milestone 3. |
| Abort IPC | **Return after signalling cancel**, with a short wait-for-idle race. Do not hold `abortRun` until `promptDone`. Observe settlement in the background. |
| Host UI | Stop **cancels** pending permission and ask-user dialogs (`cancelPending()`), same as session dispose. |
| Bash | Call Pi `abortBash()` when `isBashRunning` as part of Stop, in addition to `session.abort()`. |
| UI busy | Stop must not set the global `busy` flag. The Stop control stays clickable. |
| Keyboard | Milestone 1 may add Escape-to-Stop while a run is live and no menu/dialog owns Escape. Not a substitute for the button. |
| Crash isolation | **Stays on window-first Milestone 3.** This track does not spawn `utilityProcess`. |
| Pi RPC | **Do not** switch the product runtime to `pi --mode rpc` to get Stop. Keep the pinned SDK in `HarnessRuntime`. |
| Tests | Desktop must **click Stop** on a hung fixture, not only prove the cooperative `ABORT_ME` stream. |

## Accepted user-visible contract

- While a run is live, Stop is visible and remains usable.
- Pressing Stop dismisses a pending permission or ask-user card for that session and marks the run `cancelled`.
- After the abort deadline, Send is available even if a tool child has not fully exited. A still-running child is a remaining honesty case, not a reason to keep the chat “running.”
- A second prompt after Stop is admitted on that session (existing runtime abort test, plus desktop).
- Stop does not claim to survive a frozen main process. If the window itself is unresponsive, quit’s existing 5s bounded shutdown still applies.

## Trust and honesty

Keep the personal-trust policy. Bounded Stop does **not** let copy say the agent is sandboxed or that Pi cannot hang the app.

Allowed: “Stop cancels the current run.” Required if a tool child outlives the cancelled run: do not pretend the child is gone.

## Non-goals

This track will not:

- extract Pi into `utilityProcess` (that is window-first Milestone 3);
- wrap agent `bash` in Seatbelt (that is [`sandbox`](../../features/sandbox/README.md));
- change the accepted Electron shell;
- replace Pi’s agent loop;
- add a generic “kill process” control in the renderer;
- block terminal, Plan/Agent, sandbox, or window-first implementation.

Window-first and this track must not wait on each other. Window-first Milestone 1 (first paint) does not require bounded Stop. Bounded Stop does not require window-first.

## Related work

- Architecture: [`runtime-and-data.md`](../../../architecture/runtime-and-data.md), [`protocol-and-ipc.md`](../../../architecture/protocol-and-ipc.md), [`overview.md`](../../../architecture/overview.md)
- Accepted startup ordering / deferred crash isolation: [`window-first-pi-core`](../window-first-pi-core/product.md)
- Phase F public distribution: [`roadmap-vnext.md`](../../../version/roadmap-vnext.md)
- Plan/Agent ask-user cancel: [`plan-agent`](../../features/plan-agent/product.md)
- Conversation Stop chrome: [`conversation-ui.md`](../../../ui/implementation/conversation-ui.md)
- Research log: [`logs/2026-08-16-research-handoff.md`](./logs/2026-08-16-research-handoff.md)
