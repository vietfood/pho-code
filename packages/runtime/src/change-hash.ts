import { createHash } from "node:crypto";

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function hashUtf8(text: string): string {
  return hashBytes(Buffer.from(text, "utf8"));
}
