# V5 implementation logs

Create one dated record per bounded V5 milestone slice, evaluation run, defect, review, correction, owner-feedback thread, or acceptance candidate:

```text
YYYY-MM-DD-<milestone-or-kind>-<short-slug>.md
```

Each record names status, owner, milestone, intent, affected contracts/files, related workstreams, decisions, verification actually run, evaluation fixture/model identity where relevant, mistakes/corrections, blockers, and handoff.

Do not append execution evidence to the read-mostly implementation plan. Do not rewrite a baseline, failed evaluation, or earlier conclusion after seeing later results. Corrections get a new dated record and are carried into the final acceptance review.

V5 logs own `pho-agent` package extraction, Task Brief, evidence-pack, verification-ledger, completion, and evaluation evidence. UI behavior also receives a reciprocal record under [`../../../ui/logs/`](../../../ui/logs/README.md). Context-compaction implementation evidence remains under [`../../../features/compaction/logs/`](../../../features/compaction/logs/README.md). V4 release/process evidence remains under [`../../v4/logs/`](../../v4/logs/README.md).

Current M0 implementation evidence: [`2026-08-20-m0-harness-ownership-expansion.md`](./2026-08-20-m0-harness-ownership-expansion.md).

Production repository extraction: [`2026-08-20-m0-pho-agent-submodule.md`](./2026-08-20-m0-pho-agent-submodule.md).

Checkout re-verification after submodule init: [`2026-08-20-m0-checkout-verification.md`](./2026-08-20-m0-checkout-verification.md).

Packaged gate: [`2026-08-20-m0-packaged-verification.md`](./2026-08-20-m0-packaged-verification.md).

Backend-neutral owner direction and first host seam: [`2026-08-26-backend-neutral-direction.md`](./2026-08-26-backend-neutral-direction.md).

Codex lifecycle/native-activity prototype and corrected optional capability seam: [`2026-08-26-codex-native-activity-prototype.md`](./2026-08-26-codex-native-activity-prototype.md).

Production Pi session routing through the backend registry: [`2026-08-26-b1-production-pi-host-routing.md`](./2026-08-26-b1-production-pi-host-routing.md).

Backend-pinned application identity, experimental Codex desktop selection, native transcript projection, and the Claude ACP packaging blocker: [`2026-08-26-codex-desktop-vertical-slice.md`](./2026-08-26-codex-desktop-vertical-slice.md).

Backend-neutral Codex approvals and request-user-input through the existing interaction dock: [`2026-08-26-codex-owner-interactions.md`](./2026-08-26-codex-owner-interactions.md).

Stable ACP permission requests through the same interaction seam: [`2026-08-26-acp-permission-interactions.md`](./2026-08-26-acp-permission-interactions.md).

Combined backend-foundation verification and remaining acceptance blockers: [`2026-08-26-backend-foundation-verification.md`](./2026-08-26-backend-foundation-verification.md).

External-backend ownership decision, lazy Claude ACP production composition, and subagent-scope correction: [`2026-08-27-external-backend-ownership.md`](./2026-08-27-external-backend-ownership.md).

Codex version-gate correction and composer backend switcher: [`2026-08-27-codex-compatibility-and-composer-switcher.md`](./2026-08-27-codex-compatibility-and-composer-switcher.md).

Codex/ACP model discovery, text-delta streaming, and same-run merge correction: [`2026-08-27-external-models-and-streaming.md`](./2026-08-27-external-models-and-streaming.md).

Backend-advertised reasoning, Fast service tier, incremental tool updates, and the prompt/tool ownership boundary: [`2026-08-27-external-reasoning-fast-and-tool-stream.md`](./2026-08-27-external-reasoning-fast-and-tool-stream.md).

Product-owned Codex developer instructions, the first curated dynamic tool, and owner-reported Codex/Claude provider verification: [`2026-08-27-codex-instructions-and-tool-bridge.md`](./2026-08-27-codex-instructions-and-tool-bridge.md).

Agent `read_skill` catalog and autonomous invocation (no `/` required): [`2026-08-27-change-agent-skill-invocation.md`](./2026-08-27-change-agent-skill-invocation.md).
