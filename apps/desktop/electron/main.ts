import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell } from "electron";
import { createApplicationService, type ApplicationService } from "@pho-code/application";
import {
  commandFail,
  commandOk,
  createHarnessError,
  HARNESS_ERROR_CODES,
  isHarnessError,
  isJsonSafeValue,
  PINNED_ELECTRON,
  type AbortRunInput,
  type CommandResult,
  type CreateSessionInput,
  type ImportProviderApiKeyInput,
  type ListWorkspaceSessionsInput,
  type OpenRecentWorkspaceInput,
  type OpenSessionInput,
  type ResolveHostDialogInput,
  type SendPromptInput,
  type SetSessionModelInput,
  type SetThinkingLevelInput,
  type ThemePreference,
  type UpdateAppearanceSettingsInput,
  type UpdatePermissionSettingsInput,
} from "@pho-code/protocol";
import {
  createDefaultFeatureManifest,
  createNodeModuleResourceLocator,
  createPackagedResourceLocator,
  createPhoCodeRuntime,
  type HarnessRuntime,
  type ResourceLocator,
} from "@pho-code/runtime";
import { runBoundedShutdown } from "./bounded-shutdown";
import { IPC_CHANNELS } from "./ipc";
import { createFileMetadataStore } from "./metadata-store";
import { assertTrustedSender, contentSecurityPolicy, isSafeExternalUrl } from "./security";
import { resolveTrustedRendererLocation, isTrustedRendererUrl } from "./trusted-renderer";

const APP_NAME = "Pho Code";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererDirectory = path.join(__dirname, "..", "renderer");
const preloadPath = path.join(__dirname, "..", "preload", "preload.js");
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const testMode = process.env.PHO_CODE_TEST_MODE === "background";
const trustedRenderer = resolveTrustedRendererLocation({
  rendererDirectory,
  ...(process.env.ELECTRON_RENDERER_URL ? { devServerUrl: process.env.ELECTRON_RENDERER_URL } : {}),
});

let runtime: HarnessRuntime | undefined;
let application: ApplicationService | undefined;
let shutdownStarted = false;
let quitAfterShutdown = false;

function registerPackagedNodeModulePath(): void {
  if (!app.isPackaged) {
    return;
  }
  const asarModules = path.join(process.resourcesPath, "app.asar", "node_modules");
  if (!existsSync(asarModules)) {
    return;
  }
  const current = process.env.NODE_PATH?.split(path.delimiter).filter(Boolean) ?? [];
  if (!current.includes(asarModules)) {
    process.env.NODE_PATH = [asarModules, ...current].join(path.delimiter);
  }
  const withInit = Module as typeof Module & { _initPaths?: () => void };
  withInit._initPaths?.();
}

function resolveDesktopResourceLocator(): ResourceLocator {
  if (app.isPackaged) {
    return createPackagedResourceLocator(process.resourcesPath);
  }
  const override = process.env.PHO_CODE_RESOURCES_DIR?.trim();
  if (override) {
    return createPackagedResourceLocator(path.resolve(override));
  }
  return createNodeModuleResourceLocator();
}

function applyUserDataOverride(): void {
  const override = process.env.PHO_CODE_USER_DATA_DIR?.trim();
  if (!override) {
    return;
  }

  app.setPath("userData", path.resolve(override));
}

function openValidatedExternalUrl(url: string): void {
  if (testMode || !isSafeExternalUrl(url)) {
    return;
  }

  void shell.openExternal(url);
}

function attachNavigationGuards(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    openValidatedExternalUrl(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(url, trustedRenderer)) {
      return;
    }

    event.preventDefault();
    openValidatedExternalUrl(url);
  });
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  // macOS hidden inset titlebar adapted from refs/t3code DesktopWindow.getWindowTitleBarOptions
  // (MIT, T3 Tools Inc., 6bc6cb6). SSH/WSL/updater/preview omitted.
  const window = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 640,
    minHeight: 520,
    show: !testMode,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#fafafa",
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 18 },
        }
      : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      backgroundThrottling: !testMode,
    },
  });

  attachNavigationGuards(window);

  window.once("ready-to-show", () => {
    if (!testMode) {
      window.show();
    }
  });

  if (trustedRenderer.kind === "dev") {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL ?? trustedRenderer.origin);
  } else {
    void window.loadFile(trustedRenderer.entryFile);
  }

  return window;
}

function applyTheme(theme: ThemePreference): void {
  nativeTheme.themeSource = theme;
  const background = nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#fafafa";
  for (const window of BrowserWindow.getAllWindows()) {
    window.setBackgroundColor(background);
  }
}

function requireApplication(): ApplicationService {
  if (!application) {
    throw new Error("The application service is not ready.");
  }
  return application;
}

function publishRuntimeEvent(event: unknown): void {
  if (!isJsonSafeValue(event)) {
    console.error("Dropped a runtime event that was not JSON-safe.");
    return;
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.event, event);
  }
}

function toCommandError(error: unknown, operation: string) {
  if (isHarnessError(error)) {
    return error;
  }
  return createHarnessError({
    code: HARNESS_ERROR_CODES.runtimeUnavailable,
    message: error instanceof Error ? error.message : "The desktop command failed.",
    operation,
  });
}

async function handleCommand<T>(operation: string, run: () => Promise<T>): Promise<CommandResult<T>> {
  try {
    const value = await run();
    if (value !== null && value !== undefined && !isJsonSafeValue(value)) {
      return commandFail(
        createHarnessError({
          code: HARNESS_ERROR_CODES.invalidSnapshot,
          message: "Command result is not JSON-safe.",
          operation,
        }),
      );
    }
    return commandOk(value);
  } catch (error) {
    return commandFail(toCommandError(error, operation));
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.getBootstrapState, (event) =>
    handleCommand("getBootstrapState", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().getBootstrapState();
    }),
  );

  ipcMain.handle(IPC_CHANNELS.pickWorkspace, async (event) =>
    handleCommand("pickWorkspace", async () => {
      assertTrustedSender(event, trustedRenderer);
      const window = BrowserWindow.fromWebContents(event.sender);
      const result = window
        ? await dialog.showOpenDialog(window, { properties: ["openDirectory"] })
        : await dialog.showOpenDialog({ properties: ["openDirectory"] });
      if (result.canceled || !result.filePaths[0]) {
        return null;
      }
      return requireApplication().openPickedWorkspace(result.filePaths[0]);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.openRecentWorkspace, async (event, payload: unknown) =>
    handleCommand("openRecentWorkspace", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().openRecentWorkspace(asRecord(payload) as unknown as OpenRecentWorkspaceInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.listWorkspaceSessions, async (event, payload: unknown) =>
    handleCommand("listWorkspaceSessions", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().listWorkspaceSessions(asRecord(payload) as unknown as ListWorkspaceSessionsInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.createSession, async (event, payload: unknown) =>
    handleCommand("createSession", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().createSession(asRecord(payload) as unknown as CreateSessionInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.openSession, async (event, payload: unknown) =>
    handleCommand("openSession", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().openSession(asRecord(payload) as unknown as OpenSessionInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.sendPrompt, async (event, payload: unknown) =>
    handleCommand("sendPrompt", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().sendPrompt(asRecord(payload) as unknown as SendPromptInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.abortRun, async (event, payload: unknown) =>
    handleCommand("abortRun", async () => {
      assertTrustedSender(event, trustedRenderer);
      await requireApplication().abortRun(asRecord(payload) as unknown as AbortRunInput);
      return null;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.setSessionModel, async (event, payload: unknown) =>
    handleCommand("setSessionModel", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().setSessionModel(asRecord(payload) as unknown as SetSessionModelInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.setThinkingLevel, async (event, payload: unknown) =>
    handleCommand("setThinkingLevel", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().setThinkingLevel(asRecord(payload) as unknown as SetThinkingLevelInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.resolveHostDialog, async (event, payload: unknown) =>
    handleCommand("resolveHostDialog", async () => {
      assertTrustedSender(event, trustedRenderer);
      await requireApplication().resolveHostDialog(asRecord(payload) as unknown as ResolveHostDialogInput);
      return null;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.getSettings, (event) =>
    handleCommand("getSettings", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().getSettings();
    }),
  );

  ipcMain.handle(IPC_CHANNELS.updateAppearanceSettings, async (event, payload: unknown) =>
    handleCommand("updateAppearanceSettings", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().updateAppearanceSettings(asRecord(payload) as unknown as UpdateAppearanceSettingsInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.updatePermissionSettings, async (event, payload: unknown) =>
    handleCommand("updatePermissionSettings", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().updatePermissionSettings(asRecord(payload) as unknown as UpdatePermissionSettingsInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.listCredentialProviders, (event) =>
    handleCommand("listCredentialProviders", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().listCredentialProviders();
    }),
  );

  ipcMain.handle(IPC_CHANNELS.importProviderApiKey, async (event, payload: unknown) =>
    handleCommand("importProviderApiKey", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().importProviderApiKey(asRecord(payload) as unknown as ImportProviderApiKeyInput);
    }),
  );
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}

function configureSession(): void {
  const csp = contentSecurityPolicy(isDev);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });

  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
}

async function finishQuit(): Promise<void> {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;
  const shutdown = await runBoundedShutdown(async () => {
    await application?.shutdown();
  });
  const probe = process.env.PHO_CODE_SHUTDOWN_PROBE?.trim();
  if (probe) {
    await writeFile(
      probe,
      `${JSON.stringify({
        disposeCount: runtime?.disposeCount ?? 0,
        shutdown,
      })}\n`,
    );
  }

  quitAfterShutdown = true;
  app.quit();
}

app.setName(APP_NAME);
applyUserDataOverride();

app.whenReady().then(async () => {
  configureSession();
  registerPackagedNodeModulePath();
  const agentDirOverride = process.env.PHO_CODE_AGENT_DIR?.trim();
  const agentDir = path.resolve(agentDirOverride || path.join(app.getPath("userData"), "pi-agent"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const locator = resolveDesktopResourceLocator();
  runtime = await createPhoCodeRuntime({
    agentDir,
    appliesToSharedPiAgentDir: Boolean(agentDirOverride),
    resourceLocator: locator,
    deterministicTestModel: process.env.PHO_CODE_TEST_MODEL === "1",
    testHostUi: process.env.PHO_CODE_TEST_HOST_UI === "1",
    ...(process.env.PHO_CODE_TEST_FEATURES === "1" ? { featureManifest: createDefaultFeatureManifest(locator) } : {}),
  });
  application = createApplicationService({
    runtime,
    versions: {
      electron: process.versions.electron ?? PINNED_ELECTRON.version,
      embeddedNode: process.versions.node,
    },
    metadataStore: createFileMetadataStore(path.join(app.getPath("userData"), "app-metadata.json")),
    appearanceHost: { applyTheme },
  });
  runtime.subscribe(publishRuntimeEvent);
  registerIpc();

  const injectedWorkspace = process.env.PHO_CODE_TEST_WORKSPACE?.trim();
  if (testMode && injectedWorkspace) {
    await application.openPickedWorkspace(path.resolve(injectedWorkspace));
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || testMode) {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (quitAfterShutdown) {
    return;
  }

  event.preventDefault();
  void finishQuit();
});
