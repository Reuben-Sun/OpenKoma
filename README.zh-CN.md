<div align="center">

<h1>OpenKoma</h1>

<p><strong>本地优先 AI 漫画编辑器</strong><br/>面向真实生产流程的开源工具：分镜布局、非破坏图像编辑、可逆增量历史。</p>

<p>
  <img alt="license" src="https://img.shields.io/badge/License-Apache%202.0-2ea44f?style=for-the-badge" />
  <img alt="frontend" src="https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61dafb?style=for-the-badge" />
  <img alt="canvas" src="https://img.shields.io/badge/Canvas-Konva-0ea5e9?style=for-the-badge" />
  <img alt="ai" src="https://img.shields.io/badge/AI-浏览器直连%20FastAPI-111827?style=for-the-badge" />
  <img alt="state" src="https://img.shields.io/badge/State-Zustand-f59e0b?style=for-the-badge" />
</p>

<p>
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="28" alt="React" />
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="28" alt="TypeScript" />
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" width="28" alt="Node.js" />
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vitejs/vitejs-original.svg" width="28" alt="Vite" />
</p>

<p>
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a>
</p>

</div>

## 摘要
OpenKoma 是一个本地优先的漫画创作环境，重点不是“演示功能”，而是可落地的创作流程：分镜编辑、气泡编辑、本地图像导入与非破坏裁剪、多页面管理、增量式撤销重做，以及直连外部 AI 图像服务。

## 核心卖点
- 增量可逆编辑：每次修改都会生成 forward/backward patch，撤销重做稳定可追溯。
- 非破坏图像流程：始终保存原图，显示层只使用裁剪参数，不破坏素材。
- 真正的斜切分镜：支持平行四边形与梯形，不只是旋转矩形。
- 多页面生产流程：页面列表支持新增/删除/排序，PDF 按页面顺序整本导出。
- 浏览器直连 AI：可配置外部 FastAPI 的生图、去背景、超分接口，不再依赖内置后端代理。
- 本地优先持久化：支持直接保存到选择的目录；不支持目录访问时，回退为单个 `.openkoma.json` 文件导入导出。

## 主要功能
- 画布与分镜
  - A4/A3 预设 + 自定义尺寸
  - 网格切割、手绘创建分镜、选中后二次切割
  - 斜切分镜支持画布角点拖拽与预设快速套用
- 对象编辑
  - 分镜/气泡拖拽、缩放、选中高亮
  - 一键批量设置所有分镜圆角与边框粗细
  - 可选 16 倍数尺寸吸附
- 图像流程
  - 单分镜本地导图
  - 与斜切分镜一致的手动裁剪编辑
  - 通过外部 AI 接口执行去背景与 2x 超分
  - 显示不拉伸（cover + clip）
- 页面与导出
  - 左侧页面列表与实时预览
  - 当前页导出 PNG
  - 全部页面按顺序导出 PDF
- 编辑器体验
  - 顶部单行工具栏 + 分类展开工具抽屉
  - 底部固定消息栏（可展开历史）
  - Radix Themes 明暗模式切换

## 快速开始
### 环境要求
- Node.js 18+
- npm 9+

### 启动
```bash
npm install
npm run dev
```

默认地址：
- 前端：`http://localhost:5173`

### 配置外部 AI 服务
打开应用后，在工具栏抽屉 `AI 服务` 中填写：
- 生图 URL
- 去背景 URL
- 超分 URL
- 共用 `Authorization` 请求头值

FastAPI 接口约定文档：
- `docs/fastapi-api.md`

### 构建
```bash
npm run build
```

## 保存与加载
- 在支持 File System Access API 的环境中，OpenKoma 会把 `project.json`、`history.log` 和图片资源保存到你选择的目录。
- 在不支持目录访问的环境中，OpenKoma 会回退为下载/加载单个 `.openkoma.json` 文件，并尽量把图片以内嵌 data URL 的方式一起保存。
- AI 服务的 `Authorization` 只会保存在浏览器 `localStorage`，不会写进项目文件。

## 快捷键
- `Cmd/Ctrl + Z`：撤销
- `Cmd/Ctrl + Shift + Z` 或 `Ctrl + Y`：重做
- `Delete` 或 `Backspace`：删除当前选中分镜/气泡

## Roadmap
<details>
  <summary><strong>开发路线图（点击展开）</strong></summary>

### 里程碑 A - 导出与发布
- [ ] PSD 分层导出
- [ ] 更完善的印刷导出预设

### 里程碑 B - 编辑效率
- [ ] 多选与批量编辑
- [ ] 分镜/气泡批量对齐与分布

### 里程碑 C - 模板与排版
- [ ] 高级漫画版式模板包
- [ ] 更丰富的字体排版与气泡尾巴编辑

</details>

## 引用
```bibtex
@software{openkoma2026,
  title = {OpenKoma: A Local-First AI Comic Editor with Incremental Reversible History},
  author = {OpenKoma Authors},
  year = {2026},
  url = {https://github.com/<your-org>/OpenKoma},
  license = {Apache-2.0}
}
```

## 协议
Apache License 2.0，详见 [LICENSE](./LICENSE)。
