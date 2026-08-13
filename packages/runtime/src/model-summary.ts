import type { ModelSummary } from "@pho-code/protocol";

/** Minimal Pi model fields needed for JSON-safe UI projection. */
export interface ProjectableModel {
  provider: string;
  id: string;
  name?: string;
  contextWindow: number;
  input?: readonly string[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export function modelSupportsImages(model: { input?: readonly string[] } | undefined): boolean {
  return Array.isArray(model?.input) && model.input.includes("image");
}

export function projectModelSummary(model: ProjectableModel): ModelSummary {
  return {
    provider: model.provider,
    id: model.id,
    name: model.name ?? model.id,
    contextWindow: model.contextWindow,
    cost: {
      input: model.cost.input,
      output: model.cost.output,
      cacheRead: model.cost.cacheRead,
      cacheWrite: model.cost.cacheWrite,
    },
    ...(modelSupportsImages(model) ? { supportsImages: true } : {}),
  };
}
