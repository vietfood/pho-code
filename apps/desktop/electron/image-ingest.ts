import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { nativeImage } from "electron";
import {
  createHarnessError,
  HARNESS_ERROR_CODES,
  MAX_IMAGE_PREVIEW_DIMENSION,
  MAX_PREPARED_IMAGE_DIMENSION,
  MAX_SOURCE_IMAGE_BYTES,
  type PrepareImageInput,
} from "@pho-code/protocol";
import { sniffImageMime } from "@pho-code/runtime/image-bytes";

export async function ingestImageFile(filePath: string, operation = "pickImages"): Promise<PrepareImageInput> {
  const name = path.basename(filePath);
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    throw invalidImage("That image could not be read.", operation);
  }
  if (!fileStat.isFile()) {
    throw invalidImage("Only image files can be attached.", operation);
  }
  if (fileStat.size <= 0 || fileStat.size > MAX_SOURCE_IMAGE_BYTES) {
    throw invalidImage("That image is empty or larger than 10 MiB.", operation);
  }
  return ingestImageBytes(await readFile(filePath), name, operation);
}

export async function ingestImageBytes(
  source: Buffer,
  name: string,
  operation = "pasteImages",
): Promise<PrepareImageInput> {
  if (source.byteLength <= 0 || source.byteLength > MAX_SOURCE_IMAGE_BYTES) {
    throw invalidImage("That image is empty or larger than 10 MiB.", operation);
  }
  const sniffed = sniffImageMime(source);
  const loaded = nativeImage.createFromBuffer(source);
  if (loaded.isEmpty()) {
    throw invalidImage(
      sniffed ? "That image could not be decoded." : "Only PNG, JPEG, GIF, and WebP images are supported.",
      operation,
    );
  }
  return ingestNativeImage(loaded, name, operation);
}

export function ingestNativeImage(
  image: Electron.NativeImage,
  name: string,
  operation = "pasteImages",
): PrepareImageInput {
  if (image.isEmpty()) {
    throw invalidImage("The clipboard does not contain a supported image.", operation);
  }
  const original = image.getSize();
  const fitted = fitWithin(original.width, original.height, MAX_PREPARED_IMAGE_DIMENSION);
  const prepared =
    fitted.width === original.width && fitted.height === original.height
      ? image
      : image.resize({ width: fitted.width, height: fitted.height, quality: "best" });
  if (prepared.isEmpty()) {
    throw invalidImage("That image could not be prepared.", operation);
  }
  const png = prepared.toPNG();
  const preview = previewDataUrl(prepared);
  const size = prepared.getSize();
  return {
    name: path.basename(name) || "pasted-image.png",
    mimeType: "image/png",
    data: png.toString("base64"),
    width: size.width,
    height: size.height,
    previewDataUrl: preview,
  };
}

function previewDataUrl(image: Electron.NativeImage): string {
  const size = image.getSize();
  const fitted = fitWithin(size.width, size.height, MAX_IMAGE_PREVIEW_DIMENSION);
  const preview =
    fitted.width === size.width && fitted.height === size.height
      ? image
      : image.resize({ width: fitted.width, height: fitted.height, quality: "good" });
  const jpeg = preview.toJPEG(72);
  if (jpeg.byteLength > 0) {
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  }
  return `data:image/png;base64,${preview.toPNG().toString("base64")}`;
}

function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) {
    return { width, height };
  }
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function invalidImage(message: string, operation: string) {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.invalidImage,
    message,
    operation,
    recoverable: true,
  });
}
