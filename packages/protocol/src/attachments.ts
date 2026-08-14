export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export const MAX_PREPARED_IMAGES = 5;
export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PREPARED_IMAGE_DIMENSION = 2_000;
export const MAX_IMAGE_PREVIEW_DIMENSION = 1_280;
export const MAX_QUEUE_MESSAGE_PREVIEW = 80;

export function isImageMimeType(value: unknown): value is ImageMimeType {
  return typeof value === "string" && (IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

/** JSON-safe prepared image shown in the composer. Never includes a filesystem path. */
export interface PreparedImageSummary {
  id: string;
  /** Basename only. */
  name: string;
  mimeType: ImageMimeType;
  byteLength: number;
  width: number;
  height: number;
  previewDataUrl: string;
}

export interface PrepareImageInput {
  name: string;
  mimeType: string;
  /** Raw image bytes as base64. */
  data: string;
  width: number;
  height: number;
  previewDataUrl: string;
  sessionId?: string;
  workspaceId?: string;
}

export interface PickImagesInput {
  sessionId?: string;
  workspaceId?: string;
}

export interface RemovePreparedImageInput {
  imageId: string;
  sessionId?: string;
  workspaceId?: string;
}

export interface PickImagesResult {
  images: PreparedImageSummary[];
}

export interface PastedImageBytes {
  /** Basename only. */
  name: string;
  /** Raw image bytes as base64. */
  data: string;
}

export interface PasteImagesInput {
  /** When omitted or empty, the shell reads the native clipboard image. */
  images?: PastedImageBytes[];
  sessionId?: string;
  workspaceId?: string;
}
