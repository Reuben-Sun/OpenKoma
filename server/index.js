import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);

const rootDir = process.cwd();
const projectDir = path.join(rootDir, "project");
const imageDir = path.join(projectDir, "images");
const projectFile = path.join(projectDir, "project.json");

await fs.mkdir(imageDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use("/assets", express.static(projectDir));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickExtension(filename, mimeType) {
  const extFromName = path.extname(String(filename || "")).toLowerCase();
  if (extFromName) {
    return extFromName;
  }

  const table = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg"
  };
  return table[String(mimeType || "").toLowerCase()] || ".png";
}

function createPlaceholderSvg(prompt, width, height) {
  const safePrompt = prompt.replace(/[<&>]/g, "").slice(0, 90) || "OpenKoma";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#dbeafe" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <g>
    <rect x="24" y="24" width="${Math.max(120, width - 48)}" height="${Math.max(120, height - 48)}" rx="20" fill="#ffffff" stroke="#0f172a" stroke-width="6" />
    <text x="50%" y="42%" dominant-baseline="middle" text-anchor="middle" font-size="${Math.round(Math.min(width, height) * 0.07)}" font-family="Noto Sans SC, sans-serif" fill="#0f172a">AI Placeholder</text>
    <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-size="${Math.round(Math.min(width, height) * 0.04)}" font-family="Noto Sans SC, sans-serif" fill="#1d4ed8">${safePrompt}</text>
  </g>
</svg>`;
}

async function downloadToBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载图像失败: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateWithRemote(payload) {
  const endpoint = process.env.AI_IMAGE_API_URL;
  if (!endpoint) {
    return null;
  }

  const headers = {
    "Content-Type": "application/json"
  };

  if (process.env.AI_IMAGE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.AI_IMAGE_API_KEY}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`远端图像服务失败: ${response.status} ${text}`);
  }

  const body = await response.json();
  if (typeof body.url === "string" && body.url) {
    const buffer = await downloadToBuffer(body.url);
    const extension = path.extname(new URL(body.url, "http://localhost").pathname) || ".png";
    return {
      buffer,
      extension
    };
  }

  if (typeof body.imageBase64 === "string" && body.imageBase64) {
    return {
      buffer: Buffer.from(body.imageBase64, "base64"),
      extension: ".png"
    };
  }

  throw new Error("远端图像服务返回格式不支持，需要 url 或 imageBase64");
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/generate", async (request, response) => {
  try {
    const prompt = String(request.body?.prompt || "").trim();
    const negativePrompt = String(request.body?.negativePrompt || "").trim();
    const width = clamp(Number(request.body?.width || 1024), 64, 4096);
    const height = clamp(Number(request.body?.height || 1024), 64, 4096);

    if (!prompt) {
      response.status(400).json({ error: "prompt 不能为空" });
      return;
    }

    const filenameBase = `${Date.now()}_${uuidv4()}`;

    const remote = await generateWithRemote({
      prompt,
      negativePrompt,
      width,
      height
    });

    if (remote) {
      const filename = `${filenameBase}${remote.extension}`;
      const absolutePath = path.join(imageDir, filename);
      await fs.writeFile(absolutePath, remote.buffer);

      response.json({
        url: `/assets/images/${filename}`,
        naturalWidth: width,
        naturalHeight: height
      });
      return;
    }

    const filename = `${filenameBase}.svg`;
    const absolutePath = path.join(imageDir, filename);
    const svg = createPlaceholderSvg(prompt, width, height);
    await fs.writeFile(absolutePath, svg, "utf8");

    response.json({
      url: `/assets/images/${filename}`,
      naturalWidth: width,
      naturalHeight: height
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败";
    response.status(500).json({ error: message });
  }
});

app.post("/api/images/upload", async (request, response) => {
  try {
    const base64 = String(request.body?.base64 || "");
    const filename = String(request.body?.filename || "");
    const mimeType = String(request.body?.mimeType || "");
    if (!base64) {
      response.status(400).json({ error: "base64 不能为空" });
      return;
    }

    const pureBase64 = base64.includes(",") ? base64.split(",")[1] : base64;
    const buffer = Buffer.from(pureBase64, "base64");
    if (!buffer.length) {
      response.status(400).json({ error: "base64 内容无效" });
      return;
    }

    const ext = pickExtension(filename, mimeType);
    const savedName = `${Date.now()}_${uuidv4()}${ext}`;
    const absolutePath = path.join(imageDir, savedName);
    await fs.writeFile(absolutePath, buffer);

    response.json({
      url: `/assets/images/${savedName}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    response.status(500).json({ error: message });
  }
});

app.post("/api/project/save", async (request, response) => {
  try {
    const project = request.body?.project;
    if (!project || typeof project !== "object") {
      response.status(400).json({ error: "project 数据缺失" });
      return;
    }

    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(projectFile, JSON.stringify(project, null, 2), "utf8");

    response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    response.status(500).json({ error: message });
  }
});

app.get("/api/project/load", async (_request, response) => {
  try {
    const raw = await fs.readFile(projectFile, "utf8");
    const project = JSON.parse(raw);
    response.json({ project });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      response.json({ project: null });
      return;
    }

    const message = error instanceof Error ? error.message : "加载失败";
    response.status(500).json({ error: message });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`OpenKoma local server running at http://localhost:${port}`);
});
