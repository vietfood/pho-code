import type { ChangeLineEnding, ChangeLimitation } from "@pho-code/protocol";

export interface ClassifiedText {
  kind: "text" | "binary";
  text?: string;
  lineEnding?: ChangeLineEnding;
  limitation?: Extract<ChangeLimitation, "binary">;
}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export function classifyBytes(bytes: Uint8Array): ClassifiedText {
  if (bytes.includes(0)) {
    return { kind: "binary", limitation: "binary" };
  }
  let text: string;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    return { kind: "binary", limitation: "binary" };
  }
  return {
    kind: "text",
    text,
    lineEnding: detectLineEnding(text),
  };
}

export function detectLineEnding(text: string): ChangeLineEnding {
  const hasCrlf = text.includes("\r\n");
  const hasBareLf = /(?:^|[^\r])\n/u.test(text);
  const hasBareCr = /\r(?!\n)/u.test(text);
  if (hasCrlf && (hasBareLf || hasBareCr)) {
    return "mixed";
  }
  if (hasCrlf) {
    return "crlf";
  }
  return "lf";
}

export function languageFromRelativePath(relativePath: string): string | undefined {
  const base = relativePath.split("/").at(-1) ?? relativePath;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return undefined;
  }
  const ext = base.slice(dot + 1).toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "markdown";
    case "css":
      return "css";
    case "html":
      return "html";
    case "py":
      return "python";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "sh":
    case "bash":
      return "bash";
    case "yml":
    case "yaml":
      return "yaml";
    case "toml":
      return "toml";
    case "txt":
      return "text";
    default:
      return ext;
  }
}

export function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/u);
}
