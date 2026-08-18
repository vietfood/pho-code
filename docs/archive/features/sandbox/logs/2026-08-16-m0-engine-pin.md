# Milestone 0: engine pin, rg, fail-closed wrap

Status: accepted  
Owner: features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md#milestone-0-engine-pin-rg-fail-closed-lifecycle)  
Related logs: [`2026-08-16-promotion.md`](./2026-08-16-promotion.md), [`2026-08-16-decision-pi-official-example.md`](./2026-08-16-decision-pi-official-example.md), [`2026-08-16-related-urgent-window-first.md`](./2026-08-16-related-urgent-window-first.md), [`2026-08-16-related-urgent-agent-stop.md`](./2026-08-16-related-urgent-agent-stop.md), [`2026-08-16-m1-settings.md`](./2026-08-16-m1-settings.md), [`2026-08-17-m1-acceptance-review.md`](./2026-08-17-m1-acceptance-review.md)

## Intent

Prove `sandbox-exec` wrapping from the Pho Code runtime in isolated directories, with a pinned Anthropic engine and app-owned `rg`, without Settings chrome.

## Contracts and files

- Product: [`../product.md`](../product.md)
- Runtime: `packages/runtime/src/sandbox-runtime.ts`, `sandbox-policy.ts`, `sandbox-artifact.ts`, `sandbox-feature.ts`
- Staging: `scripts/stage-ripgrep.ts`, `scripts/stage-app-resources.ts`
- Electron: `apps/desktop/electron/main.ts` prepends a staged `rg` directory onto `PATH` when present
- Not in this milestone: Settings UI, protocol snapshot, default-manifest factory, permission skip, file-tool intercept, `package:mac` staging

## Changes and decisions

- Pin `@anthropic-ai/sandbox-runtime` `0.0.73` (Apache-2.0, `engines.node` `>=20.11.0`) on `@pho-code/runtime`. Electron 43 embeds Node `24.18.1`.
- Pin bundled `rg` to BurntSushi/ripgrep `15.2.0` (Unlicense OR MIT) for macOS arm64 and x64. `bun run stage:ripgrep` fetches it; `package:mac` still waits for Milestone 4.
- Wrap via Pi `createLocalBashOperations` after `SandboxManager.wrapWithSandbox`. Do not copy the official example's `spawn("bash", ["-c", …])`.
- Factory exists for Milestone 1 but is **not** in `createDefaultFeatureManifest`. Disabled bash stays Pi's built-in path.
- Fail closed: missing `rg` → `rg-missing`; missing `sandbox-exec` → `sandbox-exec`; non-macOS → `unavailable`; init throw → `init`. No silent unsandbox. No weaker isolation flags.
- Network policy for this slice is deny (`allowedDomains: []`, `strictAllowlist: true`). Domain Settings is Milestone 1.
- `PATH` prepend at `app.whenReady` is not window-first and does not wrap the owner PTY.

## Verification

- Unit verified: `bun test packages/runtime/test/sandbox-runtime.test.ts packages/runtime/test/sandbox-artifact.test.ts scripts/stage-app-resources.test.ts` — 15 pass. Status mapping (`off`, `unavailable`/`unsupported-platform`, `rg-missing`, `sandbox-exec`, `init`), policy weaker-flag refusal, wildcard domain rejection, staged `rg` PATH prepend, ripgrep SHA-256 fail-closed, pin table.
- Integration verified: same command, `sandboxed bash wrap` — pass (124.70ms). Isolated temp workspace. Real `@anthropic-ai/sandbox-runtime` `0.0.73` + Pi `createBashTool` `0.84.1`. Workspace `touch` succeeded; `ls ~/.ssh` failed with Operation not permitted; `curl https://example.com` failed with deny-network. `reset()` returned.
- `bun run typecheck` passed. `bun run lint` — 0 errors; remaining exhaustive-deps warnings are pre-existing in App.tsx / context-prompt-dialog.tsx.
- Desktop: **not verified** (Milestone 1 Homebrew-less GUI PATH).
- Packaged: **not verified** (Milestone 4).
- Diff inspect: no `pi-sandbox`, no `@carderne/sandbox-runtime`, no renderer import of the engine, no weaker-isolation flags, factory not in the default manifest.

## Mistakes and corrections

None. The installed engine only requires `rg` on Linux; this add-on still fail-closes on missing `rg` on macOS so GUI PATH without Homebrew stays a single contract.

## Owner feedback

None new. This slice exists so ordinary workspace `bash` can later skip permission asks once Milestone 2 lands.

## UI impact

None. No Settings section.

## Blockers and handoff

Accepted with Milestone 1 on 2026-08-17. See [`2026-08-17-m1-acceptance-review.md`](./2026-08-17-m1-acceptance-review.md). Permission skip remains Milestone 2.
