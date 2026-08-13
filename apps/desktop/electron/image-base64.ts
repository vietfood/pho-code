import {
  createHarnessError,
  HARNESS_ERROR_CODES,
  MAX_SOURCE_IMAGE_BYTES,
} from "@pho-code/protocol";

export const MAX_SOURCE_IMAGE_BASE64_CHARS = Math.ceil(MAX_SOURCE_IMAGE_BYTES / 3) * 4;

const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export function decodePastedImageBase64(data: string, operation = "pasteImages"): Buffer {
  if (
    data.length === 0 ||
    data.length > MAX_SOURCE_IMAGE_BASE64_CHARS ||
    data.length % 4 !== 0 ||
    !CANONICAL_BASE64.test(data)
  ) {
    throw invalidImage(operation);
  }
  const decoded = Buffer.from(data, "base64");
  if (decoded.byteLength === 0 || decoded.byteLength > MAX_SOURCE_IMAGE_BYTES) {
    throw invalidImage(operation);
  }
  return decoded;
}

function invalidImage(operation: string) {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.invalidImage,
    message: "That pasted image is invalid or larger than 10 MiB.",
    operation,
    recoverable: true,
  });
}
