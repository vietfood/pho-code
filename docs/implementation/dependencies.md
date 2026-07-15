# Direct dependency baseline

- Status: Phase 0 implementation evidence
- Last reviewed: 2026-07-15
- Manifest owner: [`Cargo.toml`](../../Cargo.toml)

This record explains Pho Code's direct dependencies. `Cargo.lock` owns the exact transitive resolution; `cargo tree -e features` is the executable feature-graph evidence. New direct dependencies require an updated row and a feature/license review.

The table records the current post-Phase-1 manifest, which still compiles frozen ChatGPT OAuth code. Phase 1B must update this evidence alongside its manifest refactor, distinguish dependencies still required by DeepSeek/command mode from OAuth-only dependencies, and verify the lockfile/feature graph after any manifest cleanup. This evidence does not make the frozen backend a current product path.

| Dependency | Pin and enabled features | Purpose | Declared license |
| --- | --- | --- | --- |
| `gpui`, `gpui_platform` | Zed revision `7cf50a771f54427f76b4584030c7b3b66f4e39f5`; `gpui_platform/font-kit` | Native application, window, rendering, and macOS platform entry point | Apache-2.0 |
| `tokio` | `1.52.3`; `io-std`, `io-util`, `macros`, `net`, `process`, `rt-multi-thread`, `sync`, `time` | One application-owned runtime, loopback I/O, timers, bounded channels, and later process supervision | MIT |
| `tokio-util` | `0.7.18`; `rt` | Cancellation tokens with explicit operation ownership | MIT |
| `zed-reqwest` | Revision `c15662463bda39148ba154100dd44d3fba5873a4`; `json`, `stream`, `rustls-tls-native-roots`; defaults disabled | Streamed HTTPS without adding a second active HTTP/TLS stack beside the Zed graph | MIT OR Apache-2.0 |
| `serde`, `serde_json` | `1.0.228` with derive; `1.0.150` | Bounded provider DTOs, fixtures, credentials, and later journal records | MIT OR Apache-2.0 |
| `bytes`, `futures-util` | `1.11.1`; `0.3.32` | Incremental response chunks and stream polling | MIT; MIT OR Apache-2.0 |
| `ratatui`, `crossterm`, `unicode-width`, `unicode-segmentation` | `0.30.2` with defaults disabled and `crossterm_0_29`; `0.29.0` with default events/bracketed-paste plus `event-stream`; `0.2.2`; `1.13.3` | Phase 3B alternate-screen rendering, terminal restoration, asynchronous input events, and deterministic grapheme-safe Unicode wrapping/cursor geometry without a second runtime | MIT; MIT; MIT OR Apache-2.0; MIT OR Apache-2.0 |
| `base64`, `sha2`, `getrandom` | `0.22.1`; `0.10.9`; `0.4.3` | PKCE, bounded JWT metadata decoding, and operating-system randomness | MIT OR Apache-2.0 |
| `url` | `2.5.8`; `serde` | Strict OAuth callback and endpoint parsing | MIT OR Apache-2.0 |
| `zeroize` | `1.9.0`; derive | Clear transient secret-owned buffers on drop | MIT OR Apache-2.0 |
| `security-framework` | `3.7.0`, macOS only | Apple-native Keychain generic-password storage | MIT OR Apache-2.0 |
| `uuid` | `1.23.5`; `serde`, `v4` | Opaque local identities and nonsecret request correlation | MIT OR Apache-2.0 |
| `thiserror` | `2.0.18` | Concrete bounded component errors without a generic framework | MIT OR Apache-2.0 |
| `libc` | `0.2.186` | macOS advisory `flock` for the OS-released single-instance guard | MIT OR Apache-2.0 |
| `fff-search`, `ignore`, `notify`, `neo_frizbee`, `regex` | `0.9.6` with defaults disabled; `0.4.28`; `9.0.0-rc.4`; `0.10.4`; `1.13.0` | Phase 4 in-memory path index and ranking, pre-scan indexed-file bound with matching ignore semantics, health-observable dirty-event signaling, bounded fuzzy line matching, and prevalidated regex matching; unsafe FFF 0.9.6 watcher/content-reader paths remain disabled | MIT; MIT OR Unlicense; CC0-1.0; MIT; MIT OR Apache-2.0 |
| `tempfile` | `3.25.0`, development only | Disposable workspaces and component fixtures | MIT OR Apache-2.0 |

The active Phase 0 graph has one Zed/GPUI source revision, one Tokio version, and one Rustls family for Pho Code's HTTP path. GPUI retains its own `smol` executor internally; Pho Code does not create or use a second application runtime from it.

The Phase 3B terminal graph was checked on 2026-07-15. Ratatui 0.30.2 declares Rust 1.88 and MIT; Pho Code builds it with Rust 1.95, the Crossterm 0.29 full-screen backend, and no enabled scrolling-regions, Termion, Termwiz, or Termina feature. `cargo tree -e features` reports one active Crossterm 0.29 instance and the existing single Tokio 1.52 application runtime. Crossterm's `event-stream` feature adds an asynchronous facade over its existing event source rather than another runtime. Unicode Segmentation 1.13.3 was already present transitively and is pinned directly for grapheme-safe composer edits. No Ratatui calendar, serialization, palette, or unstable feature is enabled.

The Phase 4 FFF graph was checked on macOS on 2026-07-15. `fff-search` 0.9.6 has no default Cargo features enabled, but its nonoptional graph still includes native Git/libgit2, LMDB/heed, notify, mmap, Rayon, and tracing facilities: 29 direct normal/target dependencies, 137 unique normal-graph package identities, and 38 incremental identities over the prior Pho Code graph. All FFF-graph packages expose license metadata; the graph includes one MPL-2.0 package (`option-ext`) and otherwise MIT, Apache, Unicode, BSD, BSL, CC0, Unlicense, or Zlib-family expressions. The built-in watcher and content reader failed Phase 4's symlink-source and health audit, so Pho Code uses only the in-memory no-follow scan and fuzzy path facilities, with `ignore` and `notify` pinned directly from the already-resolved graph for a bounded pre-scan using matching ignore rules and dirty-event signaling, plus a descriptor-safe content adapter. These direct pins add no package identity beyond the audited FFF graph. The larger dependency footprint remains accepted for the required V1 integration; [Phase 4 evidence](evidence/phase-4-2026-07-15.md#upstream-and-dependency-evidence) records the supported-macOS build, 7,954-file/864-ms scan, and 20,624-KiB steady resident measurement.

`gpui-component` is deliberately deferred until Phase 6. Its audited submodule revision is `b004e595cf5de98a73b6b561394a559a94ae1e2a`, but adding it now causes Cargo to resolve a second GPUI source identity because its manifest names the unqualified Zed Git URL. Phase 6 must pin or patch the dependency coherently before use rather than accepting two GPUI copies.
