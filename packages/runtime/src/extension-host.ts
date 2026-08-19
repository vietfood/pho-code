import { randomUUID } from "node:crypto";
import type {
  ExtensionCommandContextActions,
  ExtensionError,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  failCommand,
  RUNTIME_EVENT_TYPES,
  type AskUserQuestion,
  type AskUserQuestionnaireDetails,
  type HostDialogKind,
  type HostDialogRequest,
  type ExtensionNotification,
  type ResourceDiagnostic,
  type ResolveHostDialogInput,
  type RuntimeEvent,
} from "@pho-code/protocol";
import { submittedAnswersMatchQuestions } from "./ask-user-question";
import type { QuestionnaireHostUI } from "./ask-user-present";
import { splitHostDialogPresentation } from "./host-dialog-presentation";
import { displayToolNamesInText } from "./tool-display";

type DialogResult = boolean | string | AskUserQuestionnaireDetails | undefined;

interface PendingDialog {
  kind: HostDialogKind;
  options?: readonly string[];
  questions?: readonly AskUserQuestion[];
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
  let followUpInput: { fromRequestId: string; value: string } | undefined;

  function takeFollowUpInput(): string | undefined {
    const value = followUpInput?.value;
    followUpInput = undefined;
    return value;
  }

  function clearFollowUpInput(): void {
    followUpInput = undefined;
  }

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
        takeStashedInputAnswer: takeFollowUpInput,
        clearStashedInputAnswer: clearFollowUpInput,
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
      const cancelled = async () => ({ cancelled: true });
      return {
        waitForIdle: () => input.waitForIdle(),
        newSession: () => input.newSession(),
        fork: cancelled,
        navigateTree: cancelled,
        switchSession: cancelled,
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
        if (resolution.sessionId) {
          failCommand("resolveHostDialog", "That permission request is not pending for this chat.");
        }
        return;
      }
      const result = dialogResult(dialog, resolution);
      if (result === INVALID_DIALOG_RESULT) {
        return;
      }
      if (
        dialog.kind === "select" &&
        resolution.cancelled !== true &&
        typeof resolution.value === "string"
      ) {
        followUpInput = { fromRequestId: resolution.requestId, value: resolution.value };
      }
      pending.delete(resolution.requestId);
      dialog.resolve(result);
      input.emit({
        type: RUNTIME_EVENT_TYPES.extensionDialogSettled,
        payload: { requestId: resolution.requestId },
      });
    },
    cancelPending() {
      followUpInput = undefined;
      for (const [requestId, dialog] of pending) {
        dialog.resolve(CANCELLED_DIALOG_RESULTS[dialog.kind]);
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

const CANCELLED_DIALOG_RESULTS: Record<HostDialogKind, DialogResult> = {
  confirm: false,
  questionnaire: { cancelled: true, answers: [] },
  select: undefined,
  input: undefined,
};

const DIALOG_RESULT_FIELDS = ["confirmed", "selected", "value", "answers"] as const;

function foreignFieldsSet(resolution: ResolveHostDialogInput, allowed: readonly string[]): boolean {
  return DIALOG_RESULT_FIELDS.some((field) => !allowed.includes(field) && resolution[field] !== undefined);
}

function dialogResult(
  dialog: PendingDialog,
  resolution: ResolveHostDialogInput,
): DialogResult | typeof INVALID_DIALOG_RESULT {
  if (resolution.cancelled === true) {
    return CANCELLED_DIALOG_RESULTS[dialog.kind];
  }
  switch (dialog.kind) {
    case "confirm":
      if (foreignFieldsSet(resolution, ["confirmed"])) {
        return INVALID_DIALOG_RESULT;
      }
      return resolution.confirmed === true;
    case "select": {
      if (foreignFieldsSet(resolution, ["selected", "value"])) {
        return INVALID_DIALOG_RESULT;
      }
      if (resolution.value !== undefined && typeof resolution.value !== "string") {
        return INVALID_DIALOG_RESULT;
      }
      if (typeof resolution.selected !== "string" || !dialog.options?.includes(resolution.selected)) {
        return INVALID_DIALOG_RESULT;
      }
      return resolution.selected;
    }
    case "input":
      if (foreignFieldsSet(resolution, ["value"])) {
        return INVALID_DIALOG_RESULT;
      }
      if (typeof resolution.value !== "string") {
        return INVALID_DIALOG_RESULT;
      }
      return resolution.value;
    case "questionnaire": {
      if (foreignFieldsSet(resolution, ["answers"])) {
        return INVALID_DIALOG_RESULT;
      }
      if (!dialog.questions || !Array.isArray(resolution.answers)) {
        return INVALID_DIALOG_RESULT;
      }
      if (!submittedAnswersMatchQuestions(dialog.questions, resolution.answers)) {
        return INVALID_DIALOG_RESULT;
      }
      return { cancelled: false, answers: [...resolution.answers] };
    }
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
  takeStashedInputAnswer: () => string | undefined;
  clearStashedInputAnswer: () => void;
  setPermissionStatus: (active: boolean) => void;
  unsupported: (capability: string) => never;
}): ExtensionUIContext & QuestionnaireHostUI {
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
    questionnaire: (questions, opts) =>
      requestQuestionnaire(input, {
        questions,
        ...(opts?.signal ? { signal: opts.signal } : {}),
      }),
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

interface DialogHostInput {
  isBinding: () => boolean;
  disposed: () => boolean;
  emit: (event: Omit<RuntimeEvent, "protocolVersion" | "sequence" | "occurredAt">) => void;
  pending: Map<string, PendingDialog>;
  takeStashedInputAnswer: () => string | undefined;
  clearStashedInputAnswer: () => void;
}

function openPendingDialog<T extends DialogResult>(
  input: DialogHostInput,
  request: HostDialogRequest,
  pendingExtras: { options?: readonly string[]; questions?: readonly AskUserQuestion[] },
  cancelledValue: T,
  project: (result: DialogResult) => T,
  signal?: AbortSignal,
  timeout?: number,
): Promise<T> {
  const requestId = request.requestId;
  return new Promise((resolve) => {
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
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
      resolve(project(result));
    };
    const onAbort = () => finish(cancelledValue);
    signal?.addEventListener("abort", onAbort, { once: true });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeout !== undefined) {
      timeoutId = setTimeout(() => finish(cancelledValue), timeout);
    }
    input.pending.set(requestId, {
      kind: request.kind,
      ...pendingExtras,
      resolve: (result) => {
        cleanup();
        resolve(project(result));
      },
    });
    input.emit({
      type: RUNTIME_EVENT_TYPES.extensionDialogRequest,
      payload: request,
    });
  });
}

function requestDialog<T extends DialogResult>(
  input: DialogHostInput,
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
  if (options.kind === "input") {
    const stashed = input.takeStashedInputAnswer();
    if (stashed !== undefined) {
      return Promise.resolve(stashed as T);
    }
  } else {
    input.clearStashedInputAnswer();
  }

  const request: HostDialogRequest = {
    requestId: randomUUID(),
    kind: options.kind,
    title: options.title,
    ...(options.message !== undefined ? { message: options.message } : {}),
    ...(options.options ? { options: [...options.options] } : {}),
    ...(options.placeholder !== undefined ? { placeholder: options.placeholder } : {}),
  };
  return openPendingDialog(
    input,
    request,
    options.options ? { options: [...options.options] } : {},
    options.cancelledValue,
    (result) => result as T,
    options.signal,
    options.timeout,
  );
}

function requestQuestionnaire(
  input: DialogHostInput,
  options: {
    questions: readonly AskUserQuestion[];
    signal?: AbortSignal;
  },
): Promise<AskUserQuestionnaireDetails | undefined> {
  const cancelledValue: AskUserQuestionnaireDetails = { cancelled: true, answers: [] };
  if (input.disposed() || options.signal?.aborted) {
    return Promise.resolve(cancelledValue);
  }
  if (input.isBinding()) {
    return Promise.resolve(undefined);
  }
  input.clearStashedInputAnswer();

  const request: HostDialogRequest = {
    requestId: randomUUID(),
    kind: "questionnaire",
    title: options.questions[0]?.question ?? "The agent has a question",
    questions: [...options.questions],
  };
  return openPendingDialog(
    input,
    request,
    { questions: [...options.questions] },
    cancelledValue,
    asQuestionnaireResult,
    options.signal,
  );
}

function asQuestionnaireResult(result: DialogResult): AskUserQuestionnaireDetails | undefined {
  if (result && typeof result === "object" && "cancelled" in result && Array.isArray(result.answers)) {
    return result;
  }
  return undefined;
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
