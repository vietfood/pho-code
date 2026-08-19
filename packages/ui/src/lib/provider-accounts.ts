import type { ProviderAccountSummary, ProviderAuthFlowSnapshot, ProviderAuthMethod } from "@pho-code/protocol";

const INACTIVE_FLOW_PHASES = new Set(["idle", "completed", "failed", "cancelled"]);

export function isActiveProviderAuthFlow(flow: ProviderAuthFlowSnapshot | null): boolean {
  return flow !== null && !INACTIVE_FLOW_PHASES.has(flow.phase);
}

export function matchesProviderAccountQuery(
  provider: Pick<ProviderAccountSummary, "id" | "name">,
  query: string,
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) {
    return true;
  }
  return provider.name.toLowerCase().includes(trimmed) || provider.id.toLowerCase().includes(trimmed);
}

export function partitionProviderAccounts(providers: readonly ProviderAccountSummary[]): {
  connected: ProviderAccountSummary[];
  available: ProviderAccountSummary[];
} {
  const connected: ProviderAccountSummary[] = [];
  const available: ProviderAccountSummary[] = [];
  for (const provider of providers) {
    if (provider.configured) {
      connected.push(provider);
    } else {
      available.push(provider);
    }
  }
  return { connected, available };
}

export function providerMethodLabel(method: ProviderAuthMethod): string {
  switch (method) {
    case "oauth":
      return "OAuth";
    case "api_key":
      return "API key";
    default: {
      const exhaustive: never = method;
      return exhaustive;
    }
  }
}

export function formatProviderMethods(methods: readonly ProviderAuthMethod[]): string {
  return methods.map(providerMethodLabel).join(" or ");
}

export function providerStatusLabel(provider: ProviderAccountSummary): string {
  if (!provider.configured) {
    return `Not connected · ${formatProviderMethods(provider.methods)}`;
  }
  const method = provider.activeMethod ? providerMethodLabel(provider.activeMethod) : undefined;
  if (method && provider.authSource) {
    return `Connected · ${method} · ${provider.authSource}`;
  }
  if (method) {
    return `Connected · ${method}`;
  }
  if (provider.authSource) {
    return `Connected · ${provider.authSource}`;
  }
  return "Connected";
}
