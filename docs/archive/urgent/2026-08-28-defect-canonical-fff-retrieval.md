# Canonical FFF retrieval

Status: **Accepted; archived 2026-08-28**
Owner: accepted runtime architecture
Date: 2026-08-28

## Problem

Pho Code shipped its application-owned FFF index as three additive tools while Pi's built-in `find` and `grep` stayed active. The agent therefore had overlapping retrieval choices, and Pi's built-ins could acquire `fd` or `rg` at runtime when those programs were absent. The additive adapter also trusted FFF query constraints, dropped the constraint during fuzzy fallback, ignored returned context lines, and placed no byte bound on formatted output.

Upstream evidence supported the override direction but also showed why Pho Code should keep its own narrow adapter:

- FFF's Pi extension documents an override mode for canonical `find` and `grep`: [pi-fff README](https://github.com/dmtrKovalenko/fff/blob/main/packages/pi-fff/README.md).
- The `0.10.1` wrapper could drop `path` and exclusions during fuzzy fallback: [FFF issue #697](https://github.com/dmtrKovalenko/fff/issues/697).
- A concrete gitignored path was absent from the main index even when explicitly requested: [FFF issue #714](https://github.com/dmtrKovalenko/fff/issues/714).
- Native AI-mode regex handling could discard an exact-file constraint: [FFF issue #756](https://github.com/dmtrKovalenko/fff/issues/756).
- Context plus result-limit behavior could grow far beyond the caller's requested bound: [FFF issue #768](https://github.com/dmtrKovalenko/fff/issues/768).

A directional local measurement on this checkout found a warm FFF grep median of about 1.1 ms across 80 calls versus about 73 ms for a fresh `rg` subprocess across 20 calls. The operations and output contracts were not equivalent, so this was treated as evidence for avoiding process startup—not as a general speed claim.

## Owner decision

The owner explicitly rejected backward compatibility and asked for the cleanest product surface. Pho Code therefore registers only FFF-backed `find` and `grep`. It does not retain old display aliases, permission aliases, transcript aliases, or a multi-pattern tool. Regex alternation through canonical `grep` covers the latter without another schema or cursor cache. Accepted V2 records remain immutable historical evidence.

The sandbox's pinned `rg` is unrelated and remains bundled for sandbox-runtime deny-path detection. Canonical retrieval does not use it.

## Implemented contract

- Local retrieval feature version `2.0.0` replaces Pi's same-name tool registrations through the supported inline-extension registry.
- Tool parameters retain Pi's canonical names: `find` takes `pattern`, `path`, and `limit`; `grep` takes `pattern`, `path`, `glob`, `ignoreCase`, `literal`, `context`, and `limit`.
- `find` accepts glob patterns and fuzzy filename queries. `grep` uses regular expressions by default and literal matching on request.
- A path must exist, resolve through symlinks inside the workspace, and is post-filtered against every returned match. The content query never embeds the path constraint.
- If a concrete requested path is absent from the git-aware workspace index, a temporary no-watch finder scans only that directory (or an exact file's parent) and is destroyed after the call.
- Find is capped at 100 paths. Grep is capped at 100 matches, five context lines before and after, 500 characters per rendered line, five seconds of native search, and 200 KiB of final UTF-8 output.
- Abort is checked before index work, after a scoped scan, and before returning. FFF's synchronous native call cannot be interrupted mid-call, so the time budget is the in-call bound.
- FFF initialization failure stays a named feature diagnostic and does not prevent ordinary chat.

## Verification

Accepted on 2026-08-28 with:

- focused native retrieval and registration tests: 4 passed, 22 assertions. Tests disable only FFF ranking-data persistence so the enclosing command sandbox's LMDB restriction cannot turn them into unavailable-branch skips; production still defaults to persistent frecency/history;
- focused runtime composition/startup tests after repairing deterministic default-feature ownership: 34 passed, including a default-manifest assertion for local retrieval;
- root typecheck: passed;
- root lint: passed with zero errors and eight unrelated existing React-hook warnings;
- full unit/integration attempt: 933 passed; one resource-staging timeout and six enclosing-sandbox denials then all passed in focused reruns (4 staging tests and 15 macOS sandbox tests, the latter outside the enclosing sandbox as required);
- Electron desktop lane: 31 passed;
- production build: passed;
- unsigned macOS package assembly: passed, including the existing exact-version FFF resolver patch for its ASAR-unpacked native binary;
- focused packaged scenario: passed in the built `.app`. Feature diagnostics reported `local-retrieval 2.0.0 · loaded`; deterministic canonical `find` returned `disposable-fixture.txt`; canonical `grep` returned its `owned` content; Trash then completed. The launcher forced the minimal system `PATH`, so neither Pi CLI nor user-installed `rg`/`fd` supplied retrieval.

The full packaged attempt also exposed two unrelated existing lane failures: a sandbox-settings copy assertion expects text no longer rendered by the current UI, and the Plan/Agent scenario timed out on a fixed work-log index. They do not touch retrieval; the retrieval-owning packaged scenario passed after its new assertions were corrected to inspect expanded tool output rather than the intentionally compact collapsed card.

## Correction to earlier evidence

The completed [unwired-validator note](../../urgent/2026-08-27-defect-unwired-protocol-and-ripgrep-guards.md) said the old retrieval tools reached the bundled `rg` by absolute path. That was incorrect: local retrieval was already FFF-native. Only the sandbox engine uses `resolveRipgrepPath`. This record preserves and corrects that historical mistake rather than silently rewriting it.
