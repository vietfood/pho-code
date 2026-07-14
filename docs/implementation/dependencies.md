# Direct dependency baseline

- Status: Phase 0 implementation evidence
- Last reviewed: 2026-07-14
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
| `base64`, `sha2`, `getrandom` | `0.22.1`; `0.10.9`; `0.4.3` | PKCE, bounded JWT metadata decoding, and operating-system randomness | MIT OR Apache-2.0 |
| `url` | `2.5.8`; `serde` | Strict OAuth callback and endpoint parsing | MIT OR Apache-2.0 |
| `zeroize` | `1.9.0`; derive | Clear transient secret-owned buffers on drop | MIT OR Apache-2.0 |
| `security-framework` | `3.7.0`, macOS only | Apple-native Keychain generic-password storage | MIT OR Apache-2.0 |
| `uuid` | `1.23.5`; `serde`, `v4` | Opaque local identities and nonsecret request correlation | MIT OR Apache-2.0 |
| `thiserror` | `2.0.18` | Concrete bounded component errors without a generic framework | MIT OR Apache-2.0 |
| `libc` | `0.2.186` | macOS advisory `flock` for the OS-released single-instance guard | MIT OR Apache-2.0 |
| `tempfile` | `3.25.0`, development only | Disposable workspaces and component fixtures | MIT OR Apache-2.0 |

The active Phase 0 graph has one Zed/GPUI source revision, one Tokio version, and one Rustls family for Pho Code's HTTP path. GPUI retains its own `smol` executor internally; Pho Code does not create or use a second application runtime from it.

`gpui-component` is deliberately deferred until Phase 6. Its audited submodule revision is `b004e595cf5de98a73b6b561394a559a94ae1e2a`, but adding it now causes Cargo to resolve a second GPUI source identity because its manifest names the unqualified Zed Git URL. Phase 6 must pin or patch the dependency coherently before use rather than accepting two GPUI copies.
