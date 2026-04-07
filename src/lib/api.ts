import { AiServiceConfig, GeneratePayload } from "../types";

const AI_SERVICE_CONFIG_STORAGE_KEY = "openkoma-ai-service-config";

const EMPTY_AI_SERVICE_CONFIG: AiServiceConfig = {
  baseUrl: "",
  authorization: ""
};

export type ImageResponse = {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
};

export type ImageRequestPayload = {
  imageBase64: string;
  mimeType: string;
  filename: string;
  naturalWidth?: number;
  naturalHeight?: number;
  scale?: number;
  targetWidth?: number;
  targetHeight?: number;
};

type JsonImageResponse = {
  url?: unknown;
  imageBase64?: unknown;
  mimeType?: unknown;
  naturalWidth?: unknown;
  naturalHeight?: unknown;
  error?: unknown;
  detail?: unknown;
  message?: unknown;
};

type HealthResponse = {
  message: string;
  detail?: string;
};

type LegacyAiServiceConfig = {
  baseUrl?: unknown;
  generateUrl?: unknown;
  removeBackgroundUrl?: unknown;
  upscaleUrl?: unknown;
  authorization?: unknown;
};

function normalizeConfigValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function extractBaseUrlFromEndpoint(endpoint: unknown, expectedPath: string): string {
  const normalizedEndpoint = normalizeConfigValue(endpoint);
  if (!normalizedEndpoint) {
    return "";
  }

  const trimmedPath = `/${expectedPath.replace(/^\/+/, "")}`;
  if (normalizedEndpoint.endsWith(trimmedPath)) {
    return trimTrailingSlashes(normalizedEndpoint.slice(0, -trimmedPath.length));
  }

  return trimTrailingSlashes(normalizedEndpoint);
}

function deriveBaseUrlFromLegacyConfig(value: LegacyAiServiceConfig): string {
  const baseUrl = normalizeConfigValue(value.baseUrl);
  if (baseUrl) {
    return trimTrailingSlashes(baseUrl);
  }

  const legacyEndpoints = [
    extractBaseUrlFromEndpoint(value.generateUrl, "generate"),
    extractBaseUrlFromEndpoint(value.removeBackgroundUrl, "remove-background"),
    extractBaseUrlFromEndpoint(value.upscaleUrl, "upscale")
  ].filter(Boolean);

  if (legacyEndpoints.length === 0) {
    return "";
  }

  const [firstEndpoint] = legacyEndpoints;
  return firstEndpoint;
}

export function normalizeAiServiceConfig(value: unknown): AiServiceConfig {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_AI_SERVICE_CONFIG };
  }

  const legacyConfig = value as LegacyAiServiceConfig;

  return {
    baseUrl: deriveBaseUrlFromLegacyConfig(legacyConfig),
    authorization: normalizeConfigValue(legacyConfig.authorization)
  };
}

export function loadAiServiceConfig(): AiServiceConfig {
  if (typeof window === "undefined") {
    return { ...EMPTY_AI_SERVICE_CONFIG };
  }

  try {
    const raw = window.localStorage.getItem(AI_SERVICE_CONFIG_STORAGE_KEY);
    if (!raw) {
      return { ...EMPTY_AI_SERVICE_CONFIG };
    }
    return normalizeAiServiceConfig(JSON.parse(raw));
  } catch {
    return { ...EMPTY_AI_SERVICE_CONFIG };
  }
}

export function persistAiServiceConfig(config: AiServiceConfig): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(AI_SERVICE_CONFIG_STORAGE_KEY, JSON.stringify(normalizeAiServiceConfig(config)));
  } catch {
    // ignored
  }
}

function pickJsonErrorMessage(body: JsonImageResponse): string | null {
  const candidates = [body.error, body.detail, body.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as JsonImageResponse;
      const message = pickJsonErrorMessage(body);
      if (message) {
        return message;
      }
    } else {
      const text = (await response.text()).trim();
      if (text) {
        return text;
      }
    }
  } catch {
    // ignored
  }

  return `请求失败: ${response.status}`;
}

function fileReaderToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
      if (!base64) {
        reject(new Error("无法读取图像数据"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("读取图像数据失败"));
    reader.readAsDataURL(blob);
  });
}

function getImageSizeFromUrl(url: string): Promise<{ naturalWidth: number; naturalHeight: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight
      });
    };

    image.onerror = () => {
      reject(new Error("无法解析图片尺寸"));
    };

    image.src = url;
  });
}

async function getImageSizeFromBlob(blob: Blob): Promise<{ naturalWidth: number; naturalHeight: number }> {
  const objectUrl = URL.createObjectURL(blob);

  try {
    return await getImageSizeFromUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function createBlobFromBase64(base64: string, mimeType: string): Blob {
  const normalized = base64.includes(",") ? base64.split(",")[1] : base64;
  const binary = atob(normalized);
  const length = binary.length;
  const bytes = new Uint8Array(length);

  for (let index = 0; index < length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], {
    type: mimeType || "image/png"
  });
}

function inferFilenameFromSource(url: string, blobType: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    const candidate = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    if (candidate) {
      return candidate;
    }
  } catch {
    // ignored
  }

  const mimeMap: Record<string, string> = {
    "image/png": "panel.png",
    "image/jpeg": "panel.jpg",
    "image/jpg": "panel.jpg",
    "image/webp": "panel.webp",
    "image/gif": "panel.gif",
    "image/svg+xml": "panel.svg"
  };

  return mimeMap[blobType.toLowerCase()] ?? "panel.png";
}

async function blobToImageResponse(
  blob: Blob,
  naturalWidthHint?: number,
  naturalHeightHint?: number
): Promise<ImageResponse> {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const size =
      Number.isFinite(naturalWidthHint) && Number.isFinite(naturalHeightHint) && Number(naturalWidthHint) > 0 && Number(naturalHeightHint) > 0
        ? {
            naturalWidth: Math.round(Number(naturalWidthHint)),
            naturalHeight: Math.round(Number(naturalHeightHint))
          }
        : await getImageSizeFromUrl(objectUrl);

    return {
      url: objectUrl,
      naturalWidth: size.naturalWidth,
      naturalHeight: size.naturalHeight
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`返回的图像 URL 无法读取: ${response.status}`);
  }
  return await response.blob();
}

async function parseImageResponse(response: Response): Promise<ImageResponse> {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("image/")) {
    const blob = await response.blob();
    return blobToImageResponse(blob);
  }

  let body: JsonImageResponse;
  try {
    body = (await response.json()) as JsonImageResponse;
  } catch {
    throw new Error("图像服务返回格式无效，需要 JSON 或 image/*");
  }

  const jsonErrorMessage = pickJsonErrorMessage(body);
  if (jsonErrorMessage) {
    throw new Error(jsonErrorMessage);
  }

  if (typeof body.imageBase64 === "string" && body.imageBase64.trim()) {
    const blob = createBlobFromBase64(
      body.imageBase64,
      typeof body.mimeType === "string" && body.mimeType.trim() ? body.mimeType : "image/png"
    );
    return blobToImageResponse(blob, Number(body.naturalWidth), Number(body.naturalHeight));
  }

  if (typeof body.url === "string" && body.url.trim()) {
    const blob = await fetchImageBlob(body.url);
    return blobToImageResponse(blob, Number(body.naturalWidth), Number(body.naturalHeight));
  }

  throw new Error("图像服务返回缺少 url 或 imageBase64");
}

function buildRequestHeaders(config: AiServiceConfig): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (config.authorization) {
    headers.Authorization = config.authorization;
  }

  return headers;
}

function buildServiceEndpoint(baseUrl: string, endpointPath: string): string {
  return `${trimTrailingSlashes(baseUrl)}/${endpointPath.replace(/^\/+/, "")}`;
}

function getRequiredServiceBaseUrl(config: AiServiceConfig): string {
  const normalized = trimTrailingSlashes(config.baseUrl);
  if (!normalized) {
    throw new Error("请先在服务配置中填写服务 URL");
  }

  return normalized;
}

function getRequiredEndpoint(config: AiServiceConfig, endpointPath: string): string {
  return buildServiceEndpoint(getRequiredServiceBaseUrl(config), endpointPath);
}

async function postImageRequest(endpoint: string, config: AiServiceConfig, payload: unknown): Promise<ImageResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildRequestHeaders(config),
    body: JSON.stringify(payload)
  });

  return parseImageResponse(response);
}

function describeHealthPayload(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const body = payload as Record<string, unknown>;
  const candidates = [body.message, body.detail, body.status];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (typeof body.ok === "boolean") {
    return body.ok ? "服务连接正常" : "服务未就绪";
  }

  return undefined;
}

export async function checkAiServiceHealth(config: AiServiceConfig): Promise<HealthResponse> {
  const response = await fetch(getRequiredEndpoint(config, "healthz"), {
    method: "GET",
    headers: config.authorization
      ? {
          Authorization: config.authorization
        }
      : undefined
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const body = (await response.json()) as unknown;
    return {
      message: describeHealthPayload(body) ?? "服务连接正常",
      detail: typeof body === "object" && body && "detail" in (body as Record<string, unknown>) ? describeHealthPayload((body as Record<string, unknown>).detail) : undefined
    };
  }

  const text = (await response.text()).trim();
  return {
    message: text || "服务连接正常"
  };
}

export async function uploadLocalImage(file: File): Promise<ImageResponse> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const size = await getImageSizeFromUrl(objectUrl);
    return {
      url: objectUrl,
      naturalWidth: size.naturalWidth,
      naturalHeight: size.naturalHeight
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function createImagePayloadFromSource(
  sourceUrl: string,
  naturalWidth?: number,
  naturalHeight?: number
): Promise<ImageRequestPayload> {
  const blob = await fetchImageBlob(sourceUrl);
  const measuredSize =
    Number.isFinite(naturalWidth) && Number.isFinite(naturalHeight) && Number(naturalWidth) > 0 && Number(naturalHeight) > 0
      ? {
          naturalWidth: Math.round(Number(naturalWidth)),
          naturalHeight: Math.round(Number(naturalHeight))
        }
      : await getImageSizeFromBlob(blob);

  return {
    imageBase64: await fileReaderToBase64(blob),
    mimeType: blob.type || "image/png",
    filename: inferFilenameFromSource(sourceUrl, blob.type),
    naturalWidth: measuredSize.naturalWidth,
    naturalHeight: measuredSize.naturalHeight
  };
}

export async function generateImage(config: AiServiceConfig, payload: GeneratePayload): Promise<ImageResponse> {
  return postImageRequest(getRequiredEndpoint(config, "generate"), config, payload);
}

export async function removeImageBackground(config: AiServiceConfig, payload: ImageRequestPayload): Promise<ImageResponse> {
  return postImageRequest(getRequiredEndpoint(config, "remove-background"), config, payload);
}

export async function upscaleImage(config: AiServiceConfig, payload: ImageRequestPayload): Promise<ImageResponse> {
  return postImageRequest(getRequiredEndpoint(config, "upscale"), config, payload);
}
