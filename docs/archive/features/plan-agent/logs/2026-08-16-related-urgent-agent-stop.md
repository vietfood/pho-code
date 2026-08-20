# Related: urgent agent-stop cancels ask-user on Stop

Status: ready for review  
Owner: features/plan-agent  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`agent-stop research`](../../../urgent/agent-stop/logs/2026-08-16-research-handoff.md), [`agent-stop closure`](../../../urgent/agent-stop/logs/2026-08-20-m2-acceptance-and-closure.md)

## Intent

Cross-link bounded Stop so agents do not treat a stuck `ask_user_question` card as a Plan/Agent chrome bug.

## Contracts and files

- Plan/Agent product: [`../product.md`](../product.md) — cancelled questionnaires abort that tool call only
- Agent-stop product: [`agent-stop`](../../../urgent/agent-stop/product.md) — Stop must `cancelPending()` including `kind: "questionnaire"`

## Changes and decisions

No Plan/Agent contract change. When agent-stop Milestone 1 lands, Stop on a live ask-user card is that track’s acceptance, not a new Plan/Agent milestone. Plan/Agent still owns the card chrome.

## Verification

Not verified: documentation-only reciprocal link.

## Mistakes and corrections

Do not implement a second abort path inside the ask-user factory. Use the existing host-dialog `cancelPending` / abort signal.

## Owner feedback

Owner cannot stop a stuck agent during testing; that includes runs waiting on ask-user.

## UI impact

None until agent-stop Milestone 1.

## Blockers and handoff

Plan/Agent Milestones 0–2 remain in source, not accepted. Agent-stop remains proposed.
