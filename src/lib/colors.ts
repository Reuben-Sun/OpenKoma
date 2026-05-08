export const DEFAULT_BUBBLE_TEXT_COLOR = "#0f172a";
export const RECENT_TEXT_COLOR_LIMIT = 5;

const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseHexColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!HEX_COLOR_REGEX.test(normalized)) {
    return null;
  }

  if (normalized.length === 4) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }

  return normalized;
}

export function normalizeHexColor(value: unknown, fallback = DEFAULT_BUBBLE_TEXT_COLOR): string {
  return parseHexColor(value) ?? fallback;
}

export function sanitizeRecentHexColors(value: unknown, limit = RECENT_TEXT_COLOR_LIMIT): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: string[] = [];
  for (const entry of value) {
    const normalized = parseHexColor(entry);
    if (!normalized || output.includes(normalized)) {
      continue;
    }

    output.push(normalized);
    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

export function pushRecentHexColor(value: unknown, nextColor: unknown, limit = RECENT_TEXT_COLOR_LIMIT): string[] {
  const normalized = parseHexColor(nextColor);
  if (!normalized) {
    return sanitizeRecentHexColors(value, limit);
  }

  const current = Array.isArray(value) ? value : [];
  return sanitizeRecentHexColors([normalized, ...current], limit);
}

export function mergeRecentHexColors(primary: unknown, secondary: unknown, limit = RECENT_TEXT_COLOR_LIMIT): string[] {
  const first = Array.isArray(primary) ? primary : [];
  const second = Array.isArray(secondary) ? secondary : [];
  return sanitizeRecentHexColors([...first, ...second], limit);
}
