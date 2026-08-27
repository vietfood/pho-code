# Add external reasoning, Fast mode, and live tool updates

Status: implemented; focused unit and Electron seams verified; real external session recheck pending

Surface: composer toolbar and live work log

Owner: [`../../version/v5/implementation-plan.md`](../../version/v5/implementation-plan.md), B4

Related V5 record: [`../../version/v5/logs/2026-08-27-external-reasoning-fast-and-tool-stream.md`](../../version/v5/logs/2026-08-27-external-reasoning-fast-and-tool-stream.md)

## Owner feedback

External sessions should expose backend-supported thinking levels and Fast mode in the composer. Tool output should advance smoothly instead of depending on whole-session snapshots.

## Change

The existing thinking selector now consumes a backend-advertised reasoning ladder for Codex and ACP sessions. A compact lightning Fast toggle appears beside it only when the selected backend/model advertises Fast; the toggle is separate because service speed and reasoning depth are independent settings. Both controls are disabled during a live run, matching model selection.

Backend-native tool starts, output deltas, updates, and completion now enter the same keyed live-run tool event path already used by Pi. The settled transcript still comes from the backend's authoritative completed snapshot.

## Verification

- UI/backend projection focused tests are included in the 52 passing Pho Code tests for this slice.
- Root typecheck passed.
- Focused Electron composer/backend and typed-bridge smoke checks passed one test each. The initial smoke attempt found only an expected bridge-key ordering error; correcting the test expectation produced the pass.
- Real external provider journeys remain pending.
