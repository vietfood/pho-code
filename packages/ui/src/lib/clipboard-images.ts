export interface ClipboardFileItem {
  kind: string;
  type: string;
  getAsFile: () => File | null;
}

const GENERIC_CLIPBOARD_IMAGE_NAMES = new Set([
  "",
  "image.png",
  "image.jpg",
  "image.jpeg",
  "image.gif",
  "image.webp",
  "image.tif",
  "image.tiff",
  "untitled",
  "untitled.png",
  "pasted-image.png",
]);

export function clipboardLooksLikeImage(types: ArrayLike<string> | null | undefined): boolean {
  return Array.from(types ?? []).some((type) => type.startsWith("image/"));
}

export function isGenericClipboardImageName(name: string): boolean {
  const base = name.trim().split(/[/\\]/u).pop()?.toLowerCase() ?? "";
  return GENERIC_CLIPBOARD_IMAGE_NAMES.has(base);
}

export function pasteFingerprint(files: readonly File[], types: ArrayLike<string> | null | undefined): string {
  const filePart = files.map((file) => `${file.name}:${file.size}:${file.type}`).join("|");
  return `${filePart}#${Array.from(types ?? []).join(",")}`;
}

export function shouldIgnoreDuplicatePaste(
  previous: { fingerprint: string; at: number } | null,
  fingerprint: string,
  now: number,
  windowMs = 250,
): boolean {
  return previous !== null && previous.fingerprint === fingerprint && now - previous.at < windowMs;
}

export function collectPastedImageFiles(input: {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<ClipboardFileItem> | null;
}): File[] {
  const fromFiles = collectImageFiles(input.files);
  const collected = fromFiles.length > 0 ? fromFiles : collectImageItems(input.items);
  return collapseClipboardImageDuplicates(collected);
}

function collectImageFiles(files: ArrayLike<File> | null | undefined): File[] {
  const collected: File[] = [];
  const seen = new Set<string>();
  for (const file of Array.from(files ?? [])) {
    considerImageFile(file, collected, seen);
  }
  return collected;
}

function collectImageItems(items: ArrayLike<ClipboardFileItem> | null | undefined): File[] {
  const collected: File[] = [];
  const seen = new Set<string>();
  for (const item of Array.from(items ?? [])) {
    if (item.kind === "file" && (item.type === "" || item.type.startsWith("image/"))) {
      considerImageFile(item.getAsFile(), collected, seen);
    }
  }
  return collected;
}

function considerImageFile(file: File | null | undefined, collected: File[], seen: Set<string>): void {
  if (!file || file.size <= 0) {
    return;
  }
  if (file.type !== "" && !file.type.startsWith("image/")) {
    return;
  }
  const key = `${file.size}:${file.type || "application/octet-stream"}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  collected.push(file);
}

function collapseClipboardImageDuplicates(files: File[]): File[] {
  if (files.length <= 1) {
    return files;
  }
  if (!files.every((file) => isGenericClipboardImageName(file.name))) {
    return files;
  }
  const types = new Set(files.map((file) => file.type));
  const hasPng = types.has("image/png");
  const hasTiff = types.has("image/tiff") || types.has("image/x-tiff");
  if (hasPng && hasTiff) {
    return files.filter((file) => file.type === "image/png");
  }
  if (hasPng && types.has("image/jpeg") && files.length === 2) {
    return files.filter((file) => file.type === "image/png");
  }
  return files;
}

export function pastedImageDisplayName(name: string, index: number): string {
  const base = name.trim().split(/[/\\]/u).pop() ?? "";
  if (base !== "" && base !== "." && base !== "..") {
    return base;
  }
  return index === 0 ? "pasted-image.png" : `pasted-image-${index + 1}.png`;
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
