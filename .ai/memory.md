# OpenKoma Memory

## 2026-04-05 - 初版实现（基于 .ai/design.md）

### 已落地技术栈
- 前端: React + TypeScript + Zustand + Konva + TailwindCSS
- 后端: Node.js + Express
- 存储: `project/project.json` + `project/images/*`

### 关键文件
- `src/types.ts`: Project/Canvas/Panel/Crop/Bubble 类型定义
- `src/lib/store.ts`: Zustand 主状态与动作（分镜、气泡、生成、裁剪、保存/加载）
- `src/components/CanvasEditor.tsx`: Konva 编辑器主画布
- `src/components/InspectorPanel.tsx`: 右侧属性编辑
- `src/components/Toolbar.tsx`: 顶部工具栏
- `server/index.js`: 本地 API 代理和项目 IO

### 当前功能覆盖
- P0: 画布 + Panel、选中 + Inspector、AI 生成、图片显示、基础裁剪
- P1: 气泡系统、间距/边框、竖排文字（使用 `writing-mode: vertical-rl`）
- 二次切割: 选中分镜后按行列切割为子分镜
- 手动绘制: 手绘模式下拖拽创建分镜

### AI 生成实现细节
- 接口: `POST /api/generate`
- 默认行为: 未配置 `AI_IMAGE_API_URL` 时生成本地 SVG 占位图（离线可用）
- 远端代理: 配置 `AI_IMAGE_API_URL` 后转发 `prompt/negativePrompt/width/height`
  - 支持远端返回 `url` 或 `imageBase64`
  - 下载/写入到 `project/images` 后回传本地可访问地址 `/assets/images/...`

### 非破坏裁剪实现
- `panel.image.original` 始终保留原图路径
- 裁剪参数存于 `panel.image.crop`
- Konva `Image.crop` 仅改变显示窗口，不改原始文件

### 已知未实现项
- undo/redo
- 导出 PNG/PDF/PSD
- 多选与批量操作
- 高级版式模板

### 验证结果
- `npm install` 成功
- `npm run build` 成功

## 2026-04-05 - 追加修正

- 构建脚本改为纯 type-check：
  - `tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.node.json --noEmit && vite build`
  - 避免产生 `vite.config.js/.d.ts` 与 `*.tsbuildinfo` 副产物
- 修复手绘分镜最小尺寸逻辑：拖拽小于 `24x24` 不再创建分镜
- 修复二次切割容错：`rows/cols` 强制最小为 `1`，提示文案使用安全值
- 后端远端 URL 解析改为 `new URL(body.url, "http://localhost")`，兼容相对路径返回

## 2026-04-05 - 新增 undo/redo 与导出

- 状态管理新增历史栈：
  - `historyPast: Project[]`
  - `historyFuture: Project[]`
  - `undo()` / `redo()`
  - 历史上限 `80`
- 绝大多数会修改 `project` 的动作都纳入历史（分镜、气泡、裁剪、生成图结果等）
- 键盘快捷键：
  - `Cmd/Ctrl + Z` 撤销
  - `Cmd/Ctrl + Shift + Z` 与 `Ctrl + Y` 重做
- 导出实现：
  - `CanvasEditor` 暴露 `exportPng()` / `exportPdf()`
  - 导出前临时把 Stage 缩放归一到 `1x`，按画布原始尺寸导出，避免受当前缩放倍率影响
  - PDF 通过 `jspdf` 将 PNG 嵌入单页文档导出
- 气泡文本从 DOM `Html` 改为 Konva `Text`，保证导出图中包含气泡文字

## 2026-04-05 - undo/redo 改为增量式历史

- 依赖新增：`fast-json-patch`
- 历史结构改为操作补丁：
  - `historyPast: { forward: Operation[]; backward: Operation[] }[]`
  - `historyFuture: { forward: Operation[]; backward: Operation[] }[]`
- 新增行为：
  - 每次状态变更通过 `compare(previous, next)` 计算 forward patch
  - 同步计算 backward patch，用于撤销
  - `undo` 应用 backward patch，`redo` 应用 forward patch
- 无实际变更时不再写入历史（避免空操作污染历史）
- 历史上限仍为 `80`，行为保持一致

## 2026-04-05 - 全局分镜样式 + 本地图像导入裁剪

- `Toolbar` 新增“全部分镜样式”：
  - 一键设置所有分镜是否圆角（圆角开关 + 半径）
  - 一键设置所有分镜边框粗细
- `store` 新增动作：
  - `setAllPanelsStyle({ borderRadius, borderWidth })`
  - `uploadLocalImageForPanel(id, file)`
- 新增本地图像上传链路：
  - 前端 `uploadLocalImage(file)` -> `POST /api/images/upload`
  - 服务端将原图写入 `project/images/*` 并返回 `/assets/images/...`
- `Inspector` 新增：
  - 选中分镜后可“导入本地图片”
  - “打开手动裁剪”弹窗：可拖拽框选保留区域
  - 保持非破坏流程：原图路径仍保存在 `panel.image.original`，只修改 `panel.image.crop`

## 2026-04-05 - 16 倍数尺寸吸附开关

- `Toolbar` 新增按钮：`16 倍数尺寸`
  - 开启后，拖动/缩放后会强制把对象宽高吸附到 16 的倍数
- `store` 新增状态：
  - `snapSizeTo16: boolean`
  - `toggleSnapSizeTo16(enabled?)`
- `CanvasEditor` 行为更新：
  - 分镜和气泡 `onTransformEnd` 时宽高吸附到 16 的倍数
  - `Transformer.boundBoxFunc` 在开启开关后实时吸附尺寸
  - `flipEnabled` 关闭，避免翻转导致吸附异常

## 2026-04-05 - 本地图片显示防拉伸 + 固定比例裁剪

- 分镜图片显示改为等比 `cover` 渲染：
  - `CanvasEditor/PanelImageLayer` 根据裁剪源尺寸或原图尺寸计算缩放
  - 显示时不再按分镜宽高直接拉伸图像
  - 通过 `Group clip` 裁掉超出区域，保证画面填充且不变形
- 可视化裁剪改为锁定分镜比例：
  - 裁剪框比例固定为分镜内可用区域比例（`(width - 2*gap):(height - 2*gap)`）
  - 拖拽框选时持续保持该比例，并在图像边界内自动收缩/约束
  - 已有裁剪会先归一化到目标比例，初始裁剪则居中生成
  - 弹窗中的“匹配比例最大区域”同样遵循固定比例
