import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(projectRoot, "../..");
const devPort = Number(process.env.PHO_CODE_DEV_PORT ?? "5173");

const portableProtocolAliases = {
  "@pho-agent/protocol/errors": path.resolve(workspaceRoot, "packages/pho-agent/packages/protocol/src/errors.ts"),
  "@pho-agent/protocol/github-mcp": path.resolve(workspaceRoot, "packages/pho-agent/packages/protocol/src/github-mcp.ts"),
  "@pho-agent/protocol/json": path.resolve(workspaceRoot, "packages/pho-agent/packages/protocol/src/json.ts"),
  "@pho-agent/protocol/plan-agent": path.resolve(workspaceRoot, "packages/pho-agent/packages/protocol/src/plan-agent.ts"),
  "@pho-agent/protocol/skills": path.resolve(workspaceRoot, "packages/pho-agent/packages/protocol/src/skills.ts"),
  "@pho-agent/protocol": path.resolve(workspaceRoot, "packages/pho-agent/packages/protocol/src/index.ts"),
  "@pho-code/protocol": path.resolve(workspaceRoot, "packages/protocol/src/index.ts"),
};

const portableAliases = {
  ...portableProtocolAliases,
  "@pho-agent/runtime/context-prompt-feature": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/context-prompt-feature.ts"),
  "@pho-agent/runtime/feature-api": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/feature-api.ts"),
  "@pho-agent/runtime/github-mcp": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/github-mcp/index.ts"),
  "@pho-agent/runtime/plan-agent": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/plan-agent/index.ts"),
  "@pho-agent/runtime/path-containment": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/path-containment.ts"),
  "@pho-agent/runtime/session-registry": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/session-registry.ts"),
  "@pho-agent/runtime/skills": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/skills/index.ts"),
  "@pho-agent/runtime/testing": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/testing.ts"),
  "@pho-agent/runtime": path.resolve(workspaceRoot, "packages/pho-agent/packages/runtime/src/index.ts"),
  "@pho-code/application": path.resolve(workspaceRoot, "packages/application/src/index.ts"),
  "@pho-code/runtime/image-bytes": path.resolve(workspaceRoot, "packages/runtime/src/image-bytes.ts"),
  "@pho-code/runtime": path.resolve(workspaceRoot, "packages/runtime/src/index.ts"),
  "@pho-code/ui": path.resolve(workspaceRoot, "packages/ui/src/index.ts"),
};

const bundledMainPackages = [
  "@pho-agent/protocol",
  "@pho-agent/runtime",
  "@pho-code/protocol",
  "@pho-code/application",
  "@pho-code/runtime",
];

const bundledProtocolPackages = ["@pho-agent/protocol", "@pho-code/protocol"];

const externalAgentRuntimePackages = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
];

function isExternalRuntimeDependency(id: string): boolean {
  return (
    id.startsWith("@earendil-works/") ||
    id.startsWith("@ff-labs/") ||
    id === "@anthropic-ai/sandbox-runtime" ||
    id.startsWith("@anthropic-ai/sandbox-runtime/") ||
    id === "ffi-rs" ||
    id === "@silvia-odwyer/photon-node" ||
    id === "typebox" ||
    id === "chalk" ||
    id === "jiti"
  );
}

export default defineConfig(({ command }) => {
  const cleanOutputs = command === "build";

  return {
    main: {
      plugins: [
        externalizeDepsPlugin({
          exclude: bundledMainPackages,
          include: externalAgentRuntimePackages,
        }),
      ],
      resolve: {
        alias: portableAliases,
      },
      build: {
        outDir: "out/main",
        emptyOutDir: cleanOutputs,
        rollupOptions: {
          input: {
            main: path.resolve(projectRoot, "electron/main.ts"),
          },
          external: isExternalRuntimeDependency,
        },
      },
    },
    preload: {
      plugins: [
        externalizeDepsPlugin({
          exclude: bundledProtocolPackages,
        }),
      ],
      resolve: {
        alias: portableProtocolAliases,
      },
      build: {
        outDir: "out/preload",
        emptyOutDir: cleanOutputs,
        lib: {
          entry: path.resolve(projectRoot, "electron/preload.ts"),
          formats: ["cjs"],
        },
        rollupOptions: {
          output: {
            entryFileNames: "preload.js",
            format: "cjs",
          },
        },
      },
    },
    renderer: {
      root: projectRoot,
      base: "./",
      plugins: [react(), tailwindcss()],
      server: {
        port: devPort,
        strictPort: true,
        watch: {
          // Main/preload live beside the renderer root; if Vite watches them it
          // reloads the page with a stale contextBridge instead of restarting Electron.
          ignored: ["**/electron/**", "**/tests/**", "**/out/**"],
        },
      },
      build: {
        outDir: "out/renderer",
        emptyOutDir: true,
        rollupOptions: {
          input: path.resolve(projectRoot, "index.html"),
        },
      },
    },
  };
});
