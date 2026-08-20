import { randomUUID } from "node:crypto";
import type { ImageContent } from "@pho-agent/runtime/feature-api";
import {
  createHarnessError,
  HARNESS_ERROR_CODES,
  isImageMimeType,
  MAX_PREPARED_IMAGE_DIMENSION,
  MAX_PREPARED_IMAGES,
  MAX_SOURCE_IMAGE_BYTES,
  type PrepareImageInput,
  type PreparedImageSummary,
} from "@pho-code/protocol";
import { decodeBase64Bytes, mimeAgreesWithBytes, sniffImageMime } from "./image-bytes";

export interface PreparedImageRecord {
  summary: PreparedImageSummary;
  content: ImageContent;
}

const PREVIEW_PREFIXES = ["data:image/jpeg;base64,", "data:image/png;base64,"] as const;

export function createPreparedImageStore() {
  const items = new Map<string, PreparedImageRecord>();

  return {
    size(): number {
      return items.size;
    },
    clear(): void {
      items.clear();
    },
    remove(imageId: string): void {
      items.delete(imageId);
    },
    forget(imageIds: readonly string[]): void {
      for (const imageId of imageIds) {
        items.delete(imageId);
      }
    },
    lookup(imageIds: readonly string[], operation: string): PreparedImageRecord[] {
      const records: PreparedImageRecord[] = [];
      for (const imageId of imageIds) {
        const record = items.get(imageId);
        if (!record) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.invalidImage,
            message: "A prepared image is missing. Attach it again before sending.",
            operation,
            recoverable: true,
          });
        }
        records.push(record);
      }
      return records;
    },
    add(input: PrepareImageInput, operation: string): PreparedImageSummary {
      if (items.size >= MAX_PREPARED_IMAGES) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidImage,
          message: `A prompt can include at most ${MAX_PREPARED_IMAGES} images.`,
          operation,
          recoverable: true,
        });
      }
      const name = displayImageName(input.name, operation);
      const previewDataUrl = requirePreviewDataUrl(input.previewDataUrl, operation);
      const width = requirePositiveDimension(input.width, "width", operation);
      const height = requirePositiveDimension(input.height, "height", operation);
      if (typeof input.data !== "string" || input.data.trim() === "") {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidImage,
          message: "Image data is required.",
          operation,
          recoverable: true,
        });
      }
      const bytes = decodeBase64Bytes(input.data.trim());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_IMAGE_BYTES) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidImage,
          message: "That image is empty or larger than 10 MiB.",
          operation,
          recoverable: true,
        });
      }
      const sniffed = sniffImageMime(bytes);
      if (!sniffed || !isImageMimeType(input.mimeType) || !mimeAgreesWithBytes(input.mimeType, bytes)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidImage,
          message: "Only PNG, JPEG, GIF, and WebP images are supported.",
          operation,
          recoverable: true,
        });
      }
      const id = randomUUID();
      const summary: PreparedImageSummary = {
        id,
        name,
        mimeType: sniffed,
        byteLength: bytes.byteLength,
        width,
        height,
        previewDataUrl,
      };
      items.set(id, {
        summary,
        content: {
          type: "image",
          data: input.data.trim(),
          mimeType: sniffed,
        },
      });
      return summary;
    },
  };
}

function displayImageName(value: unknown, operation: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidImage,
      message: "An image name is required.",
      operation,
      recoverable: true,
    });
  }
  const name = value.trim();
  if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidImage,
      message: "Image names cannot include a path.",
      operation,
      recoverable: true,
    });
  }
  return name;
}

function requirePositiveDimension(value: unknown, field: string, operation: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_PREPARED_IMAGE_DIMENSION) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidImage,
      message: `Image ${field} must be between 1 and ${MAX_PREPARED_IMAGE_DIMENSION} pixels.`,
      operation,
      recoverable: true,
    });
  }
  return value;
}

function requirePreviewDataUrl(value: unknown, operation: string): string {
  if (typeof value !== "string") {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidImage,
      message: "A preview image is required.",
      operation,
      recoverable: true,
    });
  }
  if (!PREVIEW_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidImage,
      message: "Image previews must use an in-memory JPEG or PNG data URL.",
      operation,
      recoverable: true,
    });
  }
  return value;
}
