# OpenKoma

本项目是本地运行的 AI 漫画编辑器 MVP，实现了设计文档中的核心流程：

- 自定义画布（含 A4/A3 预设）
- 分镜网格切割 + 手绘分镜 + 选中分镜二次切割
- Konva 画布中的分镜拖拽、缩放、选中高亮
- Inspector 属性编辑（位置尺寸、边框、Prompt）
- AI 生成接口代理（本地 `/api/generate`）
- 图像非破坏裁剪（保留 `image.original`，仅改 `crop`）
- 漫画气泡系统（矩形/圆角/圆形，横排/竖排文字）
- 历史记录（undo/redo，支持快捷键）
- 整页导出（PNG / PDF）
- 项目本地保存/加载（`project/project.json`）

## 技术栈

- Frontend: React + TypeScript + Zustand + Konva + TailwindCSS
- Backend: Node.js + Express
- Storage: 本地 JSON + 本地图片文件

## 快速启动

```bash
npm install
npm run dev
```

默认启动：

- 前端: `http://localhost:5173`
- 后端: `http://localhost:3001`

## 环境变量（可选）

在根目录创建 `.env`：

```bash
PORT=3001
AI_IMAGE_API_URL=
AI_IMAGE_API_KEY=
```

说明：

- 未配置 `AI_IMAGE_API_URL` 时，`/api/generate` 会回退到本地 SVG 占位图生成（用于离线开发验证）
- 配置了 `AI_IMAGE_API_URL` 时，会透传 `prompt/negativePrompt/width/height` 到远端并将返回图保存到本地

## API

### `POST /api/generate`

请求：

```json
{
  "prompt": "漫画分镜，一个少年站在雨中，赛博朋克风格，高细节",
  "negativePrompt": "",
  "width": 1024,
  "height": 768
}
```

响应：

```json
{
  "url": "/assets/images/xxx.png",
  "naturalWidth": 1024,
  "naturalHeight": 768
}
```

### `POST /api/project/save`

请求：

```json
{
  "project": { "...": "..." }
}
```

### `GET /api/project/load`

响应：

```json
{
  "project": { "...": "..." }
}
```

## 目录结构

```text
.
├── server/
│   └── index.js
├── src/
│   ├── components/
│   │   ├── CanvasEditor.tsx
│   │   ├── InspectorPanel.tsx
│   │   └── Toolbar.tsx
│   ├── lib/
│   │   ├── api.ts
│   │   ├── project.ts
│   │   └── store.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── types.ts
└── project/
    ├── project.json
    └── images/
```

## 已实现范围

- P0: 已覆盖
- P1: 气泡、边框/间距、竖排文字已覆盖
- P2: 已覆盖 `undo/redo` 与 `PNG/PDF` 导出

## 快捷键

- `Cmd/Ctrl + Z`: 撤销
- `Cmd/Ctrl + Shift + Z` 或 `Ctrl + Y`: 重做
