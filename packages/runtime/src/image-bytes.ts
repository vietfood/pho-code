import { isImageMimeType, type ImageMimeType } from "@pho-code/protocol";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const GIF87A = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89A = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP = [0x57, 0x45, 0x42, 0x50] as const;

export function sniffImageMime(bytes: Uint8Array): ImageMimeType | undefined {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return "image/png";
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return "image/jpeg";
  }
  if (startsWith(bytes, GIF87A) || startsWith(bytes, GIF89A)) {
    return "image/gif";
  }
  if (startsWith(bytes, RIFF) && bytes.length >= 12 && startsWith(bytes.subarray(8), WEBP)) {
    return "image/webp";
  }
  return undefined;
}

export function decodeBase64Bytes(data: string): Uint8Array {
  return new Uint8Array(Buffer.from(data, "base64"));
}

export function mimeAgreesWithBytes(mimeType: string, bytes: Uint8Array): mimeType is ImageMimeType {
  const sniffed = sniffImageMime(bytes);
  return sniffed !== undefined && sniffed === mimeType && isImageMimeType(mimeType);
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((value, index) => bytes[index] === value);
}
