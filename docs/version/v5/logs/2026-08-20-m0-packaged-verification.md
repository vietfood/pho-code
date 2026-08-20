# M0 packaged verification

Date: 2026-08-20
Status: packaged gate passed; M0 automated exit checks complete; real-provider still not owner-verified; M0 not formally accepted
Owner: repository owner
Plan: V5 Milestone 0
Related: [`checkout re-verification`](./2026-08-20-m0-checkout-verification.md), [`Pho Agent production submodule`](./2026-08-20-m0-pho-agent-submodule.md), [`M0 harness ownership`](./2026-08-20-m0-harness-ownership-expansion.md)

## Intent

The owner lifted the earlier `package:mac` hold for this machine and asked for the M0 packaged lane. Real-provider evaluation remains later.

## Environment

- Parent `HEAD`: `b339c024788f5fdf28e4ebbeec421ee7ce4827d7` plus the uncommitted `@pho-agent/evals` root workspace dependency from the checkout re-verification
- Pinned Pho Agent gitlink: `ad74a1ae719dee1da22c8941a3f6f6b18e29fde2`
- bun `1.3.14`; macOS `26.5.2`; Electron `43.4.0`; unsigned `darwin-arm64`
- Packaged Playwright used isolated `PHO_CODE_USER_DATA_DIR` / workspace fixtures and `PATH=/usr/bin:/bin:/usr/sbin:/sbin` (no Pi CLI)
- No owner sessions, credentials, or workspaces

## Artifact

Command: `bun run package:mac`

Unsigned app: `apps/desktop/release/mac-arm64/Pho Code.app`

electron-builder `26.15.6` packaged `darwin/arm64`, skipped native rebuild (`npmRebuild` false), and skipped code signing (`identity` null). Missing optional native binaries were non-host platforms only. Default Electron icon warning is unchanged.

Bundle inspection:

- app-owned `features/@gotgenes/pi-permission-system`, curated `@pho-code` skills, pinned GitHub MCP binary, bundled `rg` `15.2.0/darwin-arm64`, and unpacked `@anthropic-ai/sandbox-runtime`
- `LICENSE`, `EULA.md`, and `THIRD_PARTY_NOTICES.txt` present
- asar `out/main` contains no `@pho-agent/` specifiers; Pho Agent is compiled into the private main chunk rather than shipped as a workspace tree
- packaged tests launched `Contents/MacOS/Pho Code` as a packaged app (`app.isPackaged`)

`.package-stage`, `apps/desktop/resources`, and `apps/desktop/release` are gitignored. No `pho-code-stage-*` temporary directories remained after the lane.

## Verification

- `bun run package:mac`: **PASS**. Packaged verified as an unsigned local `.app` only; not a V4 signed/notarized artifact.
- `bun run test:packaged`: **PASS**, 6/6 in 38.1s:
  - permission and Trash features without Pi CLI
  - fake OAuth without Pi CLI or renderer URLs
  - background run, archive metadata, and Trash removal
  - V3 Undo through OS Trash without Pi CLI
  - staged `rg`, healthy sandbox, wrapped bash, denied out-of-policy writes without Pi or Homebrew
  - Plan/Agent, ask-back, Plan write-off, Execute write, and Agent todos without juicesharp or `pi-tui`
- Real-provider/owner baseline: **not verified**; the owner will run that later. V5 still may not claim comparative real-provider improvement.

## Handoff

Every M0 automated exit command now has PASS evidence on this checkout, including packaged. M0 is not formally accepted: there is no immutable acceptance review, architecture still marks the V5 M0 packages unaccepted, and the owner has not asked to start M1. Real-provider evidence remains outstanding and is not an M0 blocker under the plan. Do not start M1 until the owner explicitly accepts M0 or asks to begin Task Brief work.
