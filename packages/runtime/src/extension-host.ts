import { randomUUID } from "node:crypto";
import type {
  ExtensionCommandContextActions,
  ExtensionError,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  RUNTIME_EVENT_TYPES,
  type HostDialogKind,
  type HostDialogRequest,
  type ExtensionNotification,
  type ResourceDiagnostic,
  type ResolveHostDialogInput,
  type RuntimeEvent,
} from "@pho-code/protocol";
import { splitHostDialogPresentation } from "./host-dialog-presentation";
import { displayToolNamesInText } from "./tool-display";

type DialogResult = boolean | string | undefined;

interface PendingDialog {
  kind: HostDialogKind;
  options?: readonly string[];
  resolve: (result: DialogResult) => void;
}

export interface ExtensionHost {
  bindCount: number;
  yoloActive: boolean;
  beginBinding(): void;
  endBinding(): void;
  createUiContext(): ExtensionUIContext;
  commandContextActions(): ExtensionCommandContextActions;
  onError(error: ExtensionError): void;
  takeDiagnostics(): ResourceDiagnostic[];
  hasPendingDialog(): boolean;
  resolveDialog(input: ResolveHostDialogInput): void;
  cancelPending(): void;
  dispose(): void;
}

export function createExtensionHost(input: {
  emit: (event: Omit<RuntimeEvent, "protocolVersion" | "sequence" | "occurredAt">) => void;
  waitForIdle: () => Promise<void>;
  newSession: () => Promise<{ cancelled: boolean }>;
  reload: () => Promise<void>;
}): ExtensionHost {
  const pending = new Map<string, PendingDialog>();
  const diagnostics: ResourceDiagnostic[] = [];
  let bindCount = 0;
  let disposed = false;
  let bindingExtensions = false;
  let yoloActive = false;

  function recordDiagnostic(diagnostic: ResourceDiagnostic): void {
    diagnostics.push(diagnostic);
  }

  const host: ExtensionHost = {
    get bindCount() {
      return bindCount;
    },
    get yoloActive() {
      return yoloActive;
    },
    beginBinding() {
      bindingExtensions = true;
    },
    endBinding() {
      bindingExtensions = false;
    },
    createUiContext() {
      bindCount += 1;
      return createUiContext({
        isBinding: () => bindingExtensions,
        disposed: () => disposed,
        emit: input.emit,
        pending,
        setPermissionStatus: (active) => {
          if (yoloActive === active) {
            return;
          }
          yoloActive = active;
          input.emit({
            type: RUNTIME_EVENT_TYPES.permissionStatus,
            payload: { yoloMode: active },
          });
        },
        unsupported: (capability) => {
          const message = `Unsupported host UI capability: ${capability}`;
          recordDiagnostic({
            type: "compatibility",
            message: `Extension requested unsupported host UI capability "${capability}".`,
          });
          throw new Error(message);
        },
      });
    },
    commandContextActions() {
      return {
        waitForIdle: () => input.waitForIdle(),
        newSession: () => input.newSession(),
        fork: async () => ({ cancelled: true }),
        navigateTree: async () => ({ cancelled: true }),
        switchSession: async () => ({ cancelled: true }),
        reload: () => input.reload(),
      };
    },
    onError(error) {
      const unsupported = error.error.includes("Unsupported host UI capability");
      recordDiagnostic({
        type: unsupported ? "compatibility" : "error",
        message: error.error,
        ...(typeof error.extensionPath === "string" ? { path: error.extensionPath } : {}),
      });
    },
    takeDiagnostics() {
      const copy = [...diagnostics];
      diagnostics.length = 0;
      return copy;
    },
    hasPendingDialog() {
      return pending.size > 0;
    },
    resolveDialog(resolution) {
      const dialog = pending.get(resolution.requestId);
      if (!dialog) {
        return;
      }
      const result = dialogResult(dialog, resolution);
      if (result === INVALID_DIALOG_RESULT) {
        return;
      }
      pending.delete(resolution.requestId);
      dialog.resolve(result);
      input.emit({
        type: RUNTIME_EVENT_TYPES.extensionDialogSettled,
        payload: { requestId: resolution.requestId },
      });
    },
    cancelPending() {
      for (const [requestId, dialog] of pending) {
        dialog.resolve(dialog.kind === "confirm" ? false : undefined);
        input.emit({
          type: RUNTIME_EVENT_TYPES.extensionDialogSettled,
          payload: { requestId },
        });
      }
      pending.clear();
    },
    dispose() {
      disposed = true;
      host.cancelPending();
    },
  };

  return host;
}

const INVALID_DIALOG_RESULT = Symbol("invalid-dialog-result");
const PERMISSION_STATUS_KEY = "pi-permission-system";
const PERMISSION_YOLO_STATUS = "yolo";

function dialogResult(
  dialog: PendingDialog,
  resolution: ResolveHostDialogInput,
): DialogResult | typeof INVALID_DIALOG_RESULT {
  if (resolution.cancelled === true) {
    return dialog.kind === "confirm" ? false : undefined;
  }
  switch (dialog.kind) {
    case "confirm":
      if (resolution.selected !== undefined || resolution.value !== undefined) {
        return INVALID_DIALOG_RESULT;
      }
      return resolution.confirmed === true;
    case "select": {
      if (resolution.confirmed !== undefined || resolution.value !== undefined) {
        return INVALID_DIALOG_RESULT;
      }
      if (typeof resolution.selected !== "string" || !dialog.options?.includes(resolution.selected)) {
        return INVALID_DIALOG_RESULT;
      }
      return resolution.selected;
    }
    case "input":
      if (resolution.confirmed !== undefined || resolution.selected !== undefined) {
        return INVALID_DIALOG_RESULT;
      }
      if (typeof resolution.value !== "string") {
        return INVALID_DIALOG_RESULT;
      }
      return resolution.value;
    default: {
      const exhaustive: never = dialog.kind;
      return exhaustive;
    }
  }
}

function createUiContext(input: {
  isBinding: () => boolean;
  disposed: () => boolean;
  emit: (event: Omit<RuntimeEvent, "protocolVersion" | "sequence" | "occurredAt">) => void;
  pending: Map<string, PendingDialog>;
  setPermissionStatus: (active: boolean) => void;
  unsupported: (capability: string) => never;
}): ExtensionUIContext {
  return {
    select: async (title, options, opts) => {
      const presentation = splitHostDialogPresentation(title);
      return requestDialog(input, {
        kind: "select",
        title: displayToolNamesInText(presentation.title),
        ...(presentation.message ? { message: displayToolNamesInText(presentation.message) } : {}),
        options,
        cancelledValue: undefined,
        timeout: opts?.timeout,
        signal: opts?.signal,
      });
    },
    confirm: async (title, message, opts) =>
      requestDialog(input, {
        kind: "confirm",
        title: displayToolNamesInText(title),
        message: displayToolNamesInText(message),
        cancelledValue: false,
        timeout: opts?.timeout,
        signal: opts?.signal,
      }),
    input: async (title, placeholder, opts) => {
      const presentation = splitHostDialogPresentation(title);
      return requestDialog(input, {
        kind: "input",
        title: displayToolNamesInText(presentation.title),
        ...(presentation.message ? { message: displayToolNamesInText(presentation.message) } : {}),
        placeholder,
        cancelledValue: undefined,
        timeout: opts?.timeout,
        signal: opts?.signal,
      });
    },
    notify: (message, type) => {
      const notification: ExtensionNotification = {
        requestId: randomUUID(),
        message,
        level: type ?? "info",
      };
      input.emit({
        type: RUNTIME_EVENT_TYPES.extensionNotification,
        payload: notification,
      });
    },
    onTerminalInput: () => () => undefined,
    setStatus: (key, text) => {
      if (key !== PERMISSION_STATUS_KEY) {
        return;
      }
      input.setPermissionStatus(text === PERMISSION_YOLO_STATUS);
    },
    setWorkingMessage: () => undefined,
    setWorkingVisible: () => undefined,
    setWorkingIndicator: () => undefined,
    setHiddenThinkingLabel: () => undefined,
    setWidget: () => undefined,
    setFooter: () => undefined,
    setHeader: () => undefined,
    setTitle: () => undefined,
    custom: async () => input.unsupported("custom"),
    pasteToEditor: () => undefined,
    setEditorText: () => undefined,
    getEditorText: () => "",
    editor: async () => {
      input.unsupported("editor");
    },
    addAutocompleteProvider: () => undefined,
    setEditorComponent: () => undefined,
    getEditorComponent: () => undefined,
    theme: extensionThemeStub,
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: "Theme switching is not available in this host." }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => undefined,
  };
}

function requestDialog<T extends DialogResult>(
  input: {
    isBinding: () => boolean;
    disposed: () => boolean;
    emit: (event: Omit<RuntimeEvent, "protocolVersion" | "sequence" | "occurredAt">) => void;
    pending: Map<string, PendingDialog>;
  },
  options: {
    kind: HostDialogKind;
    title: string;
    message?: string;
    options?: readonly string[];
    placeholder?: string;
    cancelledValue: T;
    timeout?: number;
    signal?: AbortSignal;
  },
): Promise<T> {
  if (input.disposed() || options.signal?.aborted) {
    return Promise.resolve(options.cancelledValue);
  }
  if (input.isBinding() && options.timeout === undefined) {
    return Promise.resolve(options.cancelledValue);
  }

  const requestId = randomUUID();
  const request: HostDialogRequest = {
    requestId,
    kind: options.kind,
    title: options.title,
  };
  if (options.message !== undefined) {
    request.message = options.message;
  }
  if (options.options) {
    request.options = [...options.options];
  }
  if (options.placeholder !== undefined) {
    request.placeholder = options.placeholder;
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
    const finish = (result: DialogResult) => {
      cleanup();
      input.pending.delete(requestId);
      input.emit({
        type: RUNTIME_EVENT_TYPES.extensionDialogSettled,
        payload: { requestId },
      });
      resolve(result as T);
    };
    const onAbort = () => finish(options.cancelledValue);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (options.timeout !== undefined) {
      timeoutId = setTimeout(() => finish(options.cancelledValue), options.timeout);
    }
    input.pending.set(requestId, {
      kind: options.kind,
      ...(options.options ? { options: [...options.options] } : {}),
      resolve: (result) => {
        cleanup();
        resolve(result as T);
      },
    });
    input.emit({
      type: RUNTIME_EVENT_TYPES.extensionDialogRequest,
      payload: request,
    });
  });
}

const extensionThemeStub = new Proxy(
  {},
  {
    get: () => (...args: unknown[]) => {
      const last = args.at(-1);
      return typeof last === "string" ? last : "";
    },
  },
) as Theme;
