import type { ModelSummary } from "@pho-code/protocol";

export interface ModelProviderGroup {
  provider: string;
  models: readonly ModelSummary[];
}

/** Case-insensitive match on name, id, or provider. Empty/whitespace query returns all models. */
export function filterModels(
  models: readonly ModelSummary[],
  query: string,
): readonly ModelSummary[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) {
    return models;
  }
  return models.filter((model) => {
    const name = model.name.toLowerCase();
    const id = model.id.toLowerCase();
    const provider = model.provider.toLowerCase();
    return name.includes(trimmed) || id.includes(trimmed) || provider.includes(trimmed);
  });
}

/** Group by provider, preserving first-seen provider order and within-group input order. */
export function groupModelsByProvider(
  models: readonly ModelSummary[],
): readonly ModelProviderGroup[] {
  const groups = new Map<string, ModelSummary[]>();
  for (const model of models) {
    const existing = groups.get(model.provider);
    if (existing) {
      existing.push(model);
    } else {
      groups.set(model.provider, [model]);
    }
  }
  return Array.from(groups.entries()).map(([provider, items]) => ({
    provider,
    models: items,
  }));
}
