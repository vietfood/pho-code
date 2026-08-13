import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const PACKAGED_FEATURES_DIR = "features";

export interface ResourceLocator {
  resolvePackageRoot(packageName: string): string;
}

interface PackageManifest {
  name?: string;
  pi?: {
    extensions?: readonly string[];
  };
}

export function createNodeModuleResourceLocator(fromHref = import.meta.url): ResourceLocator {
  const require = createRequire(fromHref);
  return {
    resolvePackageRoot(packageName) {
      let entry: string;
      try {
        entry = require.resolve(`${packageName}/package.json`);
        return path.dirname(entry);
      } catch {
        entry = require.resolve(packageName);
      }

      let directory = path.dirname(entry);
      while (directory !== path.dirname(directory)) {
        const manifestPath = path.join(directory, "package.json");
        if (existsSync(manifestPath)) {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
          if (manifest.name === packageName) {
            return directory;
          }
        }
        directory = path.dirname(directory);
      }

      throw new Error(`Could not resolve package root for ${packageName}.`);
    },
  };
}

export function createPackagedResourceLocator(resourcesRoot: string): ResourceLocator {
  const root = path.resolve(resourcesRoot);
  return {
    resolvePackageRoot(packageName) {
      const candidate = path.join(root, PACKAGED_FEATURES_DIR, ...packageName.split("/"));
      const manifestPath = path.join(candidate, "package.json");
      if (!existsSync(manifestPath)) {
        throw packagedFeatureMissingError(packageName, candidate);
      }
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
      if (manifest.name !== packageName) {
        throw packagedFeatureMissingError(packageName, candidate);
      }
      return candidate;
    },
  };
}

export function packagedFeatureMissingError(packageName: string, candidate: string): Error {
  return new Error(
    `Packaged feature ${packageName} is missing from ${candidate}. The application will not load it from global Pi packages.`,
  );
}

export function readPiExtensionPaths(packageRoot: string): string[] {
  const manifestPath = path.join(packageRoot, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
  const extensions = manifest.pi?.extensions;
  if (!Array.isArray(extensions) || extensions.length === 0) {
    throw new Error(`Package at ${packageRoot} does not declare pi.extensions.`);
  }
  return extensions.map((relative) => path.resolve(packageRoot, relative));
}
