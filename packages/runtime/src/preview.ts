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
