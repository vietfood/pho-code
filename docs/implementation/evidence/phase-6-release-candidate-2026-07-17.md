# Pho Code V1 `0.1.0` native release evidence — 2026-07-17

- Result: **V1 RELEASE PASS UNDER ADR 0005**
- Host: macOS 26.5.2, Apple Silicon (`arm64`), Rust 1.95.0
- Deliverable: `dist/Pho Code.app`
- Governing gate: [ADR 0005](../../decisions/0005-release-v1-and-defer-phase-6b.md) and [Phase 6](../v1/phase-6/README.md)

## Delivered workflow

The unsigned local app bundle contains the native `pho-native` workbench and the `pho` command adapter over the same runtime. The observed native workflow supports:

- Keychain-backed DeepSeek credential inspection, validation, replacement, and removal through a masked native field;
- registered-workspace selection, durable session listing/resume, a bounded composer, streamed assistant output, cancellation, and exact approval presentation;
- nested lazy file-tree expansion, bounded read-only UTF-8 file viewing, Git status, and bounded uncommitted-diff projection;
- a separately supervised user terminal with bounded PTY/emulator state, resize, interrupt, close, process-group cleanup, and no path into model context or approvals;
- persisted nonsecret preferences, transactional selected-context changes, interrupted-session reconstruction, named keyboard focus actions, and coordinated shutdown.

## Native and live observations

Computer Use exercised the final bundle rather than a mock view:

- the app reconstructed the prior live DeepSeek session and displayed the exact assistant response `PHO_PHASE6_LIVE_OK`;
- the credential dialog exposed only `DeepSeek API key secure input`; no credential value appeared in accessibility output;
- expanding `docs/architecture` and selecting `gpui-workbench.md` displayed the nested read-only file;
- Git refresh reported the current branch, and **Load diff** switched the viewer to a bounded uncommitted-change list;
- the terminal ran `printf 'PHO_FINAL_TERMINAL_OK\n'`, displayed the marker, reached `closed`, and did not become model/session input;
- Command-Q exited the final application normally.

The user-supplied DeepSeek credential was previously installed through the supported credential path and used for the live chat observation. It is not stored in the repository, bundle, preferences, sessions, logs, or this evidence record. It should be revoked by the user after qualification.

## Automated evidence

Focused current-tree Phase 6 suites passed:

- 41 workbench/controller/state/lifecycle/preference tests;
- 8 bounded Markdown/math tests;
- 7 Git-inspection tests;
- 9 workspace-inspection tests;
- terminal actor tests covering a real command, resize, the eight-terminal manager bound, aggregate buffering, and cleanup.

Before the final viewer-only mode-switch and lint cleanup, the repository-wide serial suite passed 280 non-ignored tests with 9 opt-in/manual tests ignored. On the final source, these checks passed:

```text
cargo fmt -- --check
cargo check --all-targets
cargo build --release --bin pho --bin pho-native
cargo clippy --all-targets --all-features -- -D warnings
git diff --check
```

The final repository-wide serial test attempt began with only 3.5 GiB free after Rust and terminal-test caches had consumed more than 21 GiB. It stopped with 215 tests passed, 2 ignored, and 10 failures whose common cause was `WatcherStartupFailed`/`ToolUnavailable`. After cleanup restored 57 GiB free, standalone Rust invocation still reported macOS `Failed to start fs event stream`, so host watcher availability—not a product assertion failure—remains the observed common condition. The previously passing affected tests passed in the earlier full run; this final attempt is nevertheless recorded as a verification gap rather than relabeled as a pass.

`cargo audit` reported zero known vulnerabilities after GPUI default-platform features were pruned. It retained eight allowed upstream warnings: six unmaintained transitive crates and two `git2` unsound-API advisories reached through `fff-search`. Pho Code does not directly call the warned `git2` APIs. The dependency graph contains one pinned GPUI source family at Zed revision `7cf50a771f54427f76b4584030c7b3b66f4e39f5`.

A repository filename scan found no `sk-`-shaped credential. The final bundle is an unsigned 27 MiB Apple Silicon app declaring macOS 13.0 as its minimum deployment target; signing, notarization, updates, and public distribution remain out of scope.

The standalone documentation-link test passed after the final documentation update, `git diff --check` passed, and both bundled executables were inspected as Apple Silicon Mach-O binaries with a valid `Info.plist`.

## Storage cleanup

After qualification, the 18 GiB Rust `target/` tree, approximately 3.6 GiB of terminal-test caches, and Pho Code qualification temporary directories were moved to macOS Trash. After the user emptied Trash, available data-volume space increased from 3.5 GiB to 57 GiB. `dist/Pho Code.app` and all source/documentation were preserved.

## Deferred to V2 Phase 6B

[ADR 0005](../../decisions/0005-release-v1-and-defer-phase-6b.md) accepts the demonstrated personal workflow as V1 and moves these unfinished original Phase 6 criteria to [V2 Phase 6B](../v2/phase-6b-native-completion.md):

1. the final-source repository-wide serial suite needs one clean rerun after rebuilding its removed cache;
2. the native terminal surface currently exposes one selected terminal rather than the complete eight-tab interaction and raw key/copy/search scenario matrix;
3. the final revision lacks the full command/native canonical-parity matrix and a clean-account supervised coding task through both adapters;
4. VoiceOver, full keyboard traversal, IME, reduced motion, multi-display restoration, theme/scale, and the supported-macOS scenario matrix remain incomplete.

These gaps remain explicit and unverified. They do not block the revised local V1 release, and they must pass before Phase 7 or later V2 expansion work begins.
