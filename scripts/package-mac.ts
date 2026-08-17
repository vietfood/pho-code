import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  DESKTOP_DIR,
  DESKTOP_RESOURCES_DIR,
  WORKSPACE_ROOT,
  copyPackageTree,
  stageBakedFeatureResources,
  writeThirdPartyNotices,
} from "./stage-app-resources.ts";
import {
  SANDBOX_RUNTIME_NESTED_DEPS,
  SANDBOX_RUNTIME_PACKAGE,
  SANDBOX_RUNTIME_VERSION,
} from "../packages/runtime/src/sandbox-artifact.ts";

const STAGE_DIR = path.join(DESKTOP_DIR, ".package-stage");
const SKIP_APP_PACKAGES = new Set([
  "@gotgenes/pi-permission-system",
  "@pho-code/application",
  "@pho-code/protocol",
  "@pho-code/runtime",
  "@pho-code/ui",
  "react",
  "react-dom",
]);

const WALK_WITHOUT_COPY = new Set(["@pho-code/runtime"]);
const NEST_DEPENDENCY_PACKAGES = new Set([SANDBOX_RUNTIME_PACKAGE]);

interface PackageManifest {
  name?: string;
  version?: string;
  main?: string;
  productName?: string;
  description?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface ResolvedProductionPackage {
  name: string;
  root: string;
}

function resolveManifestPath(require: NodeRequire, packageName: string): string | undefined {
  try {
    return require.resolve(`${packageName}/package.json`);
  } catch {
    try {
      let dir = path.dirname(require.resolve(packageName));
      while (true) {
        const candidate = path.join(dir, "package.json");
        if (existsSync(candidate)) {
          try {
            const manifest = JSON.parse(readFileSync(candidate, "utf8")) as PackageManifest;
            if (manifest.name === packageName) {
              return candidate;
            }
          } catch {
            // Keep walking toward the filesystem root.
          }
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
          return undefined;
        }
        dir = parent;
      }
    } catch {
      return undefined;
    }
  }
}

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}.`);
  }
}

export function collectProductionPackages(entryPackageJson: string): ResolvedProductionPackage[] {
  const queued = new Set<string>();
  const resolved: ResolvedProductionPackage[] = [];
  const queue: { name: string; from: string; optional: boolean; copy: boolean }[] = [];

  function enqueue(packageName: string, from: string, optional: boolean): void {
    if (queued.has(packageName)) {
      return;
    }
    if (WALK_WITHOUT_COPY.has(packageName)) {
      queued.add(packageName);
      queue.push({ name: packageName, from, optional, copy: false });
      return;
    }
    if (SKIP_APP_PACKAGES.has(packageName) || packageName.startsWith("@pho-code/")) {
      return;
    }
    queued.add(packageName);
    queue.push({ name: packageName, from, optional, copy: true });
  }

  const root = JSON.parse(readFileSync(entryPackageJson, "utf8")) as PackageManifest;
  for (const name of Object.keys(root.dependencies ?? {})) {
    enqueue(name, entryPackageJson, false);
  }

  for (const item of queue) {
    const require = createRequire(item.from);
    const manifestPath = resolveManifestPath(require, item.name);
    if (!manifestPath) {
      if (item.optional) {
        continue;
      }
      throw new Error(`Cannot resolve production dependency ${item.name} from ${item.from}.`);
    }
    if (item.copy) {
      resolved.push({ name: item.name, root: path.dirname(manifestPath) });
    }
    if (NEST_DEPENDENCY_PACKAGES.has(item.name)) {
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      enqueue(name, manifestPath, false);
    }
    for (const name of Object.keys(manifest.optionalDependencies ?? {})) {
      enqueue(name, manifestPath, true);
    }
  }

  return resolved;
}

function writeStagedAppManifest(packages: readonly ResolvedProductionPackage[]): void {
  const source = JSON.parse(readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf8")) as PackageManifest;
  const dependencies: Record<string, string> = {};
  for (const pkg of packages) {
    const manifest = JSON.parse(readFileSync(path.join(pkg.root, "package.json"), "utf8")) as PackageManifest;
    dependencies[pkg.name] = manifest.version ?? "0.0.0";
  }
  const staged: PackageManifest = {
    // Must not reuse the workspace package name `pho-code`; electron-builder's bun
    // workspace detection otherwise overwrites the repository root package.json.
    name: "pho-code-app",
    version: source.version ?? "0.0.0",
    productName: source.productName ?? "Pho Code",
    description: source.description ?? "Personal desktop harness for Pi",
    main: "out/main/main.js",
    private: true,
    dependencies,
  };
  writeFileSync(path.join(STAGE_DIR, "package.json"), `${JSON.stringify(staged, null, 2)}\n`);
}

function writeStagedBuilderConfig(): string {
  const configPath = path.join(STAGE_DIR, "electron-builder.json");
  const config = {
    appId: "dev.vietfood.phocode",
    productName: "Pho Code",
    electronVersion: "43.4.0",
    copyright: "Copyright 2026 Pho Code",
    directories: {
      output: path.join(DESKTOP_DIR, "release"),
      buildResources: path.join(DESKTOP_DIR, "resources"),
    },
    files: [
      "**/*",
      "!**/node_modules/@gotgenes/**",
      "!**/node_modules/@pho-code/**",
      "!**/node_modules/pi-cursor-sdk/**",
      "!**/node_modules/@cursor/**",
    ],
    asar: true,
    asarUnpack: [
      "**/*.node",
      "**/*.wasm",
      "**/*.dylib",
      "**/*.so",
      "**/node_modules/@silvia-odwyer/photon-node/**/*",
      "**/node_modules/@ff-labs/**/*",
      "**/node_modules/ffi-rs/**/*",
      "**/node_modules/@cursor/**/*",
    ],
    extraResources: [
      { from: path.join(DESKTOP_RESOURCES_DIR, "features"), to: "features" },
      { from: path.join(DESKTOP_RESOURCES_DIR, "THIRD_PARTY_NOTICES.txt"), to: "THIRD_PARTY_NOTICES.txt" },
    ],
    npmRebuild: false,
    nodeGypRebuild: false,
    mac: {
      identity: null,
      category: "public.app-category.developer-tools",
      target: ["dir"],
      darkModeSupport: true,
      hardenedRuntime: false,
      gatekeeperAssess: false,
    },
    artifactName: "${productName}-${version}-${arch}.${ext}",
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return configPath;
}

export function prepareMacPackageStage(): void {
  stageBakedFeatureResources(DESKTOP_RESOURCES_DIR, { requireGitHubMcp: true, requireRipgrep: true });
  writeThirdPartyNotices(DESKTOP_RESOURCES_DIR);
  run("bun", ["run", "build"], DESKTOP_DIR);

  if (existsSync(STAGE_DIR)) {
    run("/usr/bin/trash", [STAGE_DIR], DESKTOP_DIR);
  }
  mkdirSync(STAGE_DIR, { recursive: true });
  cpSync(path.join(DESKTOP_DIR, "out"), path.join(STAGE_DIR, "out"), { recursive: true });
  const packages = collectProductionPackages(path.join(DESKTOP_DIR, "package.json"));
  writeStagedAppManifest(packages);
  copyProductionNodeModules(path.join(STAGE_DIR, "node_modules"), packages);
}

function copyProductionNodeModules(destination: string, packages: readonly ResolvedProductionPackage[]): void {
  for (const pkg of packages) {
    copyPackageTree(pkg.root, path.join(destination, ...pkg.name.split("/")));
  }
  nestSandboxRuntimeDependencies(destination, packages);
  patchStagedFffAsarResolver(destination);
}

export function nestSandboxRuntimeDependencies(
  nodeModulesDir: string,
  packages: readonly ResolvedProductionPackage[],
): void {
  const sandboxRuntime = packages.find((entry) => entry.name === SANDBOX_RUNTIME_PACKAGE);
  if (!sandboxRuntime) {
    throw new Error(`Packaged node_modules is missing ${SANDBOX_RUNTIME_PACKAGE}.`);
  }
  const destination = path.join(nodeModulesDir, ...SANDBOX_RUNTIME_PACKAGE.split("/"));
  const manifestPath = path.join(destination, "package.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Staged ${SANDBOX_RUNTIME_PACKAGE} is missing package.json.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
  if (manifest.name !== SANDBOX_RUNTIME_PACKAGE || manifest.version !== SANDBOX_RUNTIME_VERSION) {
    throw new Error(
      `Staged ${SANDBOX_RUNTIME_PACKAGE} is ${manifest.name}@${manifest.version}, expected ${SANDBOX_RUNTIME_VERSION}.`,
    );
  }
  const nestedModules = path.join(destination, "node_modules");
  const fromPackageJson = path.join(sandboxRuntime.root, "package.json");
  const require = createRequire(fromPackageJson);
  for (const dependency of SANDBOX_RUNTIME_NESTED_DEPS) {
    const nestedManifest = resolveManifestPath(require, dependency);
    if (!nestedManifest) {
      throw new Error(`Cannot resolve nested ${dependency} for ${SANDBOX_RUNTIME_PACKAGE}.`);
    }
    copyPackageTree(path.dirname(nestedManifest), path.join(nestedModules, ...dependency.split("/")));
  }
}

export function patchFffAsarResolverSource(source: string): string {
  const pathImport = 'import { dirname, join } from "node:path";';
  const binaryReturn = "            return binaryPath;";
  if (!source.includes(pathImport) || !source.includes(binaryReturn)) {
    throw new Error("FFF 0.10.1 binary resolver changed; refusing to apply the packaged ASAR patch.");
  }
  const helper = `
// Pho Code packaged adaptation: ffi-rs cannot dlopen Electron's virtual app.asar path.
function resolveAsarUnpackedBinary(binaryPath) {
    const marker = \`\${sep}app.asar\${sep}\`;
    if (!binaryPath.includes(marker))
        return binaryPath;
    const unpackedPath = binaryPath.replace(marker, \`\${sep}app.asar.unpacked\${sep}\`);
    return existsSync(unpackedPath) ? unpackedPath : binaryPath;
}
`;
  return source
    .replace(pathImport, 'import { dirname, join, sep } from "node:path";')
    .replace("/**\n * Try to resolve the binary from the platform-specific npm package.", `${helper}/**\n * Try to resolve the binary from the platform-specific npm package.`)
    .replace(binaryReturn, "            return resolveAsarUnpackedBinary(binaryPath);");
}

function patchStagedFffAsarResolver(nodeModulesDir: string): void {
  const resolverPath = path.join(nodeModulesDir, "@ff-labs", "fff-node", "dist", "src", "binary.js");
  if (!existsSync(resolverPath)) {
    throw new Error("Staged @ff-labs/fff-node binary resolver is missing.");
  }
  const source = readFileSync(resolverPath, "utf8");
  writeFileSync(resolverPath, patchFffAsarResolverSource(source));
}

function assertWorkspaceManifestIntact(): void {
  const root = JSON.parse(readFileSync(path.join(WORKSPACE_ROOT, "package.json"), "utf8")) as PackageManifest & {
    workspaces?: string[];
  };
  if (root.name !== "pho-code" || !root.workspaces || root.main) {
    throw new Error("Packaging overwrote the workspace package.json; refusing to continue.");
  }
}

function main(): void {
  assertWorkspaceManifestIntact();
  prepareMacPackageStage();
  const configPath = writeStagedBuilderConfig();
  run(
    "bunx",
    ["electron-builder", "--projectDir", STAGE_DIR, "--config", configPath, "--mac", "dir", "--publish", "never"],
    STAGE_DIR,
  );
  assertWorkspaceManifestIntact();
}

if (import.meta.main) {
  main();
}
