import { GeneratePayload } from "../types";

export type GenerateResponse = {
  url: string;
  naturalWidth?: number;
  naturalHeight?: number;
};

export type UploadImageResponse = {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
};

type AssetStorageOptions = {
  tempProjectId?: string;
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `请求失败: ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.error === "string") {
        message = body.error;
      }
    } catch {
      // ignored
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function generateImage(payload: GeneratePayload, options: AssetStorageOptions = {}): Promise<GenerateResponse> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...payload,
      tempProjectId: options.tempProjectId
    })
  });

  return parseJson<GenerateResponse>(response);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
      if (!base64) {
        reject(new Error("无法读取本地图片"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("读取本地图片失败"));
    reader.readAsDataURL(file);
  });
}

function getImageSize(file: File): Promise<{ naturalWidth: number; naturalHeight: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight
      });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("无法解析图片尺寸"));
    };

    image.src = objectUrl;
  });
}

export async function uploadLocalImage(file: File, options: AssetStorageOptions = {}): Promise<UploadImageResponse> {
  const [base64, size] = await Promise.all([fileToBase64(file), getImageSize(file)]);

  const response = await fetch("/api/images/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      base64,
      tempProjectId: options.tempProjectId
    })
  });

  const body = await parseJson<{ url: string }>(response);
  return {
    url: body.url,
    naturalWidth: size.naturalWidth,
    naturalHeight: size.naturalHeight
  };
}

export async function saveProject(project: unknown): Promise<void> {
  const response = await fetch("/api/project/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ project })
  });

  await parseJson<{ ok: true }>(response);
}

export async function loadProject(): Promise<unknown | null> {
  const response = await fetch("/api/project/load", {
    method: "GET"
  });

  const body = await parseJson<{ project: unknown | null }>(response);
  return body.project;
}

export async function saveTempProjectSnapshot(projectId: string, project: unknown): Promise<void> {
  const response = await fetch("/api/project/temp/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      projectId,
      project
    })
  });

  await parseJson<{ ok: true }>(response);
}

export async function clearTempProjectSnapshot(projectId: string): Promise<void> {
  const response = await fetch("/api/project/temp/clear", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      projectId
    })
  });

  await parseJson<{ ok: true }>(response);
}
