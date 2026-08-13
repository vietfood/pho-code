import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERMISSION_PACKAGE_NAME, PERMISSION_FEATURE_VERSION } from "../packages/runtime/src/features.ts";
import { PACKAGED_FEATURES_DIR } from "../packages/runtime/src/resource-locator.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, "..");
export const DESKTOP_DIR = path.join(WORKSPACE_ROOT, "apps", "desktop");
export const DESKTOP_RESOURCES_DIR = path.join(DESKTOP_DIR, "resources");

const PERMISSION_KEEP = new Set([
  "package.json",
  "src",
  "dist",
  "config",
  "schemas",
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
]);

const PERMISSION_RUNTIME_DEPS = ["zod", "web-tree-sitter", "tree-sitter-bash"] as const;

export function resolveWorkspacePackageRoot(packageName: string, fromPackageJson = path.join(DESKTOP_DIR, "package.json")): string {
  const require = createRequire(fromPackageJson);
  return path.dirname(require.resolve(`${packageName}/package.json`));
}

export function copyPackageTree(source: string, destination: string): void {
  mkdirSync(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    rmSync(destination, { recursive: true, force: true });
  }
  cpSync(source, destination, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const relative = path.relative(source, src);
      if (!relative) {
        return true;
      }
      return !relative.split(path.sep).includes("node_modules");
    },
  });
}

export function copyResolvedPackage(packageName: string, destination: string, fromPackageJson?: string): void {
  copyPackageTree(resolveWorkspacePackageRoot(packageName, fromPackageJson), destination);
}

export function stagedPermissionPackageRoot(resourcesRoot: string): string {
  return path.join(resourcesRoot, PACKAGED_FEATURES_DIR, ...PERMISSION_PACKAGE_NAME.split("/"));
}

export function stageBakedFeatureResources(resourcesRoot = DESKTOP_RESOURCES_DIR): string {
  const packageRoot = stagedPermissionPackageRoot(resourcesRoot);
  mkdirSync(path.dirname(packageRoot), { recursive: true });
  if (existsSync(path.join(resourcesRoot, PACKAGED_FEATURES_DIR))) {
    rmSync(path.join(resourcesRoot, PACKAGED_FEATURES_DIR), { recursive: true, force: true });
  }

  const source = resolveWorkspacePackageRoot(PERMISSION_PACKAGE_NAME);
  mkdirSync(packageRoot, { recursive: true });
  cpSync(source, packageRoot, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const relative = path.relative(source, src);
      if (!relative) {
        return true;
      }
      const [top] = relative.split(path.sep);
      return PERMISSION_KEEP.has(top ?? "");
    },
  });

  const nestedModules = path.join(packageRoot, "node_modules");
  const permissionManifest = path.join(source, "package.json");
  for (const dependency of PERMISSION_RUNTIME_DEPS) {
    copyResolvedPackage(dependency, path.join(nestedModules, dependency), permissionManifest);
  }

  const manifestPath = path.join(packageRoot, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: string; version?: string };
  if (manifest.name !== PERMISSION_PACKAGE_NAME || manifest.version !== PERMISSION_FEATURE_VERSION) {
    throw new Error(
      `Staged ${PERMISSION_PACKAGE_NAME} is ${manifest.name}@${manifest.version}, expected ${PERMISSION_FEATURE_VERSION}.`,
    );
  }
  return packageRoot;
}

interface NoticePackage {
  name: string;
  version: string;
  license: string;
  author?: string;
  licenseText?: string;
}

function readNoticePackage(packageName: string, fromPackageJson?: string): NoticePackage {
  const root = resolveWorkspacePackageRoot(packageName, fromPackageJson);
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    name?: string;
    version?: string;
    license?: string;
    author?: string | { name?: string };
  };
  const licenseFile = ["LICENSE", "LICENSE.md", "LICENSE.txt"].map((name) => path.join(root, name)).find(existsSync);
  const author =
    typeof manifest.author === "string" ? manifest.author : manifest.author?.name;
  return {
    name: manifest.name ?? packageName,
    version: manifest.version ?? "unknown",
    license: manifest.license ?? "UNKNOWN",
    ...(author ? { author } : {}),
    ...(licenseFile ? { licenseText: readFileSync(licenseFile, "utf8").trim() } : {}),
  };
}

export function generateThirdPartyNotices(): string {
  const permissionManifest = path.join(resolveWorkspacePackageRoot(PERMISSION_PACKAGE_NAME), "package.json");
  const packages = [
    readNoticePackage("@earendil-works/pi-coding-agent"),
    readNoticePackage("@earendil-works/pi-ai"),
    readNoticePackage(PERMISSION_PACKAGE_NAME),
    ...PERMISSION_RUNTIME_DEPS.map((name) => readNoticePackage(name, permissionManifest)),
  ];
  const sections = [
    "# Third-party notices",
    "",
    "Pho Code ships the following pinned runtime and baked-feature packages. This is not a complete recursive license inventory of every transitive dependency.",
    "",
  ];
  for (const entry of packages) {
    sections.push(`## ${entry.name} ${entry.version}`);
    sections.push("");
    sections.push(`License: ${entry.license}${entry.author ? ` · ${entry.author}` : ""}`);
    sections.push("");
    if (entry.licenseText) {
      sections.push(entry.licenseText);
      sections.push("");
    }
  }
  return `${sections.join("\n").trim()}\n`;
}

export function writeThirdPartyNotices(resourcesRoot = DESKTOP_RESOURCES_DIR): { artifact: string; docs: string } {
  const text = generateThirdPartyNotices();
  mkdirSync(resourcesRoot, { recursive: true });
  const artifact = path.join(resourcesRoot, "THIRD_PARTY_NOTICES.txt");
  const docs = path.join(WORKSPACE_ROOT, "docs", "third-party-notices.md");
  writeFileSync(artifact, text);
  writeFileSync(docs, text);
  return { artifact, docs };
}
