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
