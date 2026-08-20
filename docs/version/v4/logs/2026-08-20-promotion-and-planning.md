# V4 promotion and planning

Date: 2026-08-20
Status: promoted; implementation not started by this record
Owner: repository owner
Plan: V4 — Public Beta Foundation

## Intent

Promote the next numbered product version as a bounded public-beta release rather than a bundle of deferred agent capabilities. The desktop application already has a useful coding-agent core; V4 makes that core distributable, recoverable, supportable, and honest for external beta users.

## Owner direction

- Public-beta distribution is the numbered-version outcome.
- The owner will also build a product website.
- Website implementation is a parallel owner project. This repository plan records only the desktop handoff it must eventually provide: fixed HTTPS download, release-note, privacy, security, and update-feed locations.
- Browser automation, session forks, richer attachments, subagents, and similar capability work are not prerequisites for beta and are not folded into V4.

## Evidence behind the promotion

- `package.json` and `apps/desktop/package.json` still report `0.0.0`.
- `scripts/package-mac.ts` and `apps/desktop/electron-builder.yml` produce an unsigned `dir` target with `identity: null`, hardened runtime off, Gatekeeper assessment off, and no updater.
- The accepted packaged lane proves an unsigned Apple Silicon application works without Pi CLI or global feature packages.
- Pi and baked TypeScript features still share Electron main; accepted window-first startup preserves first paint but explicitly deferred crash/process isolation.
- unknown or unreadable application metadata currently falls back to empty metadata, which is not an acceptable public migration/recovery contract.
- diagnostics are primarily UI feature summaries and console output; there is no user-exportable redacted support bundle.
- the repository has attribution and partial third-party notices but no project distribution license/EULA and no complete recursive shipped-artifact inventory.
- the archived identity review flags the public `Pho Code` / `phocode.com` naming caveat.

## Selected boundary

- First supported release surface: Apple Silicon macOS 14 or newer.
- First public version line: `4.0.0-beta.N`, with a separate monotonically increasing numeric macOS build number.
- Direct distribution outside the Mac App Store through Developer ID signing, notarization, and stapling.
- Trusted-workspace beta: process extraction protects window availability, but does not sandbox Pi or make hostile repositories safe.
- No telemetry or automatic crash upload. Diagnostics export is explicit, local, bounded, and inspectable before sharing.
- The integrated terminal and context compaction remain independent add-ons. If accepted before the V4 release freeze, V4 packages and verifies them without taking over their contracts.

## Material prerequisites

Milestone 0 must record the owner's final public name, distribution license/EULA, Apple Developer signing identity, minimum supported macOS decision, and exact website/release origins. The default product assumption is `Pho Code`, Apple Silicon macOS 14+, and `4.0.0-beta.N`; none may be advertised before that gate closes.

## Verification performed

Documentation/repository inspection only. No application source changed and no code, desktop, package, signing, notarization, or update check ran in this planning slice.

Primary implementation references checked during planning:

- [Electron `utilityProcess`](https://www.electronjs.org/docs/latest/api/utility-process)
- [Electron `autoUpdater`](https://www.electronjs.org/docs/latest/api/auto-updater/)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Apple hardened runtime](https://developer.apple.com/documentation/security/hardened-runtime)
- [electron-builder macOS notarization](https://www.electron.build/docs/notarization/)

## Handoff

Implement from [`../implementation-plan.md`](../implementation-plan.md) in milestone order. Stop at Milestone 0 if public identity, license, signing authority, or artifact-host ownership is unresolved. Preserve the owner's concurrent compaction promotion work and do not make either add-on a V4 blocker.
