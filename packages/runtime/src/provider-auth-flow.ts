import {
  createHarnessError,
  HARNESS_ERROR_CODES,
  hostnameFromHttpUrl,
  isSafeHttpUrl,
  MAX_PROVIDER_AUTH_MESSAGE,
  MAX_PROVIDER_AUTH_OPTIONS,
  MAX_PROVIDER_AUTH_PROGRESS,
  MAX_PROVIDER_AUTH_VALUE,
  type CancelProviderLoginInput,
  type HarnessError,
  type OpenProviderAuthLinkInput,
  type ProviderAuthDeviceCode,
  type ProviderAuthFlowPhase,
  type ProviderAuthFlowSnapshot,
  type ProviderAuthLink,
  type ProviderAuthMethod,
  type ProviderAuthPrompt,
  type ProviderAuthPromptKind,
  type ProviderAuthSelectOption,
  type RespondProviderAuthPromptInput,
} from "@pho-code/protocol";

export interface HarnessAuthSelectOption {
  id: string;
  label: string;
  description?: string;
}

export type HarnessAuthPrompt = {
  signal?: AbortSignal;
} & (
  | { type: "text"; message: string; placeholder?: string }
  | { type: "secret"; message: string; placeholder?: string }
  | { type: "select"; message: string; options: readonly HarnessAuthSelectOption[] }
  | { type: "manual_code"; message: string; placeholder?: string }
);

export type HarnessAuthEvent =
  | { type: "info"; message: string; links?: readonly { url: string; label?: string }[] }
  | { type: "auth_url"; url: string; instructions?: string }
  | {
      type: "device_code";
      userCode: string;
      verificationUri: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    }
  | { type: "progress"; message: string };

export interface HarnessAuthInteraction {
  signal?: AbortSignal;
  prompt(prompt: HarnessAuthPrompt): Promise<string>;
  notify(event: HarnessAuthEvent): void;
}

export interface ProviderAuthFlowHost {
  openValidatedUrl(url: string): void;
  now(): Date;
  randomId(): string;
}

interface PendingPrompt {
  promptId: string;
  kind: ProviderAuthPromptKind;
  message: string;
  placeholder?: string;
  options?: ProviderAuthSelectOption[];
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  promptSignal?: AbortSignal;
  onPromptAbort?: () => void;
}

interface RetainedLink {
  url: string;
  hostname: string;
  label?: string;
  autoOpened: boolean;
}

interface ActiveFlow {
  flowId: string;
  providerId: string;
  method: ProviderAuthMethod;
  phase: ProviderAuthFlowPhase;
  revision: number;
  startedAt: string;
  abort: AbortController;
  loginDone: Promise<void>;
  pendingPrompt?: PendingPrompt;
  links: Map<string, RetainedLink>;
  deviceCode?: ProviderAuthDeviceCode;
  progress?: string;
  error?: HarnessError;
  canaries: string[];
}

export function createProviderAuthFlow(input: {
  host: ProviderAuthFlowHost;
  login: (providerId: string, method: ProviderAuthMethod, interaction: HarnessAuthInteraction) => Promise<void>;
  emit: (snapshot: ProviderAuthFlowSnapshot) => void;
  onSettled?: (snapshot: ProviderAuthFlowSnapshot) => Promise<void> | void;
}): {
  snapshot(): ProviderAuthFlowSnapshot | null;
  canaries(): readonly string[];
  retainedUrl(flowId: string, linkId: string): string | undefined;
  start(command: { providerId: string; method: ProviderAuthMethod; runActive: boolean }): Promise<ProviderAuthFlowSnapshot>;
  respond(command: RespondProviderAuthPromptInput): Promise<ProviderAuthFlowSnapshot>;
  openLink(command: OpenProviderAuthLinkInput): Promise<void>;
  cancel(command: CancelProviderLoginInput): Promise<ProviderAuthFlowSnapshot>;
  dispose(): Promise<void>;
} {
  let active: ActiveFlow | undefined;
  let lastSnapshot: ProviderAuthFlowSnapshot | null = null;

  function snapshotOf(flow: ActiveFlow): ProviderAuthFlowSnapshot {
    const snapshot: ProviderAuthFlowSnapshot = {
      flowId: flow.flowId,
      providerId: flow.providerId,
      method: flow.method,
      phase: flow.phase,
      revision: flow.revision,
      startedAt: flow.startedAt,
      updatedAt: input.host.now().toISOString(),
    };
    if (flow.pendingPrompt && !flow.pendingPrompt.settled) {
      snapshot.prompt = publicPrompt(flow.pendingPrompt);
    }
    const links = publicLinks(flow);
    if (links.length > 0) {
      snapshot.links = links;
    }
    if (flow.deviceCode) {
      snapshot.deviceCode = { ...flow.deviceCode };
    }
    if (flow.progress) {
      snapshot.progress = flow.progress;
    }
    if (flow.error) {
      snapshot.error = flow.error;
    }
    return snapshot;
  }

  function emit(flow: ActiveFlow): ProviderAuthFlowSnapshot {
    flow.revision += 1;
    lastSnapshot = snapshotOf(flow);
    assertNoCanaries(lastSnapshot, flow.canaries, "providerAuthFlow");
    input.emit(lastSnapshot);
    return lastSnapshot;
  }

  function requireActive(flowId: string, operation: string): ActiveFlow {
    if (!active || active.flowId !== flowId) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidCommand,
        message: "That login flow is no longer active.",
        operation,
        recoverable: true,
      });
    }
    if (active.phase === "completed" || active.phase === "failed" || active.phase === "cancelled") {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidCommand,
        message: "That login flow has already finished.",
        operation,
        recoverable: true,
      });
    }
    return active;
  }

  async function settle(flow: ActiveFlow, phase: "completed" | "failed" | "cancelled", error?: HarnessError): Promise<ProviderAuthFlowSnapshot> {
    if (flow !== active) {
      return snapshotOf(flow);
    }
    rejectPending(flow, cancelledError("The login prompt is no longer available."));
    invalidateLinks(flow);
    flow.phase = phase;
    if (error) {
      flow.error = redactHarnessError(error, flow.canaries);
    }
    const snapshot = emit(flow);
    active = undefined;
    await input.onSettled?.(snapshot);
    return snapshot;
  }

  function createInteraction(flow: ActiveFlow): HarnessAuthInteraction {
    return {
      signal: flow.abort.signal,
      prompt(prompt) {
        return enqueuePrompt(flow, prompt);
      },
      notify(event) {
        if (flow !== active || flow.abort.signal.aborted) {
          return;
        }
        applyNotify(flow, event);
      },
    };
  }

  function enqueuePrompt(flow: ActiveFlow, prompt: HarnessAuthPrompt): Promise<string> {
    if (flow !== active || flow.abort.signal.aborted) {
      return Promise.reject(cancelledError("Login cancelled"));
    }
    if (flow.pendingPrompt && !flow.pendingPrompt.settled) {
      return Promise.reject(
        createHarnessError({
          code: HARNESS_ERROR_CODES.providerAuthFailed,
          message: "A login prompt is already waiting for a response.",
          operation: "startProviderLogin",
          recoverable: true,
        }),
      );
    }

    const kind = promptKind(prompt);
    const promptId = input.host.randomId();
    return new Promise<string>((resolve, reject) => {
      const pending: PendingPrompt = {
        promptId,
        kind,
        message: boundText(prompt.message, MAX_PROVIDER_AUTH_MESSAGE),
        resolve,
        reject,
        settled: false,
      };
      if ("placeholder" in prompt && prompt.placeholder) {
        pending.placeholder = boundText(prompt.placeholder, MAX_PROVIDER_AUTH_MESSAGE);
      }
      if (prompt.type === "select") {
        pending.options = projectSelectOptions(prompt.options);
      }
      if (prompt.signal) {
        const onPromptAbort = () => {
          if (pending.settled) {
            return;
          }
          pending.settled = true;
          if (flow.pendingPrompt === pending) {
            flow.pendingPrompt = undefined;
            if (flow.phase === "awaiting_prompt") {
              flow.phase = flow.deviceCode ? "polling" : flow.links.size > 0 ? "awaiting_external" : "starting";
            }
            emit(flow);
          }
          pending.reject(cancelledError("The login prompt was withdrawn."));
        };
        pending.promptSignal = prompt.signal;
        pending.onPromptAbort = onPromptAbort;
        if (prompt.signal.aborted) {
          onPromptAbort();
          return;
        }
        prompt.signal.addEventListener("abort", onPromptAbort, { once: true });
      }
      flow.pendingPrompt = pending;
      flow.phase = "awaiting_prompt";
      emit(flow);
    });
  }

  function applyNotify(flow: ActiveFlow, event: HarnessAuthEvent): void {
    switch (event.type) {
      case "info": {
        flow.progress = boundText(event.message, MAX_PROVIDER_AUTH_PROGRESS);
        retainEventLinks(flow, event.links);
        emit(flow);
        return;
      }
      case "auth_url": {
        const linkId = retainUrl(flow, event.url, event.instructions ? "Open browser" : undefined);
        if (event.instructions) {
          flow.progress = boundText(event.instructions, MAX_PROVIDER_AUTH_PROGRESS);
        }
        if (flow.phase !== "awaiting_prompt") {
          flow.phase = "awaiting_external";
        }
        emit(flow);
        if (linkId) {
          autoOpen(flow, linkId);
        }
        return;
      }
      case "device_code": {
        const verificationLinkId = retainUrl(flow, event.verificationUri, "Open verification page");
        const deviceCode: ProviderAuthDeviceCode = {
          userCode: boundText(event.userCode, 64),
        };
        if (typeof event.expiresInSeconds === "number" && Number.isFinite(event.expiresInSeconds) && event.expiresInSeconds > 0) {
          deviceCode.expiresAt = new Date(input.host.now().getTime() + event.expiresInSeconds * 1000).toISOString();
        }
        if (typeof event.intervalSeconds === "number" && Number.isFinite(event.intervalSeconds)) {
          deviceCode.intervalSeconds = event.intervalSeconds;
        }
        if (verificationLinkId) {
          deviceCode.verificationLinkId = verificationLinkId;
        }
        flow.deviceCode = deviceCode;
        if (flow.phase !== "awaiting_prompt") {
          flow.phase = "polling";
        }
        emit(flow);
        if (verificationLinkId) {
          autoOpen(flow, verificationLinkId);
        }
        return;
      }
      case "progress": {
        flow.progress = boundText(event.message, MAX_PROVIDER_AUTH_PROGRESS);
        emit(flow);
        return;
      }
      default: {
        const exhaustive: never = event;
        return exhaustive;
      }
    }
  }

  function retainEventLinks(flow: ActiveFlow, links: readonly { url: string; label?: string }[] | undefined): void {
    if (!links) {
      return;
    }
    for (const link of links) {
      retainUrl(flow, link.url, link.label);
    }
  }

  function retainUrl(flow: ActiveFlow, url: string, label?: string): string | undefined {
    if (!isSafeHttpUrl(url)) {
      return undefined;
    }
    flow.canaries.push(url);
    const hostname = hostnameFromHttpUrl(url);
    if (!hostname) {
      return undefined;
    }
    const linkId = input.host.randomId();
    const retained: RetainedLink = { url, hostname, autoOpened: false };
    if (label) {
      retained.label = boundText(label, 80);
    }
    flow.links.set(linkId, retained);
    return linkId;
  }

  function autoOpen(flow: ActiveFlow, linkId: string): void {
    const retained = flow.links.get(linkId);
    if (!retained || retained.autoOpened) {
      return;
    }
    retained.autoOpened = true;
    input.host.openValidatedUrl(retained.url);
  }

  function publicPrompt(pending: PendingPrompt): ProviderAuthPrompt {
    const prompt: ProviderAuthPrompt = {
      promptId: pending.promptId,
      kind: pending.kind,
      message: pending.message,
    };
    if (pending.placeholder) {
      prompt.placeholder = pending.placeholder;
    }
    if (pending.options) {
      prompt.options = pending.options;
    }
    return prompt;
  }

  function publicLinks(flow: ActiveFlow): ProviderAuthLink[] {
    const links: ProviderAuthLink[] = [];
    for (const [linkId, retained] of flow.links) {
      const link: ProviderAuthLink = { linkId, hostname: retained.hostname };
      if (retained.label) {
        link.label = retained.label;
      }
      links.push(link);
    }
    return links;
  }

  return {
    snapshot() {
      return active ? snapshotOf(active) : null;
    },
    canaries() {
      return active?.canaries ?? [];
    },
    retainedUrl(flowId, linkId) {
      if (!active || active.flowId !== flowId) {
        return undefined;
      }
      return active.links.get(linkId)?.url;
    },
    async start(command) {
      if (command.runActive) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "Wait for the current run to finish before changing provider accounts.",
          operation: "startProviderLogin",
          recoverable: true,
        });
      }
      if (active) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "A provider login is already in progress.",
          operation: "startProviderLogin",
          recoverable: true,
        });
      }
      const startedAt = input.host.now().toISOString();
      const flow: ActiveFlow = {
        flowId: input.host.randomId(),
        providerId: command.providerId,
        method: command.method,
        phase: "starting",
        revision: 0,
        startedAt,
        abort: new AbortController(),
        loginDone: Promise.resolve(),
        links: new Map(),
        canaries: [],
      };
      active = flow;
      const starting = emit(flow);
      flow.loginDone = input
        .login(command.providerId, command.method, createInteraction(flow))
        .then(async () => {
          if (flow !== active) {
            return;
          }
          await settle(flow, "completed");
        })
        .catch(async (error: unknown) => {
          if (flow !== active && !flow.abort.signal.aborted) {
            return;
          }
          if (isCancellation(error, flow.abort.signal)) {
            await settle(flow, "cancelled");
            return;
          }
          await settle(
            flow,
            "failed",
            createHarnessError({
              code: HARNESS_ERROR_CODES.providerAuthFailed,
              message: error instanceof Error ? error.message : "Provider login failed.",
              operation: "startProviderLogin",
              recoverable: true,
            }),
          );
        });
      await Promise.resolve();
      return lastSnapshot ?? starting;
    },
    async respond(command) {
      const flow = requireActive(command.flowId, "respondProviderAuthPrompt");
      const pending = flow.pendingPrompt;
      if (!pending || pending.settled || pending.promptId !== command.promptId) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "That login prompt is no longer waiting for a response.",
          operation: "respondProviderAuthPrompt",
          recoverable: true,
        });
      }
      const value = normalizePromptValue(pending, command.value);
      if (pending.kind === "secret" || pending.kind === "manual_code") {
        flow.canaries.push(value);
      }
      pending.settled = true;
      pending.promptSignal?.removeEventListener("abort", pending.onPromptAbort ?? (() => undefined));
      flow.pendingPrompt = undefined;
      if (flow.deviceCode) {
        flow.phase = "polling";
      } else if (flow.links.size > 0) {
        flow.phase = "awaiting_external";
      } else {
        flow.phase = "starting";
      }
      const snapshot = emit(flow);
      pending.resolve(value);
      return snapshot;
    },
    async openLink(command) {
      const flow = requireActive(command.flowId, "openProviderAuthLink");
      const retained = flow.links.get(command.linkId);
      if (!retained) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "That login link is no longer available.",
          operation: "openProviderAuthLink",
          recoverable: true,
        });
      }
      input.host.openValidatedUrl(retained.url);
    },
    async cancel(command) {
      const flow = requireActive(command.flowId, "cancelProviderLogin");
      flow.abort.abort();
      rejectPending(flow, cancelledError("Login cancelled"));
      await flow.loginDone.catch(() => undefined);
      if (active === flow) {
        return settle(flow, "cancelled");
      }
      return snapshotOf(flow);
    },
    async dispose() {
      const flow = active;
      if (!flow) {
        return;
      }
      flow.abort.abort();
      rejectPending(flow, cancelledError("Login cancelled"));
      await flow.loginDone.catch(() => undefined);
      if (active === flow) {
        await settle(flow, "cancelled");
      }
    },
  };
}

export function assertNoCanaries(value: unknown, canaries: readonly string[], operation: string): void {
  if (canaries.length === 0) {
    return;
  }
  const serialized = JSON.stringify(value);
  for (const canary of canaries) {
    if (canary.length > 0 && serialized.includes(canary)) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidSnapshot,
        message: "Refused to return a secret.",
        operation,
      });
    }
  }
}

function promptKind(prompt: HarnessAuthPrompt): ProviderAuthPromptKind {
  switch (prompt.type) {
    case "select":
    case "text":
    case "secret":
    case "manual_code":
      return prompt.type;
    default: {
      const exhaustive: never = prompt;
      return exhaustive;
    }
  }
}

function projectSelectOptions(options: readonly HarnessAuthSelectOption[]): ProviderAuthSelectOption[] {
  return options.slice(0, MAX_PROVIDER_AUTH_OPTIONS).map((option) => {
    const projected: ProviderAuthSelectOption = {
      id: boundText(option.id, 128),
      label: boundText(option.label, 200),
    };
    if (option.description) {
      projected.description = boundText(option.description, MAX_PROVIDER_AUTH_MESSAGE);
    }
    return projected;
  });
}

function normalizePromptValue(pending: PendingPrompt, raw: string): string {
  if (typeof raw !== "string") {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "A prompt response is required.",
      operation: "respondProviderAuthPrompt",
      recoverable: true,
    });
  }
  if (raw.length > MAX_PROVIDER_AUTH_VALUE) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "That response is too long.",
      operation: "respondProviderAuthPrompt",
      recoverable: true,
    });
  }
  if (pending.kind === "select") {
    const value = raw.trim();
    if (!pending.options?.some((option) => option.id === value)) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidCommand,
        message: "Choose one of the listed login options.",
        operation: "respondProviderAuthPrompt",
        recoverable: true,
      });
    }
    return value;
  }
  if (pending.kind === "text") {
    const value = raw.trim();
    if (value.length === 0) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidCommand,
        message: "A response is required.",
        operation: "respondProviderAuthPrompt",
        recoverable: true,
      });
    }
    return value;
  }
  return raw;
}

function rejectPending(flow: ActiveFlow, error: HarnessError): void {
  const pending = flow.pendingPrompt;
  if (!pending || pending.settled) {
    return;
  }
  pending.settled = true;
  pending.promptSignal?.removeEventListener("abort", pending.onPromptAbort ?? (() => undefined));
  flow.pendingPrompt = undefined;
  pending.reject(error);
}

function invalidateLinks(flow: ActiveFlow): void {
  flow.links.clear();
}

function boundText(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function cancelledError(message: string): HarnessError {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.providerAuthFailed,
    message,
    operation: "cancelProviderLogin",
    recoverable: true,
  });
}

function isCancellation(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) {
    return true;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /cancell?ed|aborted/i.test(message);
}

function redactHarnessError(error: HarnessError, canaries: readonly string[]): HarnessError {
  let message = error.message;
  for (const canary of canaries) {
    if (canary.length >= 8) {
      message = message.split(canary).join("[redacted]");
    }
  }
  return createHarnessError({
    code: error.code,
    message: boundText(message, MAX_PROVIDER_AUTH_MESSAGE),
    operation: error.operation,
    recoverable: error.recoverable,
    ...(error.details ? { details: error.details } : {}),
  });
}
