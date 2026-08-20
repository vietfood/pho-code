import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(projectRoot, "../..");
const devPort = Number(process.env.PHO_CODE_DEV_PORT ?? "5173");

const portableAliases = {
  "@pho-code/protocol": path.resolve(workspaceRoot, "packages/protocol/src/index.ts"),
  "@pho-code/application": path.resolve(workspaceRoot, "packages/application/src/index.ts"),
  "@pho-code/runtime/image-bytes": path.resolve(workspaceRoot, "packages/runtime/src/image-bytes.ts"),
  "@pho-code/runtime": path.resolve(workspaceRoot, "packages/runtime/src/index.ts"),
  "@pho-code/ui": path.resolve(workspaceRoot, "packages/ui/src/index.ts"),
};

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
          exclude: ["@pho-code/protocol", "@pho-code/application", "@pho-code/runtime"],
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
          exclude: ["@pho-code/protocol"],
        }),
      ],
      resolve: {
        alias: {
          "@pho-code/protocol": portableAliases["@pho-code/protocol"],
        },
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
