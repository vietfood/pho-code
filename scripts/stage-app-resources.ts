import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
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
import {
  RIPGREP_EXECUTABLE,
  RIPGREP_LICENSE,
  RIPGREP_TAG,
  RIPGREP_UPSTREAM,
  RIPGREP_VERSION,
  SANDBOX_RUNTIME_LICENSE,
  SANDBOX_RUNTIME_PACKAGE,
  SANDBOX_RUNTIME_VERSION,
  ripgrepPackagedRelativePath,
  ripgrepPlatformId,
  ripgrepReleaseAsset,
  ripgrepReleaseUrl,
} from "../packages/runtime/src/sandbox-artifact.ts";

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
  const known = ["darwin/arm64", "darwin/x64", "linux/arm64", "linux/x64"];
  const id = `${platform}/${arch}`;
  return known.includes(id) ? `@cursor/sdk-${platform}-${arch}` : undefined;
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

function copyPackagePruned(source: string, packageRoot: string, keep: ReadonlySet<string>): void {
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
      return keep.has(top ?? "");
    },
  });
}

function verifyStagedManifest(packageRoot: string, expectedName: string, expectedVersion: string): void {
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
    name?: string;
    version?: string;
  };
  if (manifest.name !== expectedName || manifest.version !== expectedVersion) {
    throw new Error(`Staged ${expectedName} is ${manifest.name}@${manifest.version}, expected ${expectedVersion}.`);
  }
}

function stagePermissionPackage(featuresRoot: string): string {
  const packageRoot = path.join(featuresRoot, ...PERMISSION_PACKAGE_NAME.split("/"));
  const source = resolveWorkspacePackageRoot(PERMISSION_PACKAGE_NAME);
  copyPackagePruned(source, packageRoot, PERMISSION_KEEP);

  const nestedModules = path.join(packageRoot, "node_modules");
  const permissionManifest = path.join(source, "package.json");
  for (const dependency of PERMISSION_RUNTIME_DEPS) {
    copyResolvedPackage(dependency, path.join(nestedModules, dependency), permissionManifest);
  }

  verifyStagedManifest(packageRoot, PERMISSION_PACKAGE_NAME, PERMISSION_FEATURE_VERSION);
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
  copyPackagePruned(source, packageRoot, CURSOR_SDK_KEEP);

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

  verifyStagedManifest(packageRoot, CURSOR_SDK_PACKAGE_NAME, CURSOR_SDK_FEATURE_VERSION);
  return packageRoot;
}

export function stagedCursorSdkPackageRoot(resourcesRoot: string): string {
  return path.join(resourcesRoot, PACKAGED_FEATURES_DIR, CURSOR_SDK_PACKAGE_NAME);
}

export function githubMcpCacheDir(): string {
  return path.join(WORKSPACE_ROOT, "packages", "runtime", "features", "github", "github-mcp-server", "cache");
}

export function ripgrepCacheDir(): string {
  return path.join(WORKSPACE_ROOT, "packages", "runtime", "features", "ripgrep", "cache");
}

export function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

interface PinnedBinarySpec {
  label: string;
  asset(): { asset: string; sha256: string } | undefined;
  relativePath(): string | undefined;
  platformId(): string | undefined;
  defaultCacheDir(): string;
  releaseUrl(asset: string): string;
  executable: string;
  findBinary(scratch: string): string | undefined;
  pin: { version: string; tag: string };
}

function findExtractedBinary(root: string, executable: string): string | undefined {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const entry of readdirSync(current)) {
      const candidate = path.join(current, entry);
      if (entry === executable) {
        return candidate;
      }
      if (statSync(candidate).isDirectory()) {
        stack.push(candidate);
      }
    }
  }
  return undefined;
}

function stagePinnedBinary(
  spec: PinnedBinarySpec,
  featuresRoot: string,
  options: { required?: boolean; fetchIfMissing?: boolean; cacheDir?: string; archivePath?: string } = {},
): string | undefined {
  const asset = spec.asset();
  const relative = spec.relativePath();
  const platform = spec.platformId();
  if (!asset || !relative || !platform) {
    if (options.required) {
      throw new Error(`No pinned ${spec.label} asset for ${process.platform}/${process.arch}.`);
    }
    return undefined;
  }
  const cacheDir = options.cacheDir ?? spec.defaultCacheDir();
  mkdirSync(cacheDir, { recursive: true });
  const archivePath = options.archivePath ?? path.join(cacheDir, asset.asset);
  if (!existsSync(archivePath) && options.fetchIfMissing) {
    const downloaded = spawnSync("curl", ["-fsSL", "-o", archivePath, spec.releaseUrl(asset.asset)], {
      encoding: "utf8",
    });
    if (downloaded.status !== 0) {
      throw new Error(`Failed to fetch ${spec.label} archive (${downloaded.stderr?.trim() || downloaded.status}).`);
    }
  }
  if (!existsSync(archivePath)) {
    if (!options.required) {
      return undefined;
    }
    throw new Error(
      `Missing ${spec.label} archive ${archivePath}. Fetch ${spec.releaseUrl(asset.asset)} into the cache during a reviewed build action.`,
    );
  }
  const digest = sha256File(archivePath);
  if (digest !== asset.sha256) {
    throw new Error(`${spec.label} archive SHA-256 mismatch for ${asset.asset}. Expected ${asset.sha256}, got ${digest}.`);
  }
  const scratch = mkdtempSync(path.join(tmpdir(), "pho-code-bin-"));
  const extract = spawnSync("tar", ["-xzf", archivePath, "-C", scratch], { encoding: "utf8" });
  if (extract.status !== 0) {
    throw new Error(`Failed to extract ${spec.label} archive (${extract.stderr?.trim() || extract.status}).`);
  }
  const binary = spec.findBinary(scratch);
  if (!binary) {
    throw new Error(`${spec.label} archive did not contain ${spec.executable}.`);
  }
  const destination = path.join(featuresRoot, relative);
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(binary, destination);
  chmodSync(destination, 0o755);
  writeFileSync(
    path.join(path.dirname(destination), "PIN.json"),
    `${JSON.stringify(
      { version: spec.pin.version, tag: spec.pin.tag, platform, asset: asset.asset, sha256: asset.sha256 },
      null,
      2,
    )}\n`,
  );
  return destination;
}

export function stageGitHubMcpServer(
  featuresRoot: string,
  options: { required?: boolean; fetchIfMissing?: boolean; cacheDir?: string; archivePath?: string } = {},
): string | undefined {
  return stagePinnedBinary(
    {
      label: "GitHub MCP",
      asset: githubMcpReleaseAsset,
      relativePath: githubMcpPackagedRelativePath,
      platformId: githubMcpPlatformId,
      defaultCacheDir: githubMcpCacheDir,
      releaseUrl: githubMcpReleaseUrl,
      executable: GITHUB_MCP_SERVER_EXECUTABLE,
      findBinary: (scratch) => {
        const binary = path.join(scratch, GITHUB_MCP_SERVER_EXECUTABLE);
        return existsSync(binary) ? binary : undefined;
      },
      pin: { version: GITHUB_MCP_SERVER_VERSION, tag: `v${GITHUB_MCP_SERVER_VERSION}` },
    },
    featuresRoot,
    options,
  );
}

export function stageRipgrep(
  featuresRoot: string,
  options: { required?: boolean; fetchIfMissing?: boolean; cacheDir?: string; archivePath?: string } = {},
): string | undefined {
  return stagePinnedBinary(
    {
      label: "ripgrep",
      asset: ripgrepReleaseAsset,
      relativePath: ripgrepPackagedRelativePath,
      platformId: ripgrepPlatformId,
      defaultCacheDir: ripgrepCacheDir,
      releaseUrl: ripgrepReleaseUrl,
      executable: RIPGREP_EXECUTABLE,
      findBinary: (scratch) => findExtractedBinary(scratch, RIPGREP_EXECUTABLE),
      pin: { version: RIPGREP_VERSION, tag: RIPGREP_TAG },
    },
    featuresRoot,
    options,
  );
}

export function stageBakedFeatureResources(
  resourcesRoot = DESKTOP_RESOURCES_DIR,
  options: { requireGitHubMcp?: boolean; requireRipgrep?: boolean } = {},
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
    stageRipgrep(preparedFeatures, {
      required: options.requireRipgrep === true,
      fetchIfMissing: options.requireRipgrep === true,
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
  const runtimeManifest = path.join(resolveWorkspacePackageRoot("@pho-code/runtime"), "package.json");
  const agentRuntimeManifest = path.join(WORKSPACE_ROOT, "packages/pho-agent/packages/runtime/package.json");
  const packages = [
    readNoticePackage("@earendil-works/pi-coding-agent", agentRuntimeManifest),
    readNoticePackage("@earendil-works/pi-ai", agentRuntimeManifest),
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
    readNoticePackage(SANDBOX_RUNTIME_PACKAGE, runtimeManifest),
  ];
  const sandboxRuntime = packages.find((entry) => entry.name === SANDBOX_RUNTIME_PACKAGE);
  if (
    !sandboxRuntime ||
    sandboxRuntime.version !== SANDBOX_RUNTIME_VERSION ||
    sandboxRuntime.license !== SANDBOX_RUNTIME_LICENSE
  ) {
    throw new Error(
      `Third-party notices expected ${SANDBOX_RUNTIME_PACKAGE} ${SANDBOX_RUNTIME_VERSION} (${SANDBOX_RUNTIME_LICENSE}).`,
    );
  }
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
  sections.push(`## BurntSushi/ripgrep ${RIPGREP_VERSION}`);
  sections.push("");
  sections.push(`License: ${RIPGREP_LICENSE} · Andrew Gallant`);
  sections.push("");
  sections.push(`Upstream: ${RIPGREP_UPSTREAM}/tree/${RIPGREP_TAG}`);
  sections.push("");
  sections.push(
    "Pho Code ships the pinned macOS `rg` binary as an app-owned resource for sandbox-runtime deny-path detection. The running app never downloads it.",
  );
  sections.push("");
  sections.push(RIPGREP_UNLICENSE_TEXT);
  sections.push("");
  sections.push(RIPGREP_MIT_TEXT);
  sections.push("");
  sections.push("## juicesharp ask-user questionnaire (adapted source)");
  sections.push("");
  sections.push("License: MIT · juicesharp");
  sections.push("");
  sections.push(
    "Not a shipped npm package. Pho Code reimplements schema, validation, envelope, guidelines, and RPC fallback from `@juicesharp/rpiv-ask-user-question` 2.6.0 inside a Pho-owned factory. The npm package and `pi-tui` are not baked.",
  );
  sections.push("");
  sections.push(JUICESHARP_MIT_TEXT);
  sections.push("");
  return `${sections.join("\n").trim()}\n`;
}

const RIPGREP_UNLICENSE_TEXT = `This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org/>`;

const RIPGREP_MIT_TEXT = `The MIT License (MIT)

Copyright (c) 2015 Andrew Gallant

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`;

const JUICESHARP_MIT_TEXT = `MIT License

Copyright (c) juicesharp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`;

export function writeThirdPartyNotices(resourcesRoot = DESKTOP_RESOURCES_DIR): { artifact: string; docs: string } {
  const text = generateThirdPartyNotices();
  mkdirSync(resourcesRoot, { recursive: true });
  const artifact = path.join(resourcesRoot, "THIRD_PARTY_NOTICES.txt");
  const docs = path.join(WORKSPACE_ROOT, "docs", "third-party-notices.md");
  writeFileSync(artifact, text);
  writeFileSync(docs, text);
  return { artifact, docs };
}
