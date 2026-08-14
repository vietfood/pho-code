import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, session, shell } from "electron";
import { createApplicationService, type ApplicationService } from "@pho-code/application";
import {
  type CancelProviderLoginInput,
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
  type AbortRunInput,
  type AppearanceSettings,
  type ArchiveSessionInput,
  type CommandResult,
  type CreateSessionInput,
  type GetSessionSnapshotInput,
  type ImportProviderApiKeyInput,
  type ListSessionCatalogInput,
  type ListWorkspaceSessionsInput,
  type LogoutProviderInput,
  type OpenProviderAuthLinkInput,
  type OpenRecentWorkspaceInput,
  type OpenSessionInput,
  type PasteImagesInput,
  type PickImagesInput,
  type PickImagesResult,
  type PrepareRemoveProjectInput,
  type PrepareRemoveSessionInput,
  type QueueFollowUpInput,
  type RemovePreparedImageInput,
  type RemoveProjectInput,
  type RemoveSessionInput,
  type ReorderRecentWorkspacesInput,
  type ResolveHostDialogInput,
  type RespondProviderAuthPromptInput,
  type RestoreSessionInput,
  type RewriteAssistantOutputInput,
  type SearchWorkspaceReferencesInput,
  type SendPromptInput,
  type SetSessionModelInput,
  type SetThinkingLevelInput,
  type StartProviderLoginInput,
  type SteerRunInput,
  type UpdateAppearanceSettingsInput,
  type UpdatePermissionSettingsInput,
  type UpdateSkillSourceSettingsInput,
  type UpdateGitHubMcpSettingsInput,
  type ImportGitHubPatInput,
} from "@pho-code/protocol";
import { decodePastedImageBase64 } from "./image-base64";
import {
  createDefaultFeatureManifest,
  createNodeModuleResourceLocator,
  createPackagedResourceLocator,
  createPhoCodeRuntime,
  resolveGitHubMcpServerPath,
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
  if (!override) {
    return;
  }

  app.setPath("userData", path.resolve(override));
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

  ipcMain.handle(IPC_CHANNELS.reorderRecentWorkspaces, async (event, payload: unknown) =>
    handleCommand("reorderRecentWorkspaces", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().reorderRecentWorkspaces(
        asRecord(payload) as unknown as ReorderRecentWorkspacesInput,
      );
    }),
  );

  ipcMain.handle(IPC_CHANNELS.listWorkspaceSessions, async (event, payload: unknown) =>
    handleCommand("listWorkspaceSessions", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().listWorkspaceSessions(asRecord(payload) as unknown as ListWorkspaceSessionsInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.listSessionCatalog, async (event, payload: unknown) =>
    handleCommand("listSessionCatalog", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().listSessionCatalog(asRecord(payload) as unknown as ListSessionCatalogInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.getSessionSnapshot, async (event, payload: unknown) =>
    handleCommand("getSessionSnapshot", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().getSessionSnapshot(asRecord(payload) as unknown as GetSessionSnapshotInput);
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

  ipcMain.handle(IPC_CHANNELS.archiveSession, async (event, payload: unknown) =>
    handleCommand("archiveSession", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().archiveSession(asRecord(payload) as unknown as ArchiveSessionInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.restoreSession, async (event, payload: unknown) =>
    handleCommand("restoreSession", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().restoreSession(asRecord(payload) as unknown as RestoreSessionInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.prepareRemoveSession, async (event, payload: unknown) =>
    handleCommand("prepareRemoveSession", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().prepareRemoveSession(asRecord(payload) as unknown as PrepareRemoveSessionInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.removeSession, async (event, payload: unknown) =>
    handleCommand("removeSession", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().removeSession(asRecord(payload) as unknown as RemoveSessionInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.prepareRemoveProject, async (event, payload: unknown) =>
    handleCommand("prepareRemoveProject", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().prepareRemoveProject(asRecord(payload) as unknown as PrepareRemoveProjectInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.removeProject, async (event, payload: unknown) =>
    handleCommand("removeProject", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().removeProject(asRecord(payload) as unknown as RemoveProjectInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.sendPrompt, async (event, payload: unknown) =>
    handleCommand("sendPrompt", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().sendPrompt(asRecord(payload) as unknown as SendPromptInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.steerRun, async (event, payload: unknown) =>
    handleCommand("steerRun", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().steerRun(asRecord(payload) as unknown as SteerRunInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.queueFollowUp, async (event, payload: unknown) =>
    handleCommand("queueFollowUp", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().queueFollowUp(asRecord(payload) as unknown as QueueFollowUpInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.pickImages, async (event, payload: unknown) =>
    handleCommand("pickImages", async () => {
      assertTrustedSender(event, trustedRenderer);
      const scope = imageSessionScope(asRecord(payload) as PickImagesInput);
      const window = BrowserWindow.fromWebContents(event.sender);
      const result = window
        ? await dialog.showOpenDialog(window, imageOpenDialogOptions())
        : await dialog.showOpenDialog(imageOpenDialogOptions());
      if (result.canceled || result.filePaths.length === 0) {
        return { images: [] };
      }
      const images = [];
      let firstError: unknown;
      for (const filePath of result.filePaths.slice(0, MAX_PREPARED_IMAGES)) {
        try {
          const prepared = await ingestImageFile(filePath);
          images.push(await requireApplication().prepareImage({ ...prepared, ...scope }));
        } catch (error) {
          firstError ??= error;
        }
      }
      if (images.length === 0 && firstError) {
        throw firstError;
      }
      return { images };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.pasteImages, async (event, payload: unknown) =>
    handleCommand("pasteImages", async () => {
      assertTrustedSender(event, trustedRenderer);
      return ingestPastedImages(asRecord(payload) as unknown as PasteImagesInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.removePreparedImage, async (event, payload: unknown) =>
    handleCommand("removePreparedImage", async () => {
      assertTrustedSender(event, trustedRenderer);
      await requireApplication().removePreparedImage(asRecord(payload) as unknown as RemovePreparedImageInput);
      return null;
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

  ipcMain.handle(IPC_CHANNELS.rewriteAssistantOutput, async (event, payload: unknown) =>
    handleCommand("rewriteAssistantOutput", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().rewriteAssistantOutput(asRecord(payload) as unknown as RewriteAssistantOutputInput);
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

  ipcMain.handle(IPC_CHANNELS.trustProjectPermissionRules, async (event) =>
    handleCommand("trustProjectPermissionRules", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().trustProjectPermissionRules();
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

  ipcMain.handle(IPC_CHANNELS.listProviderAccounts, (event) =>
    handleCommand("listProviderAccounts", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().listProviderAccounts();
    }),
  );

  ipcMain.handle(IPC_CHANNELS.startProviderLogin, async (event, payload: unknown) =>
    handleCommand("startProviderLogin", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().startProviderLogin(asRecord(payload) as unknown as StartProviderLoginInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.respondProviderAuthPrompt, async (event, payload: unknown) =>
    handleCommand("respondProviderAuthPrompt", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().respondProviderAuthPrompt(asRecord(payload) as unknown as RespondProviderAuthPromptInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.openProviderAuthLink, async (event, payload: unknown) =>
    handleCommand("openProviderAuthLink", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().openProviderAuthLink(asRecord(payload) as unknown as OpenProviderAuthLinkInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.cancelProviderLogin, async (event, payload: unknown) =>
    handleCommand("cancelProviderLogin", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().cancelProviderLogin(asRecord(payload) as unknown as CancelProviderLoginInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.logoutProvider, async (event, payload: unknown) =>
    handleCommand("logoutProvider", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().logoutProvider(asRecord(payload) as unknown as LogoutProviderInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.searchWorkspaceReferences, async (event, payload: unknown) =>
    handleCommand("searchWorkspaceReferences", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().searchWorkspaceReferences(asRecord(payload) as unknown as SearchWorkspaceReferencesInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.updateSkillSourceSettings, async (event, payload: unknown) =>
    handleCommand("updateSkillSourceSettings", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().updateSkillSourceSettings(asRecord(payload) as unknown as UpdateSkillSourceSettingsInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.refreshSkills, async (event) =>
    handleCommand("refreshSkills", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().refreshSkills();
    }),
  );

  ipcMain.handle(IPC_CHANNELS.updateGitHubMcpSettings, async (event, payload: unknown) =>
    handleCommand("updateGitHubMcpSettings", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().updateGitHubMcpSettings(asRecord(payload) as unknown as UpdateGitHubMcpSettingsInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.importGitHubPat, async (event, payload: unknown) =>
    handleCommand("importGitHubPat", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().importGitHubPat(asRecord(payload) as unknown as ImportGitHubPatInput);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.removeGitHubPat, async (event) =>
    handleCommand("removeGitHubPat", async () => {
      assertTrustedSender(event, trustedRenderer);
      return requireApplication().removeGitHubPat();
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

async function ingestPastedImages(input: PasteImagesInput): Promise<PickImagesResult> {
  const supplied = Array.isArray(input.images) ? input.images : [];
  const prepared = [];
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
  const images = [];
  let firstError: unknown;
  for (const item of prepared) {
    try {
      images.push(await requireApplication().prepareImage({ ...item, ...scope }));
    } catch (error) {
      firstError ??= error;
    }
  }
  if (images.length === 0 && firstError) {
    throw firstError;
  }
  return { images };
}

function imageOpenDialogOptions(): Electron.OpenDialogOptions {
  return {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
    ],
  };
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
  configureSession();
  registerPackagedNodeModulePath();
  const agentDirOverride = process.env.PHO_CODE_AGENT_DIR?.trim();
  const agentDir = path.resolve(agentDirOverride || path.join(app.getPath("userData"), "pi-agent"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const locator = resolveDesktopResourceLocator();
  const metadataStore = createFileMetadataStore(path.join(app.getPath("userData"), "app-metadata.json"));
  const metadata = metadataStore.load();
  const githubMcpResourcesRoot = app.isPackaged
    ? process.resourcesPath
    : path.resolve(process.env.PHO_CODE_RESOURCES_DIR?.trim() || path.join(__dirname, "..", "..", "resources"));
  const githubMcpServerPath = resolveGitHubMcpServerPath(githubMcpResourcesRoot);
  runtime = await createPhoCodeRuntime({
    agentDir,
    appliesToSharedPiAgentDir: Boolean(agentDirOverride),
    resourceLocator: locator,
    applicationDataDir: app.getPath("userData"),
    githubMcpEnabled: metadata.githubMcpEnabled,
    ...(metadata.githubMcpAccountLogin ? { githubMcpAccountLogin: metadata.githubMcpAccountLogin } : {}),
    ...(githubMcpServerPath ? { githubMcpServerPath } : {}),
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
