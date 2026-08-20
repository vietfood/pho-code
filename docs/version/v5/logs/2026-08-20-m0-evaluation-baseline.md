# M0 evaluation specification and deterministic baseline

Date: 2026-08-20
Status: Slice 0A implemented and frozen; V5 M0 remains incomplete
Owner: repository owner
Plan: V5 Milestone 0, Slice 0A

## Intent

Freeze the V5 evaluation case shape, deterministic scoring, development/holdout cohorts, current-harness observation capture, cohort identity, repetition count, and M4 thresholds before any M1 intelligence behavior exists.

This record is immutable baseline evidence. A correction requires a new dated V5 log and a new comparison cohort; do not rewrite this file after candidate results exist.

## Implemented boundary

- Added private headless `@pho-agent/evals` with typed cases, observations, scores, aggregate metrics, runtime fixture validation, stable configuration fingerprints, and exclusive-create result files.
- Added three development and three holdout synthetic cases. Fixtures contain repository-owned synthetic content only, including explicit forbidden canaries; they contain no owner sessions, credentials, workspace content, or screenshots.
- Added source-controlled current-harness baseline observations. These capture the deterministic pre-V5 state: ordinary task checks may succeed, but there is no structured evidence selection, verification ledger, criterion assessment, or recovery record.
- Added frozen root commands:
  - `bun run eval:v5`
  - `bun run eval:v5:development`
  - `bun run eval:v5:holdout`
- Raw results are written with `wx` semantics into a new owned operating-system temporary directory. Every run has a unique ID and failed attempts are not replaced by retries.

The baseline capture is deterministic scorer evidence, not a live provider-quality run or a runtime-integration claim. Fixed zero latency/token-injection fields mean “not observed by this capture,” not “free execution.” M0 runtime parity and the real Pi lifecycle remain Slice 0C work.

## Frozen source identity

Repository base at freeze time: `33678af798adf2e2fe9373d9facda234d09dedae`.

The new files were uncommitted when this owner-requested slice ran, so no later commit is claimed here. Exact content is frozen by SHA-256 and Git blob identity:

| Source | SHA-256 | Git blob |
| --- | --- | --- |
| `fixtures/development.json` | `366d91b2915b281acd4bbfc710f958e0b98f661db75f9ca1b5470f223d09444d` | `fe8eb8d273a66e687122d1fa7628f76c68dbd9e8` |
| `fixtures/holdout.json` | `7be8402ea5d1881c61c54c4e5f4dd0b9417bcdc0c246ab8e01cea7e38e84e1db` | `889591405966aaa5fa2bca462cff60f63056e19a` |
| `fixtures/baseline-observations.json` | `75d1a08040292aee8d70764efd9b4aa44b3a464879f82c146634d9be0bd5c0f8` | `b552feb4e7b5da9f9a88efcfc035e1b7bb570164` |

Runner-computed normalized fixture checksums:

- development: `2a1e6bfb54ba1bad8969ae0bb34f32ad41054fe2090d6fc14d930e249cff9662`;
- holdout: `78b646b5af35bb20e00414a1dace2b89054e43eb9df26c11ec37b3f603601929`.

## Frozen cohort configuration

| Field | Value |
| --- | --- |
| Runner/schema | `@pho-agent/evals` `0.1.0`; result schema `1` |
| Adapter | `pho-code-current-deterministic-capture-v1` |
| Provider/model | `harness-test` / `slice` |
| Thinking | `off` |
| Feature profile | `deterministic-default` |
| Permission profile | `isolated-empty-manifest` |
| Context | `synthetic-fixture-only` |
| Fixture revision | `v5-m0-2026-08-20.1` |
| Rubric | `v5-m0-rubric.1` |
| Repetitions | `3` per case cohort |
| Configuration fingerprint | `6036061e2372bfcf0dbf451194e549dd5bdddd6bf8d73de10d4f0dc05a19a26b` |

M4 comparison must keep provider, model, thinking, permission profile, context, fixture revision, rubric, and repetition count fixed. The only intended feature delta is enabling the accepted V5 intelligence path; that candidate phase must be recorded explicitly rather than hidden inside the fingerprint. Any other change creates a new comparison cohort.

## Baseline run

Command:

```bash
bun run eval:v5
```

Owned raw result directory:

`/var/folders/ss/4vp4yfn12f51kct273x025m00000gn/T/pho-agent-evals-VeArqy`

Raw result checksums:

| Cohort/repetition | Run ID | SHA-256 |
| --- | --- | --- |
| development/1 | `95b27675-eb10-4832-8277-e8809f46bea7` | `9deae078cfef028762243292d987e89d0d04a73ea4a5b9932a1d3b18a640de4c` |
| development/2 | `edc49dc1-eed0-4465-a183-a1c79b6de138` | `e17338b8e37ccd36d3f24fd78cfac70451343b7b3466c3ca863972f7905716ae` |
| development/3 | `6972eb5e-45b1-4f1f-9c2a-8c5ef962c99c` | `5fa1e0b6bdc72b5d117109bb6cdd13096587bcc404067c5d75a81633e2ec0c76` |
| holdout/1 | `3be14598-116f-4087-b208-367fc88a6cc5` | `766c9ca49e8c8293e83b659cd2606b66eb317de7dae905daf89e4c4479cef75d` |
| holdout/2 | `537119a6-cb5a-4ec4-bd67-ed1096f310ac` | `b17e0aeb848ca70d2ad58a3c7bdfd0f71d6ccef5b73f5896171104b8f9e7b49c` |
| holdout/3 | `302bace9-8e67-4802-bd27-d0cee10be884` | `3858fa6a97d3a2ed6741767ed552ee4c705057b5cced5927b431cebfc7e7a7e9` |

All three deterministic repetitions produced identical metrics:

| Metric | Development | Holdout |
| --- | ---: | ---: |
| Task success | `5/7` (`0.7142857`) | `4/5` (`0.8`) |
| Critical evidence recall | `0/5` (`0`) | `0/5` (`0`) |
| Evidence precision | not defined; no structured selections | not defined; no structured selections |
| Forbidden-evidence rate | `0/2` (`0`) | `0/1` (`0`) |
| Unsupported claims | `2` | `2` |
| Verification false-pass rate | `0` | `0` |
| Criterion coverage | `0/6` (`0`) | `0/5` (`0`) |
| Recovery quality | `0/1` (`0`) | `0/1` (`0`) |
| Tool-call capture | `7` | `6` |
| Provider-use capture | `3` | `3` |
| Injected characters / estimated tokens / measured latency / cost | `0 / 0 / 0 / 0` (not observed by capture) | `0 / 0 / 0 / 0` (not observed by capture) |

## Pre-registered M4 thresholds

The frozen development and holdout cohorts must satisfy all of the following without changing fixtures, scoring, or rubric after candidate results are seen:

1. Deterministic task success does not regress: development at least `5/7`; holdout at least `4/5`.
2. Critical evidence recall is at least `0.8` in each cohort and improves by at least `0.5` absolute over baseline.
3. Evidence precision is at least `0.8` whenever the candidate selects evidence.
4. Forbidden-evidence rate is exactly `0`; neither forbidden canary may enter selected evidence or a claim.
5. Unsupported-claim count is `0` in each cohort.
6. Verification false-pass rate is exactly `0`.
7. Criterion coverage is `1.0` for every case carrying criteria; each outcome must be passed, failed, or honestly unverified.
8. Recovery quality is `1.0` across the two contradicted-assumption/unrelated-failure cases.
9. Protocol and configured evidence-budget bounds pass deterministically in the owning package tests; no oversized or malformed case/result is accepted.
10. Existing Pho Code typecheck, lint, unit, desktop, build, package, and packaged gates are not weakened. M0 extraction must preserve their accepted behavior.

Efficiency remains reported rather than optimized at the expense of correctness. M4 must report tool calls, injected characters/estimated tokens, latency, provider use, and cost for the candidate; no hard efficiency improvement is pre-registered because this capture did not observe comparable latency/token values.

## Verification performed

- `bun test packages/agent-evals/test` — PASS, 5 tests, 11 assertions. Unit verified.
- `bun run --filter @pho-agent/evals typecheck` — PASS. Statically verified.
- `bun run eval:v5` — PASS, six append-only raw results across three development and three holdout repetitions. Deterministic evaluation verified.

The first combined test/typecheck attempt exposed a missing Bun global type in the CLI. The CLI was corrected to use `node:fs/promises`, then the exact checks above passed. No result from the failed attempt is represented as baseline evidence.

Not run for this slice: full repository lint/typecheck/unit, Electron desktop, build, package, or packaged checks. They belong to the integrated M0 gate after Slices 0B and 0C.

## Owner/provider status

No credentials, owner sessions, owner workspaces, or real-provider network calls were used. Real-provider baseline evidence is **unavailable and not owner-verified**. Until a separately recorded owner cohort exists, V5 may not make comparative real-provider quality claims or substitute an LLM judge for owner evidence.

## Handoff

Slice 0A is frozen. Continue M0 package extraction and consumer/parity proof without changing these fixtures, observations, rubric, thresholds, or scoring semantics. If a defect is discovered before candidate scoring, create a new dated correction record and a new cohort identity.
