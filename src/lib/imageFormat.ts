const TRANSPARENT_IMAGE_MIME_TYPES = new Set([
  "image/apng",
  "image/avif",
  "image/gif",
  "image/png",
  "image/svg+xml",
  "image/webp"
]);

const TRANSPARENT_IMAGE_EXTENSIONS = [".apng", ".avif", ".gif", ".png", ".svg", ".webp"];

function normalizeMimeType(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function extractMimeTypeFromDataUrl(url: string): string {
  const match = /^data:([^;,]+)/i.exec(url);
  return normalizeMimeType(match?.[1]);
}

function extractExtensionFromRef(ref: string): string {
  try {
    const url = new URL(ref, "http://localhost");
    const pathname = url.pathname.toLowerCase();
    const dotIndex = pathname.lastIndexOf(".");
    return dotIndex >= 0 ? pathname.slice(dotIndex) : "";
  } catch {
    const normalized = ref.trim().toLowerCase();
    const dotIndex = normalized.lastIndexOf(".");
    return dotIndex >= 0 ? normalized.slice(dotIndex) : "";
  }
}

export function supportsTransparentPixelsMimeType(mimeType: string | undefined): boolean {
  const normalized = normalizeMimeType(mimeType);
  return normalized.length > 0 && TRANSPARENT_IMAGE_MIME_TYPES.has(normalized);
}

export function supportsTransparentPixelsRef(ref: string | undefined): boolean {
  const normalized = ref?.trim() ?? "";
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith("data:")) {
    return supportsTransparentPixelsMimeType(extractMimeTypeFromDataUrl(normalized));
  }

  const extension = extractExtensionFromRef(normalized);
  return TRANSPARENT_IMAGE_EXTENSIONS.includes(extension);
}

export function shouldPreserveImageTransparency(image: {
  original?: string;
  mimeType?: string;
  preserveTransparency?: boolean;
} | undefined): boolean {
  if (!image) {
    return false;
  }

  if (typeof image.preserveTransparency === "boolean") {
    return image.preserveTransparency;
  }

  return supportsTransparentPixelsMimeType(image.mimeType) || supportsTransparentPixelsRef(image.original);
}
