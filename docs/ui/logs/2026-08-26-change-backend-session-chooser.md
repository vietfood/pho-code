# Backend session chooser

Date: 2026-08-26
Status: in source and focused desktop verified; owned by unaccepted V5
Surface: project/session sidebar and conversation tool activity
Owner: V5 Pho Agent Foundation B2/B4
Owning plan: [`../../version/v5/implementation-plan.md`](../../version/v5/implementation-plan.md)
Related implementation record: [`../../version/v5/logs/2026-08-26-codex-desktop-vertical-slice.md`](../../version/v5/logs/2026-08-26-codex-desktop-vertical-slice.md)

## Intended behavior

Keep ordinary new-session creation fast and keep backend disclosure out of the main interface. A backend change must create a backend-pinned session, never reinterpret the selected transcript.

## Change

The sidebar's main New session control still creates a Pi session. A small adjacent chooser lists the runtime-advertised alternatives; Codex carries an Experimental label, and its longer disclosure is available through a compact info control. Non-Pi session rows carry a quiet backend label. Codex native command, file-change, MCP, web, image, review, compaction, and subagent items project into the existing bounded work-row shape rather than a backend-specific transcript component.

The chooser is capability discovery, not a claim of backend parity. Current Codex sessions do not expose Pi-only model, thinking, image, Plan, context-prompt, rewrite, review, or queued-follow-up behavior. The runtime rejects those operations explicitly.

## Verification

- Renderer/application focused unit tests cover missing-backend Pi compatibility and startup before the runtime is attached.
- `bunx playwright test tests/chat.spec.ts` passed 4 tests outside the GUI-restricted sandbox, including opening the backend chooser, observing the Experimental label, and selecting Pi.
- A real Codex prompt was not sent; credentials and provider capacity were not used for this UI change.

## Handoff

Backend-neutral approval and request-user-input controls are required before Codex can request owner interaction. Dedicated auth, plan, compaction, and review projections remain V5 work. Backend-native subagent grouping remains the later B5 slice.
