import { readFileSync } from "node:fs";
import path from "node:path";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import type { ResourceDiagnostic } from "@pho-code/protocol";
import { createNodeModuleResourceLocator, readPiExtensionPaths, type ResourceLocator } from "./resource-locator";

export const PERMISSION_FEATURE_ID = "permission-system";
export const PERMISSION_FEATURE_VERSION = "24.0.0";
export const PERMISSION_PACKAGE_NAME = "@gotgenes/pi-permission-system";

export interface HarnessFeature {
  id: string;
  version: string;
  extensionFactories?: readonly InlineExtension[];
  extensionPaths?: readonly string[];
  skillPaths?: readonly string[];
  promptPaths?: readonly string[];
  expected?: {
    extensions?: number;
    skills?: number;
    prompts?: number;
  };
}

export interface HarnessFeatureManifest {
  features: readonly HarnessFeature[];
}

export interface FlattenedFeatureLoaderOptions {
  additionalExtensionPaths: string[];
  additionalSkillPaths: string[];
  additionalPromptTemplatePaths: string[];
  extensionFactories: InlineExtension[];
}

export function resolvePermissionFeature(locator: ResourceLocator): {
  feature: HarnessFeature;
  diagnostics: ResourceDiagnostic[];
} {
  try {
    const packageRoot = locator.resolvePackageRoot(PERMISSION_PACKAGE_NAME);
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
      version?: string;
    };
    if (manifest.version !== PERMISSION_FEATURE_VERSION) {
      throw new Error(
        `Packaged feature ${PERMISSION_PACKAGE_NAME} is version ${manifest.version ?? "unknown"}; expected ${PERMISSION_FEATURE_VERSION}.`,
      );
    }
    const extensionPaths = readPiExtensionPaths(packageRoot);
    return {
      feature: {
        id: PERMISSION_FEATURE_ID,
        version: PERMISSION_FEATURE_VERSION,
        extensionPaths,
        expected: { extensions: extensionPaths.length },
      },
      diagnostics: [],
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Packaged feature ${PERMISSION_PACKAGE_NAME} is missing. The application will not load it from global Pi packages.`;
    return {
      feature: {
        id: PERMISSION_FEATURE_ID,
        version: PERMISSION_FEATURE_VERSION,
        extensionPaths: [],
        expected: { extensions: 1 },
      },
      diagnostics: [
        {
          type: "error",
          message,
          path: PERMISSION_PACKAGE_NAME,
        },
      ],
    };
  }
}

export function createDefaultFeatureManifest(
  locator: ResourceLocator = createNodeModuleResourceLocator(),
): HarnessFeatureManifest {
  return {
    features: [resolvePermissionFeature(locator).feature],
  };
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
  const additionalExtensionPaths: string[] = [];
  const additionalSkillPaths: string[] = [];
  const additionalPromptTemplatePaths: string[] = [];
  const extensionFactories: InlineExtension[] = [];

  for (const feature of manifest.features) {
    if (feature.extensionPaths) {
      additionalExtensionPaths.push(...feature.extensionPaths);
    }
    if (feature.skillPaths) {
      additionalSkillPaths.push(...feature.skillPaths);
    }
    if (feature.promptPaths) {
      additionalPromptTemplatePaths.push(...feature.promptPaths);
    }
    if (feature.extensionFactories) {
      extensionFactories.push(...feature.extensionFactories);
    }
  }

  return {
    additionalExtensionPaths,
    additionalSkillPaths,
    additionalPromptTemplatePaths,
    extensionFactories,
  };
}

export function emptyFeatureManifest(): HarnessFeatureManifest {
  return { features: [] };
}
