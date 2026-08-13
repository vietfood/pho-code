import type { HarnessError } from "./errors";

export const PROVIDER_AUTH_METHODS = ["api_key", "oauth"] as const;
export type ProviderAuthMethod = (typeof PROVIDER_AUTH_METHODS)[number];

export const PROVIDER_AUTH_FLOW_PHASES = [
  "idle",
  "starting",
  "awaiting_prompt",
  "awaiting_external",
  "polling",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ProviderAuthFlowPhase = (typeof PROVIDER_AUTH_FLOW_PHASES)[number];

export const PROVIDER_AUTH_PROMPT_KINDS = ["select", "text", "secret", "manual_code"] as const;
export type ProviderAuthPromptKind = (typeof PROVIDER_AUTH_PROMPT_KINDS)[number];

export const PROVIDER_DISCLOSURE_KEYS = ["subscription-classified"] as const;
export type ProviderDisclosureKey = (typeof PROVIDER_DISCLOSURE_KEYS)[number];

export const MAX_PROVIDER_AUTH_VALUE = 16_384;
export const MAX_PROVIDER_AUTH_MESSAGE = 2_000;
export const MAX_PROVIDER_AUTH_PROGRESS = 500;
export const MAX_PROVIDER_AUTH_OPTIONS = 20;

export interface CredentialProviderSummary {
  id: string;
  name: string;
  configured: boolean;
}

export interface ImportProviderApiKeyInput {
  providerId: string;
  apiKey: string;
}

export interface ImportProviderApiKeyResult {
  providers: CredentialProviderSummary[];
}

export interface ProviderAccountSummary {
  id: string;
  name: string;
  methods: ProviderAuthMethod[];
  configured: boolean;
  subscriptionClassified: boolean;
  activeMethod?: "api_key" | "oauth";
  authSource?: string;
  disclosureKey?: ProviderDisclosureKey;
}

export interface ProviderAuthSelectOption {
  id: string;
  label: string;
  description?: string;
}

export interface ProviderAuthPrompt {
  promptId: string;
  kind: ProviderAuthPromptKind;
  message: string;
  placeholder?: string;
  options?: ProviderAuthSelectOption[];
}

export interface ProviderAuthLink {
  linkId: string;
  hostname: string;
  label?: string;
}

export interface ProviderAuthDeviceCode {
  userCode: string;
  expiresAt?: string;
  intervalSeconds?: number;
  verificationLinkId?: string;
}

export interface ProviderAuthFlowSnapshot {
  flowId: string;
  providerId: string;
  method: ProviderAuthMethod;
  phase: ProviderAuthFlowPhase;
  revision: number;
  startedAt: string;
  updatedAt: string;
  prompt?: ProviderAuthPrompt;
  links?: ProviderAuthLink[];
  deviceCode?: ProviderAuthDeviceCode;
  progress?: string;
  error?: HarnessError;
}

export interface ProviderAccountsResult {
  providers: ProviderAccountSummary[];
  flow: ProviderAuthFlowSnapshot | null;
}

export interface StartProviderLoginInput {
  providerId: string;
  method: ProviderAuthMethod;
}

export interface RespondProviderAuthPromptInput {
  flowId: string;
  promptId: string;
  value: string;
}

export interface OpenProviderAuthLinkInput {
  flowId: string;
  linkId: string;
}

export interface CancelProviderLoginInput {
  flowId: string;
}

export interface LogoutProviderInput {
  providerId: string;
}

export function isProviderAuthMethod(value: unknown): value is ProviderAuthMethod {
  return value === "api_key" || value === "oauth";
}

export function isProviderAuthFlowPhase(value: unknown): value is ProviderAuthFlowPhase {
  return (
    typeof value === "string" &&
    (PROVIDER_AUTH_FLOW_PHASES as readonly string[]).includes(value)
  );
}

export function idleProviderAccountsResult(
  providers: ProviderAccountSummary[] = [],
): ProviderAccountsResult {
  return { providers, flow: null };
}

export function providerDisclosureCopy(key: ProviderDisclosureKey): string {
  switch (key) {
    case "subscription-classified":
      return "Pi classifies this as a subscription login. That is an authentication type, not a guarantee of included plan usage or cost.";
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}
