# Cite Pi official sandbox example

Status: accepted  
Owner: features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`2026-08-16-promotion.md`](./2026-08-16-promotion.md)

## Intent

Record the owner request to treat the Pi team’s sandbox extension as a first-class reference, not only a passing mention of the pinned SDK copy.

## Contracts and files

- Product: [`../product.md`](../product.md) (harness table, wrap take/leave, references)
- Plan: [`../implementation-plan.md`](../implementation-plan.md) (`Pi wrap pattern`)
- Research: [`../research.md`](../research.md)
- Attribution inventory: [`../../../references-and-attribution.md`](../../../references-and-attribution.md)

## Changes and decisions

- Public reference: [earendil-works/pi sandbox example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/sandbox/index.ts)
- API source of truth remains pinned Pi `0.84.1`. Compared 2026-08-16: `main` and the pin use the same `createBashTool` + `user_bash` + `SandboxManager` shape.
- Take the wrap. Reject `sandbox.json`, TUI `/sandbox`, default-on, and always-on registry allowlist.
- Optional Settings package-registry defaults may start from that example’s npm/PyPI/GitHub host list.
- Reading the example is not a copy. A copy row is required only if code is later adapted.

## Verification

Not verified: no implementation. URL and pinned file were read; they match in wrap shape.

## Mistakes and corrections

None.

## Owner feedback

Owner asked to include this Pi-team example as a reference alongside Anthropic sandbox-runtime and pi-sandbox.

## UI impact

None.

## Blockers and handoff

Milestone 0 must verify `createBashTool` / `BashOperations` against installed `0.84.1` typings, not against a newer `main` if they diverge.
