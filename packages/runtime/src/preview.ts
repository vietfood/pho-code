const PREVIEW_LIMIT = 2_000;

export function previewText(value: string): string {
  if (value.length <= PREVIEW_LIMIT) {
    return value;
  }
  return `${value.slice(0, PREVIEW_LIMIT)}…`;
}

export function previewUnknown(value: unknown): string {
  if (typeof value === "string") {
    return previewText(value);
  }

  try {
    return previewText(JSON.stringify(value) ?? "");
  } catch {
    return "[unserializable]";
  }
}

/**
 * Prefer AgentToolResult `content[].text` (Pi bash/read shape) over raw JSON,
 * so live tool rows match settled transcript projection.
 */
export function previewToolResult(value: unknown): string {
  if (typeof value === "string") {
    return previewText(value);
  }
  if (value && typeof value === "object") {
    const content = (value as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const text = content
        .filter(
          (part): part is { type: string; text: string } =>
            part !== null &&
            typeof part === "object" &&
            (part as { type?: unknown }).type === "text" &&
            typeof (part as { text?: unknown }).text === "string",
        )
        .map((part) => part.text)
        .join("\n");
      if (text.length > 0) {
        return previewText(text);
      }
    }
  }
  return previewUnknown(value);
}
