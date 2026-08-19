import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, session, shell } from "electron";
import { installApplicationMenu } from "./application-menu";
import { createApplicationService, type ApplicationService } from "@pho-code/application";
import {
  commandFail,
  commandOk,
  createHarnessError,
  HARNESS_ERROR_CODES,
  isHarnessError,
  isJsonSafeValue,
  MAX_PREPARED_IMAGES,
  PINNED_ELECTRON,
  nativeThemeSourceForAppearance,
  resolveAppearanceMode,
  windowBackgroundForAppearance,
  type AppearanceSettings,
  type CommandResult,
  type PasteImagesInput,
  type PickImagesInput,
  type PickImagesResult,
  type PrepareImageInput,
  type PreparedImageSummary,
} from "@pho-code/protocol";
import { decodePastedImageBase64 } from "./image-base64";
import {
  createDefaultFeatureManifest,
  createNodeModuleResourceLocator,
  createPackagedResourceLocator,
  createPhoCodeRuntime,
  resolveGitHubMcpServerPath,
  resolveRipgrepPath,
  type HarnessRuntime,
  type ResourceLocator,
} from "@pho-code/runtime";
import { runBoundedShutdown } from "./bounded-shutdown";
import { IPC_CHANNELS } from "./ipc";
import { ingestImageBytes, ingestImageFile, ingestNativeImage } from "./image-ingest";
import { createFileMetadataStore } from "./metadata-store";
import {
  assertTrustedSender,
  contentSecurityPolicy,
  isAllowedWebPermission,
  isSafeExternalUrl,
} from "./security";
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
  if (override) {
    app.setPath("userData", path.resolve(override));
  }
}

const openedAuthUrls: string[] | undefined = testMode ? [] : undefined;
if (openedAuthUrls) {
  (globalThis as { __phoCodeOpenedAuthUrls?: string[] }).__phoCodeOpenedAuthUrls = openedAuthUrls;
}

function openValidatedExternalUrl(url: string): void {
  if (testMode || !isSafeExternalUrl(url)) {
    return;
  }

  void shell.openExternal(url);
}

function openValidatedAuthUrl(url: string): void {
  if (!isSafeExternalUrl(url)) {
    return;
  }
  openedAuthUrls?.push(url);
  if (testMode) {
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

let currentAppearance: Pick<AppearanceSettings, "palette" | "mode" | "glassEnabled" | "glassStrength"> = {
  palette: "default",
  mode: "system",
  glassEnabled: false,
  glassStrength: 55,
};

function createWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  // macOS hidden inset titlebar adapted from refs/t3code DesktopWindow.getWindowTitleBarOptions
  // (MIT, T3 Tools Inc., 6bc6cb6). SSH/WSL/updater/preview omitted.
  const resolved = resolveAppearanceMode(currentAppearance.mode, nativeTheme.shouldUseDarkColors);
  const solidBackground = windowBackgroundForAppearance(currentAppearance.palette, resolved);
  const window = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 640,
    minHeight: 520,
    show: !testMode,
    // macOS stays transparent-capable so frosted glass can toggle without recreating the window.
    transparent: isMac,
    backgroundColor: currentAppearance.glassEnabled && isMac ? "#00000000" : solidBackground,
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 18 },
          ...(currentAppearance.glassEnabled ? { vibrancy: "under-window" as const } : {}),
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

function applyAppearance(
  appearance: Pick<AppearanceSettings, "palette" | "mode" | "glassEnabled" | "glassStrength">,
): void {
  currentAppearance = appearance;
  const mode = nativeThemeSourceForAppearance(appearance.palette, appearance.mode);
  nativeTheme.themeSource = mode;
  const resolved = resolveAppearanceMode(mode, nativeTheme.shouldUseDarkColors);
  const solidBackground = windowBackgroundForAppearance(appearance.palette, resolved);
  const isMac = process.platform === "darwin";
  for (const window of BrowserWindow.getAllWindows()) {
    if (isMac) {
      if (appearance.glassEnabled) {
        window.setBackgroundColor("#00000000");
        window.setVibrancy("under-window");
      } else {
        window.setVibrancy(null);
        window.setBackgroundColor(solidBackground);
      }
    } else {
      window.setBackgroundColor(solidBackground);
    }
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

type CommandName = keyof ApplicationService & keyof typeof IPC_CHANNELS;

// Pass-through commands share one shape: trusted sender, payload record
// forwarded to the same-named ApplicationService method.
function registerCommand(name: CommandName, nullResult = false): void {
  ipcMain.handle(IPC_CHANNELS[name], (event, payload: unknown) =>
    handleCommand(name, async () => {
      assertTrustedSender(event, trustedRenderer);
      const method = requireApplication()[name] as unknown as (
        input: Record<string, unknown>,
      ) => Promise<unknown>;
      const value = await method(asRecord(payload));
      return nullResult ? null : value;
    }),
  );
}

function registerIpc(): void {
  const commands = [
    "getBootstrapState",
    "openRecentWorkspace",
    "reorderRecentWorkspaces",
    "listWorkspaceSessions",
    "listSessionCatalog",
    "getSessionSnapshot",
    "createSession",
    "openSession",
    "archiveSession",
    "restoreSession",
    "prepareRemoveSession",
    "removeSession",
    "prepareRemoveProject",
    "removeProject",
    "prepareRemoveArchivedSessions",
    "removeArchivedSessions",
    "sendPrompt",
    "steerRun",
    "queueFollowUp",
    "setSessionModel",
    "setThinkingLevel",
    "setSessionMode",
    "updateSessionPlanDocument",
    "executeSessionPlan",
    "rewriteAssistantOutput",
    "updateSessionContextPrompt",
    "getSettings",
    "updateAppearanceSettings",
    "updatePermissionSettings",
    "trustProjectPermissionRules",
    "listCredentialProviders",
    "importProviderApiKey",
    "listProviderAccounts",
    "startProviderLogin",
    "respondProviderAuthPrompt",
    "openProviderAuthLink",
    "cancelProviderLogin",
    "logoutProvider",
    "searchWorkspaceReferences",
    "updateSkillSourceSettings",
    "refreshSkills",
    "updateGitHubMcpSettings",
    "updateSandboxSettings",
    "importGitHubPat",
    "removeGitHubPat",
    "getChangeReviewSet",
    "getChangeDiff",
    "getChangeFileView",
    "approveChanges",
    "prepareUndoChanges",
    "applyUndoChanges",
  ] as const satisfies readonly CommandName[];
  for (const name of commands) {
    registerCommand(name);
  }
  for (const name of ["removePreparedImage", "abortRun", "resolveHostDialog"] as const) {
    registerCommand(name, true);
  }

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

  ipcMain.handle(IPC_CHANNELS.pickImages, async (event, payload: unknown) =>
    handleCommand("pickImages", async () => {
      assertTrustedSender(event, trustedRenderer);
      const scope = imageSessionScope(asRecord(payload) as PickImagesInput);
      const window = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = {
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) {
        return { images: [] };
      }
      return collectImages(
        result.filePaths.slice(0, MAX_PREPARED_IMAGES).map((filePath) => async () => {
          const prepared = await ingestImageFile(filePath);
          return requireApplication().prepareImage({ ...prepared, ...scope });
        }),
      );
    }),
  );

  ipcMain.handle(IPC_CHANNELS.pasteImages, async (event, payload: unknown) =>
    handleCommand("pasteImages", async () => {
      assertTrustedSender(event, trustedRenderer);
      return ingestPastedImages(asRecord(payload) as unknown as PasteImagesInput);
    }),
  );
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}

function imageSessionScope(input: { sessionId?: string; workspaceId?: string }): {
  sessionId?: string;
  workspaceId?: string;
} {
  const sessionId = typeof input.sessionId === "string" && input.sessionId.trim() !== "" ? input.sessionId.trim() : undefined;
  const workspaceId =
    typeof input.workspaceId === "string" && input.workspaceId.trim() !== "" ? input.workspaceId.trim() : undefined;
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(workspaceId ? { workspaceId } : {}),
  };
}

// Run ingest/prepare tasks in order, keeping every success and surfacing the
// first failure only when nothing succeeded.
async function collectImages(tasks: readonly (() => Promise<PreparedImageSummary>)[]): Promise<PickImagesResult> {
  const images = [];
  let firstError: unknown;
  for (const task of tasks) {
    try {
      images.push(await task());
    } catch (error) {
      firstError ??= error;
    }
  }
  if (images.length === 0 && firstError) {
    throw firstError;
  }
  return { images };
}

async function ingestPastedImages(input: PasteImagesInput): Promise<PickImagesResult> {
  const supplied = Array.isArray(input.images) ? input.images : [];
  const prepared: PrepareImageInput[] = [];
  if (supplied.length > 0) {
    for (const item of supplied.slice(0, MAX_PREPARED_IMAGES)) {
      const name = typeof item.name === "string" && item.name.trim() !== "" ? item.name : "pasted-image.png";
      const data = typeof item.data === "string" ? item.data : "";
      if (data.trim() === "") {
        continue;
      }
      prepared.push(await ingestImageBytes(decodePastedImageBase64(data), name, "pasteImages"));
    }
    if (prepared.length === 0) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidImage,
        message: "That paste did not contain a supported image.",
        operation: "pasteImages",
        recoverable: true,
      });
    }
  } else {
    const native = clipboard.readImage();
    if (native.isEmpty()) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidImage,
        message: "The clipboard does not contain a supported image.",
        operation: "pasteImages",
        recoverable: true,
      });
    }
    prepared.push(ingestNativeImage(native, "pasted-image.png", "pasteImages"));
  }

  const scope = imageSessionScope(input);
  return collectImages(
    prepared.map((item) => () => requireApplication().prepareImage({ ...item, ...scope })),
  );
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

  // Default-deny Chromium permissions. Allow only clipboard write so copy
  // buttons can use navigator.clipboard.writeText in the sandboxed renderer.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(isAllowedWebPermission(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) =>
    isAllowedWebPermission(permission),
  );
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
  installApplicationMenu();
  configureSession();
  registerPackagedNodeModulePath();
  const agentDirOverride = process.env.PHO_CODE_AGENT_DIR?.trim();
  const agentDir = path.resolve(agentDirOverride || path.join(app.getPath("userData"), "pi-agent"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const locator = resolveDesktopResourceLocator();
  const metadataStore = createFileMetadataStore(path.join(app.getPath("userData"), "app-metadata.json"));
  const metadata = metadataStore.load();
  const resourcesRoot = app.isPackaged
    ? process.resourcesPath
    : path.resolve(process.env.PHO_CODE_RESOURCES_DIR?.trim() || path.join(__dirname, "..", "..", "resources"));
  const githubMcpServerPath = resolveGitHubMcpServerPath(resourcesRoot);
  const rgPath = resolveRipgrepPath({ resourcesRoot });
  runtime = await createPhoCodeRuntime({
    agentDir,
    appliesToSharedPiAgentDir: Boolean(agentDirOverride),
    resourceLocator: locator,
    applicationDataDir: app.getPath("userData"),
    githubMcpEnabled: metadata.githubMcpEnabled,
    ...(metadata.githubMcpAccountLogin ? { githubMcpAccountLogin: metadata.githubMcpAccountLogin } : {}),
    ...(githubMcpServerPath ? { githubMcpServerPath } : {}),
    ...(rgPath ? { rgPath } : {}),
    ...(app.isPackaged ? { resourcesRoot: process.resourcesPath } : {}),
    deterministicTestModel: process.env.PHO_CODE_TEST_MODEL === "1",
    testHostUi: process.env.PHO_CODE_TEST_HOST_UI === "1",
    testOAuthFlow: process.env.PHO_CODE_TEST_AUTH === "1",
    openValidatedAuthUrl,
    ...(process.env.PHO_CODE_TEST_FEATURES === "1"
      ? {
          featureManifest: createDefaultFeatureManifest(locator, {
            agentDir,
            applicationDataDir: app.getPath("userData"),
            ...(app.isPackaged ? { resourcesRoot: process.resourcesPath } : {}),
          }),
        }
      : {}),
  });
  application = createApplicationService({
    runtime,
    versions: {
      appVersion: app.getVersion(),
      electron: process.versions.electron ?? PINNED_ELECTRON.version,
      embeddedNode: process.versions.node,
    },
    metadataStore,
    appearanceHost: { applyAppearance },
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
