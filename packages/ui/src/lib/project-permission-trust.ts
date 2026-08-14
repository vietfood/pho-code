import type { PermissionSettings } from "@pho-code/protocol";

/** Owner still needs to confirm trust for this workspace. */
export function projectPermissionTrustPending(permission: PermissionSettings | null | undefined): boolean {
  if (!permission) {
    return false;
  }
  if (!permission.projectPermissionRulesTrusted) {
    return true;
  }
  return permission.projectOverridePresent && !permission.projectPermissionRulesRemembered;
}

export function looksLikeProjectTrustNotification(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("not trusted") && normalized.includes("permission");
}
