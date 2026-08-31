import { STARTER_PROMPTS } from "./lib/starter-prompts";

// Round starter-task pills under the empty-session hero composer. Warp's agent
// home is the visual reference (owner screenshot); harness-owned chrome on
// existing design tokens, no copied code.
export function StarterChips({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="starter-chips" data-testid="starter-chips" role="group" aria-label="Starter tasks">
      {STARTER_PROMPTS.map((starter) => (
        <button
          key={starter.id}
          type="button"
          className="starter-chip"
          data-testid={`starter-chip-${starter.id}`}
          onClick={() => onSelect(starter.label)}
        >
          <starter.icon className="size-3 shrink-0" aria-hidden="true" />
          {starter.label}
        </button>
      ))}
    </div>
  );
}
