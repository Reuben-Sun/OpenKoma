import { GeneratePayload, Project } from "../types";

export type GenerateResponse = {
  url: string;
  naturalWidth?: number;
  naturalHeight?: number;
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

export async function generateImage(payload: GeneratePayload): Promise<GenerateResponse> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson<GenerateResponse>(response);
}

export async function saveProject(project: Project): Promise<void> {
  const response = await fetch("/api/project/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ project })
  });

  await parseJson<{ ok: true }>(response);
}

export async function loadProject(): Promise<Project | null> {
  const response = await fetch("/api/project/load", {
    method: "GET"
  });

  const body = await parseJson<{ project: Project | null }>(response);
  return body.project;
}
