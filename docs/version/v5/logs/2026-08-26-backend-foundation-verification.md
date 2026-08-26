# Backend foundation verification

Date: 2026-08-26
Status: source, integration, and focused desktop verified; not packaged or accepted
Owner: V5 Pho Agent Foundation
Slices: B0–B4 in-source candidate

## Scope

Combined verification after production Pi host routing, backend-pinned application identity, lazy Codex composition, native tool projection, common owner interactions, exact Codex protocol checking, and ACP permission routing.

## Results

- `bun run typecheck` — all 11 package tasks passed.
- `bun run lint` — passed with 0 errors and 9 existing React hook warnings.
- Focused final protocol, host, Codex/ACP adapter, runtime/application, sidebar, tool-row, and host-dialog tests — 186 passed, 0 failed.
- Earlier full `bun test` inside the managed workspace sandbox — 788 passed and 6 macOS Seatbelt tests could not create home-directory fixtures or invoke their expected host sandbox. The isolated Seatbelt rerun outside that restriction passed 16 tests, 0 failed, including all six blocked cases. This is environment-qualified evidence; the sandboxed full command itself did not pass.
- `bun run build` — passed; Electron main bundled the host and Codex adapter.
- `bunx playwright test tests/chat.spec.ts tests/host-ui.spec.ts tests/ask-user.spec.ts` — 6 passed, 0 failed outside the GUI-restricted sandbox.
- Real installed `codex app-server` initialization reported the characterized CLI `0.149.1` and disposed without creating a thread or sending a provider prompt. The first attempt inside the managed filesystem sandbox failed because Codex could not initialize its normal SQLite state under `~/.codex`; the external rerun passed.
- Root and submodule `git diff --check` passed. The production lockfiles contain no `claude-agent-acp` entry after the dependency trial was removed.

## Not verified

- No real provider-backed Codex prompt, tool approval, resume, compaction, review, or subagent turn was run.
- No Claude-compatible ACP process was composed or executed.
- No packaged app lane was run for the new backends; Pho Code still does not bundle Codex or an ACP agent.
- Cross-backend scored evaluation and V5 acceptance review remain pending.

## Acceptance blockers

- Choose and implement source-owned Codex binary/config/auth policy and specialized MCP elicitation/auth/plan/compaction/review surfaces.
- Isolate the official Claude bridge's newer Anthropic SDK peer from Pi's pinned exact older version, or select a later compatible reviewed bridge, before production ACP composition.
- Finish B4 contract/evaluation evidence and acceptance review. B5 backend-native subagent grouping stays gated until B2–B4 are stable; Pho Agent orchestration remains out of scope.
