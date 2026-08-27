# V4 — Public Beta Foundation

Promoted numbered product version, **pending**. Owner-promoted 2026-08-20; held 2026-08-20.

| Document | Role |
| --- | --- |
| [`product.md`](./product.md) | Public-beta outcome, selected scope, trust model, website boundary, and non-goals |
| [`implementation-plan.md`](./implementation-plan.md) | Architecture changes, milestones, release gates, and verification |
| [`release-preflight.md`](./release-preflight.md) | Milestone 0 identity, license, signing, origins, and entitlement freeze |
| [`logs/`](./logs/README.md) | Dated implementation evidence, corrections, feedback, and handoffs |

Status: **Pending**. V4 is not accepted and Pho Code is not a public-beta release. The owner cannot enroll in the Apple Developer Program, so Developer ID signing, notarization, Gatekeeper-clean DMG, and Homebrew cask distribution cannot be verified. Remaining milestones are held. The fail-closed proof packager remains in the repository (`scripts/mac-packaging-config.ts`, `scripts/package-mac.ts`). Milestone 0's frozen identity/origin constants were removed on 2026-08-27 as unreferenced scaffolding and must be re-established from this plan when V4 resumes — see [`logs/2026-08-27-remove-m0-source-freeze.md`](./logs/2026-08-27-remove-m0-source-freeze.md). Do not resume V4, and do not emit an unsigned public artifact, until Developer ID authority exists. Evidence: [`logs/2026-08-20-hold-pending-apple-developer.md`](./logs/2026-08-20-hold-pending-apple-developer.md).

Independent add-ons, conversation UI, and promoted [`V5 — Pho Agent Foundation`](../v5/README.md) may proceed. They must not absorb this contract. Current accepted behavior remains in [`../../current-state.md`](../../current-state.md) and [`../../architecture/`](../../architecture/README.md).

V4 still owns a bounded Apple Silicon macOS public beta: stable release identity, migration-safe application data, Pi runtime crash isolation, local redacted diagnostics, signed/notarized artifacts, and a controlled update/recovery path. It does not own the marketing website implementation, browser automation, session forks, richer document attachments, subagents, worktrees, or Linux distribution.
