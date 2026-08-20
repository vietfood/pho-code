# V4 implementation logs

Create one dated record per bounded V4 slice, review, defect, or release candidate:

```text
YYYY-MM-DD-<milestone-or-kind>-<short-slug>.md
```

Each record should name status, owner, milestone, intent, affected contracts/files, related workstreams, decisions, verification actually run, mistakes/corrections, blockers, and handoff. Never rewrite an older log to hide a failed release attempt or security finding.

V4 logs own release-engineering and runtime-process evidence. UI feedback still receives a reciprocal record under [`../../../ui/logs/`](../../../ui/logs/README.md) when the public-beta work changes conversation chrome. Terminal and compaction continue to own their independent implementation evidence.
