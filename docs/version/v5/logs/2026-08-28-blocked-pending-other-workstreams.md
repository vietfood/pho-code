# V5 blocked — pending the urgent queue and the promoted add-ons

Date: 2026-08-28
Status: **Blocked** (held; not archived, not accepted)
Owner: repository owner
Plan: V5 — Pho Agent Foundation
Related: [external-backend ownership](./2026-08-27-external-backend-ownership.md), [instruction/tool bridge](./2026-08-27-codex-instructions-and-tool-bridge.md), [urgent queue](../../../urgent/README.md), [V4 hold](../../v4/logs/2026-08-20-hold-pending-apple-developer.md)

## Intent

Stop starting new V5 slices until the other open workstreams are finished to an accepted standard. V5 has grown a wide external-backend surface — Codex app-server and Claude ACP adapters, model/reasoning/Fast projection, developer instructions, one dynamic tool — while the urgent queue still holds a load-flaky test lane, four open gaps left by deleted guards, and an unfinished runtime decomposition, and both promoted add-ons (terminal, compaction) have no source at all.

## Owner feedback

The owner asked to move V5 to blocked "until we have done every other feature well". The concern is breadth over depth: each new backend slice lands on top of an unfinished foundation, and the queue that was meant to run *before more capability* keeps being deferred behind it.

## Decision

- V5 remains promoted under `docs/version/v5/`. It is **not** archived, **not** accepted, and **not** reverted. Every behavior already in source stays in source.
- Slices B2b (specialized Codex surfaces), the remaining B3b permission/resume coverage, and B4 (cross-backend evaluation fixtures, packaged evidence, acceptance review) are **held**. Do not start them.
- The deferred M1–M4 intelligence milestones remain deferred behind the held foundation, unchanged.
- **Defect repair is still allowed** on external-backend behavior that is already in source and reachable by the owner — a broken Codex or Claude session is a live defect, not new capability. Such a fix gets its own dated log, must not add an advertised capability, and does not advance a held slice. Anything that would extend the backend surface is new capability and waits.
- Unblock condition: the [urgent queue](../../../urgent/README.md) is empty and the promoted [terminal](../../../features/terminal/README.md) and [context compaction](../../../features/compaction/README.md) add-ons are accepted. The owner may reorder or shorten that condition at any time.
- V4 stays independently **Pending** on Apple Developer Program enrollment. Two held versions do not merge into one workstream; V5 must still not absorb V4's signing, update, diagnostics, migration, or `HarnessRuntime` utility-process contracts.

## Known unverified surface at the time of the hold

Recorded so that resuming V5 does not mistake owner-verified ordinary use for acceptance evidence:

- real-provider verification of the Codex reasoning ladder, Fast toggle, and multi-chunk command output;
- Claude ACP permission and resume coverage;
- macOS GUI `PATH` portability for the external `codex` and `claude-agent-acp` commands — a GUI-launched Electron app does not inherit a login shell `PATH`, so this is the largest unverified risk in the held surface;
- packaged behavior for either external backend;
- cross-backend evaluation fixtures and the acceptance review.

## Verification

Documentation routing only. No application source changed in this hold. No code, desktop, or packaged check ran for this record.

## Handoff

Treat V5 as a parked foundation with a working but unaccepted external-backend surface. Work the urgent queue, then the add-ons. When the owner unblocks V5, resume at B2b and re-read this record's unverified list before claiming any acceptance evidence.
