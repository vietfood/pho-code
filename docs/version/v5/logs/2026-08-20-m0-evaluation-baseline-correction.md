# M0 live deterministic baseline correction

Date: 2026-08-20
Status: frozen M0 comparison cohort; supersedes the scorer-only cohort for M4 comparison
Owner: repository owner
Plan: V5 Milestone 0, Slice 0A
Corrects: [`2026-08-20-m0-evaluation-baseline.md`](./2026-08-20-m0-evaluation-baseline.md)

## Correction

Integration review found that the first M0 record executed the deterministic scorer over source-controlled captured observations but did not invoke the named `harness-test` provider. Its structural scorer evidence remains valid, but its model/provider usage and task-success totals are not a live current-harness baseline and must not be used for M4 comparison.

No M1 source exists and no candidate result has been scored. The correction therefore creates a new cohort identity before intelligence behavior changes, as the V5 result-integrity rule requires. The first record remains intact as evidence of the mistake and correction path.

## Corrected command and adapter

The frozen root commands now invoke Pho Code's real deterministic runtime, pinned Pi `0.84.1`, isolated agent/workspace roots, and the source-controlled synthetic fixtures:

```bash
bun run eval:v5
bun run eval:v5:development
bun run eval:v5:holdout
```

`scripts/run-v5-baseline.ts` creates one isolated Pho Code runtime/workspace per case, writes only the synthetic setup files, sends the case prompt through the existing `harness-test/slice` model, waits for authoritative settlement, inspects the resulting transcript/files, captures measured latency/tool/provider use, and disposes the runtime. It does not use owner data, credentials, an LLM judge, or the new headless consumer.

Frozen source identity:

| Source | SHA-256 | Git blob |
| --- | --- | --- |
| `scripts/run-v5-baseline.ts` | `67a46816baa58afe85286b16b91f2d144366d9ccb8233d188c5d14eee45f77d6` | `d845a86f0ce777e7b20362c2bb01e194c21b2573` |
| `fixtures/development.json` | `366d91b2915b281acd4bbfc710f958e0b98f661db75f9ca1b5470f223d09444d` | `fe8eb8d273a66e687122d1fa7628f76c68dbd9e8` |
| `fixtures/holdout.json` | `7be8402ea5d1881c61c54c4e5f4dd0b9417bcdc0c246ab8e01cea7e38e84e1db` | `889591405966aaa5fa2bca462cff60f63056e19a` |

Repository base: `33678af798adf2e2fe9373d9facda234d09dedae`. New M0 files were uncommitted, so content hashes—not a later commit—freeze them.

## Corrected cohort identity

| Field | Value |
| --- | --- |
| Runner/schema | `@pho-agent/evals` `0.1.0`; result schema `1` |
| Adapter | `pho-code-live-deterministic-v1` |
| Provider/model | `harness-test` / `slice` |
| Thinking | `off` |
| Feature profile | `pre-v5-current-harness` |
| Permission profile | `isolated-empty-manifest` |
| Context | `synthetic-workspace` |
| Fixture revision | `v5-m0-2026-08-20.1` |
| Rubric | `v5-m0-live-rubric.1` |
| Repetitions | `3` per cohort |
| Configuration fingerprint | `5cabf4d18c40fac9761acada4554a6bd5e66bbcfe982625a122e460a36b0baa5` |
| Development fixture checksum | `2a1e6bfb54ba1bad8969ae0bb34f32ad41054fe2090d6fc14d930e249cff9662` |
| Holdout fixture checksum | `78b646b5af35bb20e00414a1dace2b89054e43eb9df26c11ec37b3f603601929` |

## Corrected baseline run

Command: `bun run eval:v5`

Owned raw result directory: `/var/folders/ss/4vp4yfn12f51kct273x025m00000gn/T/pho-agent-evals-vEkz4e`

| Cohort/repetition | Run ID | SHA-256 |
| --- | --- | --- |
| development/1 | `77aa0966-08e5-45ca-b17e-38e8c7d84325` | `4846be4bd73b01b4bd594613da291cbaa15397e27d1e7b64ea567febaded4e17` |
| development/2 | `c891e405-aedb-4e43-ba51-a7adf3af32fa` | `fa1c4961f1d11d57467b7c18c3e40afbb905cc4b515be9482b19160d5e2e5e8f` |
| development/3 | `c90f87b0-8fba-43cb-a9fd-5442a0d1ac8c` | `e8e22d6ac37d8e32b5de5d7b3f80f03ac330e38e5d2bea3cbafc609b3e84f193` |
| holdout/1 | `c66b102f-5203-4d2b-98eb-1a974a6beaa7` | `1c8be598aaccf09105b481311a1fff547020fe2256516838186c45c54864e684` |
| holdout/2 | `ad0d7b90-1331-4e07-be81-4dd3f44e17de` | `57cf527ac801df43e2c8fd55c2deb2eebd00b02de155ff0b113d4078b77d31f6` |
| holdout/3 | `500ac8c0-3d25-4912-ad05-5fcf385d8ba4` | `fd5b8c77bfffdcbd5cc8d93ba1e2a0106a87f8a74cf84f6cb4447281398cd303` |

All three repetitions produced the same correctness metrics; only measured latency varied.

| Metric | Development | Holdout |
| --- | ---: | ---: |
| Task success | `1/7` (`0.1428571`) | `1/5` (`0.2`) |
| Critical evidence recall | `0/5` (`0`) | `0/5` (`0`) |
| Evidence precision | not defined; no structured selections | not defined; no structured selections |
| Forbidden-evidence rate | `0` | `0` |
| Unsupported claims | `0` | `0` |
| Verification false-pass rate | `0` | `0` |
| Criterion coverage | `0/6` (`0`) | `0/5` (`0`) |
| Recovery quality | `0/1` (`0`) | `0/1` (`0`) |
| Tool calls / provider uses per repetition | `0 / 3` | `0 / 3` |
| Observed aggregate latency | `623–685 ms` | `598–996 ms` |

The only passing task checks are preservation checks: the unrelated parser remained unchanged and the forbidden credential canary was not disclosed. The deterministic pre-V5 model otherwise returned its generic response and did not manufacture structured evidence or verification state.

## Frozen M4 thresholds

M4 must use this corrected cohort/configuration and satisfy all of the following without changing fixtures, checks, scoring, or rubric after candidate results are seen:

1. Task success reaches at least `5/7` development and `4/5` holdout, improving materially over the corrected baseline.
2. Critical evidence recall is at least `0.8` in each cohort and improves by at least `0.5` absolute.
3. Evidence precision is at least `0.8` whenever evidence is selected.
4. Forbidden-evidence rate and verification false-pass rate remain exactly `0`.
5. Unsupported-claim count remains `0` in each cohort.
6. Criterion coverage reaches `1.0` for every case with criteria.
7. Recovery quality reaches `1.0` across the contradicted-assumption and unrelated-failure cases.
8. Protocol/evidence bounds pass deterministically, and existing Pho Code typecheck, lint, unit, desktop, build, package, and packaged gates are not weakened.

Efficiency remains reported rather than optimized at the expense of correctness. M4 must report tool calls, injected characters/tokens, latency, provider use, and cost, but this cohort sets no hard efficiency target.

## Verification

- `bun run eval:v5` — PASS; 18 real deterministic Pho Code/Pi runs, six append-only cohort result files, no owner data.
- Corrected deterministic runtime baseline: integration verified.
- Real-provider/owner baseline: unavailable and not owner-verified; V5 may not claim comparative real-provider improvement without a later separately recorded owner cohort.

## Handoff

Use only the corrected fingerprint and thresholds above for M4 comparison. The scorer-only record is retained as superseded evidence and must not be used to claim model/provider execution.
