import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CURSOR_SDK_FEATURE_VERSION,
  CURSOR_SDK_PACKAGE_NAME,
  PERMISSION_PACKAGE_NAME,
  PERMISSION_FEATURE_VERSION,
} from "../packages/runtime/src/features.ts";
import { PACKAGED_FEATURES_DIR } from "../packages/runtime/src/resource-locator.ts";
import { CURATED_SKILL_NAMES, curatedSkillsRoot } from "../packages/runtime/src/skills-feature.ts";
import {
  GITHUB_MCP_SERVER_EXECUTABLE,
  GITHUB_MCP_SERVER_VERSION,
  githubMcpPackagedRelativePath,
  githubMcpPlatformId,
  githubMcpReleaseAsset,
  githubMcpReleaseUrl,
} from "../packages/runtime/src/github-mcp-artifact.ts";

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

const CURSOR_SDK_KEEP = new Set([
  "package.json",
  "src",
  "shared",
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
  "node_modules",
]);

function cursorSdkPlatformPackageName(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | undefined {
  if (platform === "darwin" && arch === "arm64") {
    return "@cursor/sdk-darwin-arm64";
  }
  if (platform === "darwin" && arch === "x64") {
    return "@cursor/sdk-darwin-x64";
  }
  if (platform === "linux" && arch === "arm64") {
    return "@cursor/sdk-linux-arm64";
  }
  if (platform === "linux" && arch === "x64") {
    return "@cursor/sdk-linux-x64";
  }
  return undefined;
}

export function resolveWorkspacePackageRoot(packageName: string, fromPackageJson = path.join(DESKTOP_DIR, "package.json")): string {
  const require = createRequire(fromPackageJson);
  return path.dirname(require.resolve(`${packageName}/package.json`));
}

export function copyPackageTree(source: string, destination: string): void {
  mkdirSync(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    throw new Error(`Refusing to overwrite ${destination}. Stage into a fresh tree.`);
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

export function stagedCuratedSkillsRoot(resourcesRoot: string): string {
  return path.join(resourcesRoot, PACKAGED_FEATURES_DIR, "@pho-code", "curated-coding-skills", "skills");
}

export function moveGeneratedTreeToTrash(absolutePath: string): void {
  if (!existsSync(absolutePath)) {
    return;
  }
  if (process.platform === "darwin") {
    const result = spawnSync("/usr/bin/trash", [absolutePath], { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(
        `Failed to move ${absolutePath} to Trash (${result.stderr?.trim() || result.status}). Retained the tree.`,
      );
    }
    return;
  }
  if (process.platform === "linux") {
    const attempts: Array<{ command: string; args: string[] }> = [
      { command: "trash-put", args: [absolutePath] },
      { command: "gio", args: ["trash", absolutePath] },
    ];
    for (const attempt of attempts) {
      const result = spawnSync(attempt.command, attempt.args, { encoding: "utf8" });
      if (result.status === 0) {
        return;
      }
    }
    throw new Error(`Failed to move ${absolutePath} to Trash. Retained the tree.`);
  }
  throw new Error(`No Trash facility is available on ${process.platform}. Retained ${absolutePath}.`);
}

function replaceGeneratedTree(prepared: string, destination: string): void {
  if (existsSync(destination)) {
    moveGeneratedTreeToTrash(destination);
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  try {
    renameSync(prepared, destination);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as NodeJS.ErrnoException).code) : "";
    if (code !== "EXDEV") {
      throw error;
    }
    cpSync(prepared, destination, { recursive: true });
  }
}

function stagePermissionPackage(featuresRoot: string): string {
  const packageRoot = path.join(featuresRoot, ...PERMISSION_PACKAGE_NAME.split("/"));
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

function stageCuratedSkills(featuresRoot: string): string {
  const destination = path.join(featuresRoot, "@pho-code", "curated-coding-skills", "skills");
  const source = curatedSkillsRoot();
  for (const name of CURATED_SKILL_NAMES) {
    const skillSource = path.join(source, name, "SKILL.md");
    if (!existsSync(skillSource)) {
      throw new Error(`Missing Pho Code skill ${name} at ${skillSource}.`);
    }
    const destDir = path.join(destination, name);
    mkdirSync(destDir, { recursive: true });
    cpSync(skillSource, path.join(destDir, "SKILL.md"));
  }
  return destination;
}

function ensureNestedPackage(packageName: string, nestedModules: string, fromPackageJson: string): void {
  const destination = path.join(nestedModules, ...packageName.split("/"));
  if (existsSync(path.join(destination, "package.json"))) {
    return;
  }
  copyResolvedPackage(packageName, destination, fromPackageJson);
}

function stageCursorSdkPackage(featuresRoot: string): string {
  const packageRoot = path.join(featuresRoot, CURSOR_SDK_PACKAGE_NAME);
  const source = resolveWorkspacePackageRoot(CURSOR_SDK_PACKAGE_NAME);
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
      return CURSOR_SDK_KEEP.has(top ?? "");
    },
  });

  const nestedModules = path.join(packageRoot, "node_modules");
  mkdirSync(nestedModules, { recursive: true });
  const cursorManifest = path.join(source, "package.json");
  const sdkSource = resolveWorkspacePackageRoot("@cursor/sdk", cursorManifest);
  const sdkSourceManifest = path.join(sdkSource, "package.json");
  ensureNestedPackage("@cursor/sdk", nestedModules, cursorManifest);

  const sdkManifest = JSON.parse(readFileSync(sdkSourceManifest, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  for (const dependency of Object.keys(sdkManifest.dependencies ?? {})) {
    ensureNestedPackage(dependency, nestedModules, sdkSourceManifest);
  }
  const platformPackage = cursorSdkPlatformPackageName();
  if (platformPackage) {
    ensureNestedPackage(platformPackage, nestedModules, sdkSourceManifest);
  }

  const manifestPath = path.join(packageRoot, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: string; version?: string };
  if (manifest.name !== CURSOR_SDK_PACKAGE_NAME || manifest.version !== CURSOR_SDK_FEATURE_VERSION) {
    throw new Error(
      `Staged ${CURSOR_SDK_PACKAGE_NAME} is ${manifest.name}@${manifest.version}, expected ${CURSOR_SDK_FEATURE_VERSION}.`,
    );
  }
  return packageRoot;
}

export function stagedCursorSdkPackageRoot(resourcesRoot: string): string {
  return path.join(resourcesRoot, PACKAGED_FEATURES_DIR, CURSOR_SDK_PACKAGE_NAME);
}

export function stagedGitHubMcpServerPath(resourcesRoot: string): string | undefined {
  const relative = githubMcpPackagedRelativePath();
  return relative ? path.join(resourcesRoot, PACKAGED_FEATURES_DIR, relative) : undefined;
}

export function githubMcpCacheDir(): string {
  return path.join(WORKSPACE_ROOT, "packages", "runtime", "features", "github", "github-mcp-server", "cache");
}

export function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function stageGitHubMcpServer(
  featuresRoot: string,
  options: { required?: boolean; fetchIfMissing?: boolean; cacheDir?: string; archivePath?: string } = {},
): string | undefined {
  const asset = githubMcpReleaseAsset();
  const relative = githubMcpPackagedRelativePath();
  const platform = githubMcpPlatformId();
  if (!asset || !relative || !platform) {
    if (options.required) {
      throw new Error(`No pinned GitHub MCP server asset for ${process.platform}/${process.arch}.`);
    }
    return undefined;
  }
  const cacheDir = options.cacheDir ?? githubMcpCacheDir();
  mkdirSync(cacheDir, { recursive: true });
  const archivePath = options.archivePath ?? path.join(cacheDir, asset.asset);
  if (!existsSync(archivePath) && options.fetchIfMissing) {
    const downloaded = spawnSync("curl", ["-fsSL", "-o", archivePath, githubMcpReleaseUrl(asset.asset)], {
      encoding: "utf8",
    });
    if (downloaded.status !== 0) {
      throw new Error(`Failed to fetch GitHub MCP archive (${downloaded.stderr?.trim() || downloaded.status}).`);
    }
  }
  if (!existsSync(archivePath)) {
    if (!options.required) {
      return undefined;
    }
    throw new Error(
      `Missing GitHub MCP archive ${archivePath}. Fetch ${githubMcpReleaseUrl(asset.asset)} into the cache during a reviewed build action.`,
    );
  }
  const digest = sha256File(archivePath);
  if (digest !== asset.sha256) {
    throw new Error(`GitHub MCP archive SHA-256 mismatch for ${asset.asset}. Expected ${asset.sha256}, got ${digest}.`);
  }
  const scratch = mkdtempSync(path.join(tmpdir(), "pho-code-github-mcp-"));
  const extract = spawnSync("tar", ["-xzf", archivePath, "-C", scratch], { encoding: "utf8" });
  if (extract.status !== 0) {
    throw new Error(`Failed to extract GitHub MCP archive (${extract.stderr?.trim() || extract.status}).`);
  }
  const binary = path.join(scratch, GITHUB_MCP_SERVER_EXECUTABLE);
  if (!existsSync(binary)) {
    throw new Error(`GitHub MCP archive did not contain ${GITHUB_MCP_SERVER_EXECUTABLE}.`);
  }
  const destination = path.join(featuresRoot, relative);
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(binary, destination);
  chmodSync(destination, 0o755);
  writeFileSync(
    path.join(path.dirname(destination), "PIN.json"),
    `${JSON.stringify(
      {
        version: GITHUB_MCP_SERVER_VERSION,
        tag: `v${GITHUB_MCP_SERVER_VERSION}`,
        platform,
        asset: asset.asset,
        sha256: asset.sha256,
      },
      null,
      2,
    )}\n`,
  );
  return destination;
}

export function stageBakedFeatureResources(
  resourcesRoot = DESKTOP_RESOURCES_DIR,
  options: { requireGitHubMcp?: boolean } = {},
): string {
  const scratch = mkdtempSync(path.join(tmpdir(), "pho-code-stage-"));
  const preparedFeatures = path.join(scratch, PACKAGED_FEATURES_DIR);
  mkdirSync(preparedFeatures, { recursive: true });
  try {
    stagePermissionPackage(preparedFeatures);
    stageCursorSdkPackage(preparedFeatures);
    stageCuratedSkills(preparedFeatures);
    stageGitHubMcpServer(preparedFeatures, {
      required: options.requireGitHubMcp === true,
      fetchIfMissing: options.requireGitHubMcp === true,
    });
    replaceGeneratedTree(preparedFeatures, path.join(resourcesRoot, PACKAGED_FEATURES_DIR));
    return path.join(resourcesRoot, PACKAGED_FEATURES_DIR, ...PERMISSION_PACKAGE_NAME.split("/"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail} Prepared tree retained at ${preparedFeatures}.`);
  }
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
  const cursorManifest = path.join(resolveWorkspacePackageRoot(CURSOR_SDK_PACKAGE_NAME), "package.json");
  const packages = [
    readNoticePackage("@earendil-works/pi-coding-agent"),
    readNoticePackage("@earendil-works/pi-ai"),
    readNoticePackage(PERMISSION_PACKAGE_NAME),
    ...PERMISSION_RUNTIME_DEPS.map((name) => readNoticePackage(name, permissionManifest)),
    readNoticePackage(CURSOR_SDK_PACKAGE_NAME),
    readNoticePackage("@cursor/sdk", cursorManifest),
    readNoticePackage("@hono/node-server", cursorManifest),
    readNoticePackage("@modelcontextprotocol/sdk", cursorManifest),
    readNoticePackage("@ff-labs/fff-node"),
    readNoticePackage("@mozilla/readability"),
    readNoticePackage("linkedom"),
    readNoticePackage("turndown"),
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
