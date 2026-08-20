# V4 hold — pending Apple Developer Program

Date: 2026-08-20
Status: **Pending** (held; not archived, not accepted)
Owner: repository owner
Plan: V4 — Public Beta Foundation
Related: [Milestone 0 preflight](./2026-08-20-m0-release-preflight.md), [promotion and planning](./2026-08-20-promotion-and-planning.md), [release preflight freeze](../release-preflight.md)

## Intent

Stop V4 implementation until the owner can enroll in the Apple Developer Program (or otherwise obtain Developer ID Application and notarization authority). Keep the Milestone 0 source freeze and fail-closed proof packager. Let independent add-ons, conversation UI, and a later numbered version proceed without absorbing V4's public-beta contracts.

## Owner feedback

The owner cannot enroll in the Apple Developer Program at this time. Public DMG, Homebrew cask, Gatekeeper publisher presentation, notarization, and stapling therefore cannot be verified. The owner asked to mark V4 pending, explain the blocker, and focus on other features and V5 before returning to V4.

## Decision

- V4 remains promoted under `docs/version/v4/`. It is **not** archived and **not** accepted.
- Remaining Milestone 0 owner evidence and Milestones 1–6 are **held**. Do not start public `4.0.0-beta.N` versioning, utility-process extraction, diagnostics/privacy for a public beta, signed release artifacts, or updates.
- Do not weaken the unsigned-fallback gate. `bun run package:mac` stays the local unsigned path. `bun run package:mac:proof` stays fail-closed without credentials.
- Terminal, compaction, UI, and other independent add-ons may continue. They may ship in a future V4 binary only under the existing V4 freeze rules when V4 resumes.
- A later numbered version (**V5**) may be promoted from [`roadmap-vnext.md`](../../roadmap-vnext.md) **without** closing or archiving V4. V5 must not take over signing, notarization, public updates, public-beta diagnostics/privacy, or `HarnessRuntime` utility-process extraction.
- Resume V4 from Milestone 0's remaining owner checks when Developer ID and notarization credentials exist.

## Verification

Documentation routing only. No application source changed in this hold. No new code, desktop, packaged, or signing check ran.

## Handoff

Treat V4 as a parked public-beta workstream. Promote V5 only with its own product and plan. When Apple enrollment becomes possible, unhold V4 from this record and continue the existing implementation plan in milestone order.
