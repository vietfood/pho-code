# Pho Code

Pho Code is a macOS-only personal coding workbench. The repository contains a stable `pho` command adapter and a native GPUI workbench (`pho-native`) over the same Rust runtime. V1 supports one user-owned DeepSeek API-key profile, one root agent turn, sequential model tools, durable local sessions, a read-only workspace/file and Git view, and a separate user-operated terminal.

This is a local, unsigned personal build. Signing, notarization, automatic updates, public distribution, writable file editing, additional real backends, concurrent agent turns, subagents, compaction, and non-macOS platforms are outside the V1 release gate.

Current status (2026-07-17): **V1 `0.1.0` released for local Apple Silicon use.** Its Keychain credential flow, live DeepSeek chat, durable session reconstruction, nested file view, Git diff view, user terminal, and clean shutdown were exercised in the real app. [ADR 0005](docs/decisions/0005-release-v1-and-defer-phase-6b.md) revises the first-release boundary; the unfinished multi-terminal, parity, clean-suite rerun, and broader accessibility/compatibility matrix now belong to [V2 Phase 6B](docs/implementation/v2/phase-6b-native-completion.md). See the [V1 release evidence](docs/implementation/evidence/phase-6-release-candidate-2026-07-17.md).

## Requirements

- macOS 13.0 or later (the app bundle declares this minimum; every macOS/display/architecture combination still requires qualification on the machine where it is used).
- Xcode Command Line Tools and a current stable Rust toolchain.
- A funded DeepSeek API account if live model requests are needed. Pho Code sends selected model-visible content to the fixed DeepSeek API origin; provider processing, retention, pricing, and availability are governed by the provider's current terms and model profile.

## Build and run from the checkout

```sh
cargo build --release --bin pho --bin pho-native
cargo run --bin pho-native
cargo run --bin pho -- --help
```

The native adapter owns the window, credential dialog, workspace selection, chat composer, transcript, approvals, file/diff viewer, Git projection, and user terminal. These panes are typed projections over shared application services. Views do not access the filesystem, Keychain, network, journals, tools, Git, or PTYs directly; those operations run through the shared application services.

## Build a local app bundle

From the repository root:

```sh
scripts/build-macos-app.sh
open "dist/Pho Code.app"
```

The script builds both release binaries, validates `Info.plist`, and creates:

```text
dist/Pho Code.app/Contents/MacOS/Pho Code
dist/Pho Code.app/Contents/Resources/bin/pho
```

The first path is the native executable launched by Finder. The second is the CLI executable; invoke it with a quoted path, for example `"dist/Pho Code.app/Contents/Resources/bin/pho" status`. The bundle contains only executable resources and metadata. It never includes Keychain records, preferences, sessions, artifacts, workspace files, prompts, or credentials. The script refuses to overwrite an existing output unless `--force` is supplied; `--force` moves the old bundle to the macOS Trash before replacement.

The app is intentionally unsigned and unnotarized. macOS may require the user to approve the local app in Privacy & Security before opening it. No signing identity, entitlements, notarization ticket, installer, or update channel is included.

## Credentials

Use the native **Open DeepSeek credential settings** action and enter the key into its secure field, or use `pho login` from a controlling terminal. The candidate is validated before it replaces a usable Keychain record. The key is stored only in the macOS Keychain service namespace `com.pho-code.credentials.v1` (account `deepseek-api`) and in short-lived secret-wrapped memory.

API keys are never accepted as command arguments, environment variables, project files, URLs, ordinary stdin, clipboard automation, session records, preferences, artifacts, child-process environments, or logs. `pho status` reports only nonsecret credential state; `pho logout` removes the Keychain record after owned work is stopped. If a key is shared for a test, revoke it at the provider when testing is complete.

## CLI commands

```text
pho login
pho status
pho logout
pho context
pho session list
pho session resume <session-id>
pho chat
pho chat --raw
pho chat --stdin
```

`pho chat` creates or resumes a durable session in the current workspace. `--raw` and `--stdin` are non-cursor-control presentation modes; `--stdin` is prompt input only and never an approval channel. Patch and model-shell effects always require an exact, identity-bound user approval. A denied, cancelled, unavailable, or uncertain effect is recorded as such and is never replayed automatically.

## Verification commands

Run the repository checks from its root:

```sh
cargo fmt -- --check
cargo check --all-targets
cargo build
cargo test -- --test-threads=1
cargo clippy --all-targets --all-features -- -D warnings
cargo tree -e features --offline
cargo tree -d --offline
```

The native executable, app bundle, Keychain scenarios, and accessibility checks require a supported macOS host. Live DeepSeek qualification additionally requires a user-owned account and controlling terminal; it is dated evidence, not a permanent provider guarantee. Rust build caches can exceed 18 GiB for this dependency graph; after packaging, preserve `dist/Pho Code.app` and remove `target/` through a recoverable cleanup workflow when space matters. The [implementation roadmap](docs/implementation/README.md), [V1 release evidence](docs/implementation/evidence/phase-6-release-candidate-2026-07-17.md), and [Phase 6B plan](docs/implementation/v2/phase-6b-native-completion.md) distinguish released behavior from deferred qualification.

## Local state and recovery

Application state is rooted at:

```text
~/Library/Application Support/Pho Code/
```

The root contains the single-instance lock, nonsecret workbench preferences, append-only `sessions/` journals, and bounded `artifacts/`. Preferences retain layout, theme, workspace registrations, selected tabs, and dormant terminal descriptors; they never contain API keys or live PTY state. Session recovery reconstructs canonical completed and interrupted/uncertain turns without re-running effects. A missing or damaged workspace remains unavailable rather than being silently attached by display name. Removing a workspace registration never deletes its files or journals.

The user terminal is separate from the model-facing shell tool. It inherits only the documented safe environment policy, has bounded PTY/emulator buffers, and is not an approval or model-context channel. Terminal output cannot open files, write the clipboard, invoke Git, or dispatch agent intents. Closing or shutting down the app performs explicit child cleanup; after a crash, terminals are dormant and are never reattached or replayed automatically.

## Security and data boundaries

- DeepSeek requests use the fixed production API origin and the qualified model profile; arbitrary provider endpoints are unsupported.
- Workspace paths are canonicalized and retained before tools, tree inspection, file viewing, or Git operations. The viewer is read-only, does not follow symlinks for authority, and preserves source text when rendering is unavailable.
- Markdown/LaTeX is bounded and offline. Remote resources, active HTML, file inclusion, arbitrary fonts, and process execution are disabled; unsupported math remains visible as source.
- The approved model shell is noninteractive, bounded, and supervised. Approval is not a sandbox claim: a user-approved command can affect the selected workspace and permitted local environment.
- User-terminal authority is direct user authority, not model authority. Its environment, input, output, process identity, and scrollback are excluded from model context, journals, artifacts, and diagnostics.
- Diagnostics are redacted and do not include prompts, reasoning, file bodies, command output, credentials, headers, account data, or personal absolute paths.

For current backend behavior, phase evidence, and compatibility dates, start at [`docs/README.md`](docs/README.md), [ADR 0003](docs/decisions/0003-deepseek-api-first-backend.md), [ADR 0004](docs/decisions/0004-native-workbench-phase-6.md), and the [Phase 6 release gate](docs/implementation/v1/phase-6/README.md).
