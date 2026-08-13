import { createHarnessError, HARNESS_ERROR_CODES, isHarnessError, type HarnessError } from "./errors";

export type CommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: HarnessError };

export function commandOk<T>(value: T): CommandResult<T> {
  return { ok: true, value };
}

export function commandFail(error: HarnessError): CommandResult<never> {
  return { ok: false, error };
}

export function isCommandResult(value: unknown): value is CommandResult<unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { ok?: unknown; value?: unknown; error?: unknown };
  if (candidate.ok === true) {
    return true;
  }
  return candidate.ok === false && isHarnessError(candidate.error);
}

export function unwrapCommandResult<T>(value: unknown): T {
  if (!isCommandResult(value)) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "The desktop command returned an unexpected result.",
      operation: "command",
    });
  }
  if (!value.ok) {
    throw value.error;
  }
  return value.value as T;
}
