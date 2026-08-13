import {
  FEATURE_TRUST_NOTICE,
  type FeatureSnapshot,
  type FeatureStatus,
  type HarnessFeatureSummary,
  type ResourceDiagnostic,
} from "@pho-code/protocol";
import type { DefaultResourceLoader, ResourceLoader } from "@earendil-works/pi-coding-agent";
import { expectedFeatureResourceCounts, type HarnessFeature, type HarnessFeatureManifest } from "./features";

type LoadedExtension = ReturnType<ResourceLoader["getExtensions"]>["extensions"][number];

interface PathNamedResource {
  path?: string;
  resolvedPath?: string;
  name?: string;
}

export function projectFeatureSnapshot(
  manifest: HarnessFeatureManifest,
  loader: ResourceLoader | DefaultResourceLoader,
  extraDiagnostics: readonly ResourceDiagnostic[] = [],
): FeatureSnapshot {
  const extensionsResult = loader.getExtensions();
  const skillsResult = getNamedResources(loader, "getSkills", "skills");
  const promptsResult = getNamedResources(loader, "getPrompts", "prompts");
  const diagnostics: ResourceDiagnostic[] = [
    ...extensionsResult.errors.map((entry) => ({
      type: "error" as const,
      message: entry.error,
      ...(typeof entry.path === "string" ? { path: entry.path } : {}),
    })),
    ...skillsResult.diagnostics,
    ...promptsResult.diagnostics,
    ...extraDiagnostics,
  ];

  const features = manifest.features.map((feature) =>
    projectFeature(feature, extensionsResult.extensions, skillsResult.resources, promptsResult.resources, diagnostics),
  );

  return {
    features,
    diagnostics: dedupeDiagnostics(diagnostics),
    trustNotice: FEATURE_TRUST_NOTICE,
  };
}

export function emptyProjectedFeatures(): FeatureSnapshot {
  return {
    features: [],
    diagnostics: [],
    trustNotice: FEATURE_TRUST_NOTICE,
  };
}

function projectFeature(
  feature: HarnessFeature,
  extensions: readonly LoadedExtension[],
  skills: readonly PathNamedResource[],
  prompts: readonly PathNamedResource[],
  diagnostics: readonly ResourceDiagnostic[],
): HarnessFeatureSummary {
  const expected = expectedFeatureResourceCounts(feature);
  const related = diagnostics.filter((diagnostic) => diagnosticBelongsToFeature(feature, diagnostic));
  const matchedExtensions = extensions.filter((extension) => extensionBelongsToFeature(feature, extension)).length;
  const matchedSkills = skills.filter((skill) => resourceBelongsToFeature(feature, skill, feature.skillPaths)).length;
  const matchedPrompts = prompts.filter((prompt) => resourceBelongsToFeature(feature, prompt, feature.promptPaths)).length;
  const status = featureStatus(expected, {
    extensions: matchedExtensions,
    skills: matchedSkills,
    prompts: matchedPrompts,
  }, related);
  return {
    id: feature.id,
    version: feature.version,
    status,
    diagnostics: related,
  };
}

function featureStatus(
  expected: { extensions: number; skills: number; prompts: number },
  matched: { extensions: number; skills: number; prompts: number },
  diagnostics: readonly ResourceDiagnostic[],
): FeatureStatus {
  const expectedTotal = expected.extensions + expected.skills + expected.prompts;
  const matchedTotal = matched.extensions + matched.skills + matched.prompts;
  const hasError = diagnostics.some((diagnostic) => diagnostic.type === "error");
  const missing =
    matched.extensions < expected.extensions ||
    matched.skills < expected.skills ||
    matched.prompts < expected.prompts;

  if (expectedTotal === 0 || matchedTotal === 0) {
    return "failed";
  }
  if (missing || hasError || diagnostics.length > 0) {
    return "degraded";
  }
  return "loaded";
}

function extensionBelongsToFeature(feature: HarnessFeature, extension: LoadedExtension): boolean {
  const paths = [extension.path, extension.resolvedPath];
  if (feature.extensionPaths?.some((path) => paths.some((candidate) => pathsOverlap(path, candidate)))) {
    return true;
  }
  if (feature.extensionFactories?.some((factory) => "name" in factory && paths.some((candidate) => candidate.includes(factory.name)))) {
    return true;
  }
  return paths.some((candidate) => candidate.includes(feature.id));
}

function resourceBelongsToFeature(
  feature: HarnessFeature,
  resource: PathNamedResource,
  declaredPaths: readonly string[] | undefined,
): boolean {
  const paths = [resource.path, resource.resolvedPath].filter((value): value is string => Boolean(value));
  if (declaredPaths?.some((path) => paths.some((candidate) => pathsOverlap(path, candidate)))) {
    return true;
  }
  if (resource.name && resource.name.includes(feature.id)) {
    return true;
  }
  return paths.some((candidate) => candidate.includes(feature.id));
}

function diagnosticBelongsToFeature(feature: HarnessFeature, diagnostic: ResourceDiagnostic): boolean {
  const diagnosticPath = diagnostic.path ?? "";
  if (feature.extensionPaths?.some((path) => pathsOverlap(path, diagnosticPath))) {
    return true;
  }
  if (feature.skillPaths?.some((path) => pathsOverlap(path, diagnosticPath))) {
    return true;
  }
  if (feature.promptPaths?.some((path) => pathsOverlap(path, diagnosticPath))) {
    return true;
  }
  return diagnosticPath.includes(feature.id) || diagnostic.message.includes(feature.id);
}

function getNamedResources(
  loader: ResourceLoader | DefaultResourceLoader,
  method: "getSkills" | "getPrompts",
  collection: "skills" | "prompts",
): { resources: PathNamedResource[]; diagnostics: ResourceDiagnostic[] } {
  const candidate = loader as unknown as Record<string, unknown>;
  const fn = candidate[method];
  if (typeof fn !== "function") {
    return { resources: [], diagnostics: [] };
  }
  const result = (fn as () => unknown).call(loader);
  if (result === null || typeof result !== "object") {
    return { resources: [], diagnostics: [] };
  }
  const record = result as Record<string, unknown>;
  const resources = Array.isArray(record[collection]) ? (record[collection] as PathNamedResource[]) : [];
  const diagnostics = Array.isArray(record.diagnostics)
    ? (record.diagnostics as Array<{ message?: string; error?: string; path?: string; type?: string }>).map((entry) => ({
        type: "error" as const,
        message: entry.message ?? entry.error ?? "Resource diagnostic",
        ...(entry.path ? { path: entry.path } : {}),
      }))
    : [];
  return { resources, diagnostics };
}

function pathsOverlap(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function dedupeDiagnostics(diagnostics: ResourceDiagnostic[]): ResourceDiagnostic[] {
  const seen = new Set<string>();
  const unique: ResourceDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.type}:${diagnostic.path ?? ""}:${diagnostic.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(diagnostic);
  }
  return unique;
}
