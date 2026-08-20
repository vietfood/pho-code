import { readFileSync } from "node:fs";
import path from "node:path";
import { flattenAgentFeatures, type AgentFeature } from "@pho-agent/runtime";
import type { InlineExtension } from "@pho-agent/runtime/feature-api";
import type { ResourceDiagnostic } from "@pho-code/protocol";
import { createNodeModuleResourceLocator, readPiExtensionPaths, type ResourceLocator } from "./resource-locator";
import { createTrashFeature, type TrashFeatureOptions } from "./trash-feature";
import { createRetrievalFeature } from "./retrieval-feature";
import type { LocalRetrievalRuntime } from "./local-retrieval";
import { createWebFeature } from "./web-feature";
import type { WebResearchRuntime } from "./web-client";
import { createCuratedSkillsFeature, resolveCuratedSkillsRoot } from "./skills-feature";
import { createPlanAgentFeature } from "./plan-agent-feature";

export const PERMISSION_FEATURE_ID = "permission-system";
export const PERMISSION_FEATURE_VERSION = "24.0.0";
export const PERMISSION_PACKAGE_NAME = "@gotgenes/pi-permission-system";

export const CURSOR_SDK_FEATURE_ID = "cursor-sdk";
export const CURSOR_SDK_FEATURE_VERSION = "0.2.0";
export const CURSOR_SDK_PACKAGE_NAME = "pi-cursor-sdk";

export type HarnessFeature = AgentFeature;

export interface HarnessFeatureManifest {
  features: readonly HarnessFeature[];
}

export interface FlattenedFeatureLoaderOptions {
  additionalExtensionPaths: string[];
  additionalSkillPaths: string[];
  additionalPromptTemplatePaths: string[];
  extensionFactories: InlineExtension[];
}

function resolvePinnedPackageFeature(input: {
  locator: ResourceLocator;
  featureId: string;
  featureVersion: string;
  packageName: string;
}): {
  feature: HarnessFeature;
  diagnostics: ResourceDiagnostic[];
} {
  try {
    const packageRoot = input.locator.resolvePackageRoot(input.packageName);
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
      version?: string;
    };
    if (manifest.version !== input.featureVersion) {
      throw new Error(
        `Packaged feature ${input.packageName} is version ${manifest.version ?? "unknown"}; expected ${input.featureVersion}.`,
      );
    }
    const extensionPaths = readPiExtensionPaths(packageRoot);
    return {
      feature: {
        id: input.featureId,
        version: input.featureVersion,
        extensionPaths,
        expected: { extensions: extensionPaths.length },
      },
      diagnostics: [],
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Packaged feature ${input.packageName} is missing. The application will not load it from global Pi packages.`;
    return {
      feature: {
        id: input.featureId,
        version: input.featureVersion,
        extensionPaths: [],
        expected: { extensions: 1 },
      },
      diagnostics: [
        {
          type: "error",
          message,
          path: input.packageName,
        },
      ],
    };
  }
}

export function resolvePermissionFeature(locator: ResourceLocator): {
  feature: HarnessFeature;
  diagnostics: ResourceDiagnostic[];
} {
  return resolvePinnedPackageFeature({
    locator,
    featureId: PERMISSION_FEATURE_ID,
    featureVersion: PERMISSION_FEATURE_VERSION,
    packageName: PERMISSION_PACKAGE_NAME,
  });
}

export function resolveCursorSdkFeature(locator: ResourceLocator): {
  feature: HarnessFeature;
  diagnostics: ResourceDiagnostic[];
} {
  return resolvePinnedPackageFeature({
    locator,
    featureId: CURSOR_SDK_FEATURE_ID,
    featureVersion: CURSOR_SDK_FEATURE_VERSION,
    packageName: CURSOR_SDK_PACKAGE_NAME,
  });
}

export function createDefaultFeatureManifest(
  locator: ResourceLocator = createNodeModuleResourceLocator(),
  options: TrashFeatureOptions & {
    retrieval?: LocalRetrievalRuntime;
    web?: WebResearchRuntime;
  } = {},
): HarnessFeatureManifest {
  const features: HarnessFeature[] = [
    resolvePermissionFeature(locator).feature,
    resolveCursorSdkFeature(locator).feature,
    createTrashFeature(options),
    createWebFeature(options.web),
    createPlanAgentFeature(),
    createCuratedSkillsFeature(resolveCuratedSkillsRoot(options.resourcesRoot)),
  ];
  if (options.retrieval) {
    features.push(createRetrievalFeature(options.retrieval));
  }
  return { features };
}

export function expectedFeatureResourceCounts(feature: HarnessFeature): {
  extensions: number;
  skills: number;
  prompts: number;
} {
  return {
    extensions:
      feature.expected?.extensions ?? (feature.extensionPaths?.length ?? 0) + (feature.extensionFactories?.length ?? 0),
    skills: feature.expected?.skills ?? (feature.skillPaths?.length ?? 0),
    prompts: feature.expected?.prompts ?? (feature.promptPaths?.length ?? 0),
  };
}

export function flattenFeatureManifest(manifest: HarnessFeatureManifest): FlattenedFeatureLoaderOptions {
  return flattenAgentFeatures(manifest.features);
}

export function emptyFeatureManifest(): HarnessFeatureManifest {
  return { features: [] };
}
