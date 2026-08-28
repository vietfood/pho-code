import { failCommand, HARNESS_ERROR_CODES } from "@pho-code/protocol";

export interface CatalogModelRef {
  provider: string;
  id: string;
}

export function catalogHasModel(
  models: readonly CatalogModelRef[],
  model: CatalogModelRef | undefined,
): boolean {
  if (!model) {
    return false;
  }
  return models.some((entry) => entry.provider === model.provider && entry.id === model.id);
}

export function advertisedCatalogModel<T extends CatalogModelRef, S extends CatalogModelRef>(
  sessionModel: S | undefined,
  models: readonly T[],
  projectSession: (model: S) => T,
): T | undefined {
  if (sessionModel && catalogHasModel(models, sessionModel)) {
    return projectSession(sessionModel);
  }
  return models[0];
}

/**
 * Refuse a turn the catalog cannot serve: a session bound to a model that is no
 * longer advertised, or an empty catalog with nothing to fall back to. The
 * catalog's own error wins when it has one, because it explains *why* the
 * catalog is empty; the generic message only covers "nothing is signed in".
 */
export function assertModelAdmissible(input: {
  models: readonly CatalogModelRef[];
  boundModel: CatalogModelRef | undefined;
  modelError: string | undefined;
  operation: string;
}): void {
  const unusableBinding = Boolean(input.boundModel) && !catalogHasModel(input.models, input.boundModel);
  const emptyCatalog = !input.boundModel && input.models.length === 0;
  if (unusableBinding || emptyCatalog) {
    failCommand(
      input.operation,
      input.modelError ?? "Sign in to a provider account in Settings before using this model.",
      HARNESS_ERROR_CODES.noAuthenticatedModel,
    );
  }
}
