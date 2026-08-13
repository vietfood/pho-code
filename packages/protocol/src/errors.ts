export interface HarnessError {
  code: string;
  message: string;
  recoverable: boolean;
  operation?: string;
  details?: Record<string, string | number | boolean | null>;
}

export const HARNESS_ERROR_CODES = {
  invalidCommand: "invalid_command",
  invalidSnapshot: "invalid_snapshot",
  unsupportedProtocolVersion: "unsupported_protocol_version",
  untrustedSender: "untrusted_sender",
  shuttingDown: "shutting_down",
  workspaceInaccessible: "workspace_inaccessible",
  workspaceNotSelected: "workspace_not_selected",
  sessionNotFound: "session_not_found",
  sessionBusy: "session_busy",
  noAuthenticatedModel: "no_authenticated_model",
  promptRejected: "prompt_rejected",
  runFailed: "run_failed",
  runtimeUnavailable: "runtime_unavailable",
  resourceReloadFailed: "resource_reload_failed",
  invalidPermissionConfig: "invalid_permission_config",
  credentialImportFailed: "credential_import_failed",
  providerAuthFailed: "provider_auth_failed",
  unsupportedHostUi: "unsupported_host_ui",
  extensionCommandNotFound: "extension_command_not_found",
  invalidWorkspaceReference: "invalid_workspace_reference",
  invalidImage: "invalid_image",
  imagesUnsupported: "images_unsupported",
} as const;

export function isHarnessError(value: unknown): value is HarnessError {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<HarnessError>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.recoverable === "boolean"
  );
}

export function createHarnessError(
  error: Omit<HarnessError, "recoverable"> & { recoverable?: boolean },
): HarnessError {
  const result: HarnessError = {
    code: error.code,
    message: error.message,
    recoverable: error.recoverable ?? false,
  };

  if (error.operation !== undefined) {
    result.operation = error.operation;
  }
  if (error.details !== undefined) {
    result.details = error.details;
  }

  return result;
}
