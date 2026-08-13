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
