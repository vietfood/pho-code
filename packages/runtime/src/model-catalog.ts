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
