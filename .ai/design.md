下面给你一个**面向 Codex 的完整产品 + 技术设计 Markdown**，已经尽量写成“可以直接按这个实现”的规格文档（偏工程实现导向，而不是概念说明）。

---

# 📘 AI 漫画编辑器（本地版）设计文档

## 1. 项目目标

实现一个本地运行的 AI 漫画编辑器，支持：

* 自定义画幅（如 A4）
* 将画布切割为多个漫画分镜（Panel）
* 点击分镜进行选中与编辑
* 调用 AI 文生图接口生成图像
* 支持分镜的二次裁剪（非 destructive）
* 支持漫画气泡与文字排版
* 高自由度布局（边距 / 间距 / 边框）

---

## 2. 技术架构

### 2.1 技术选型

```text
前端：
- React + TypeScript
- Zustand（状态管理）
- Konva.js（画布操作）
- TailwindCSS（UI）

后端（本地）：
- Node.js / Python（任选）
- 提供 AI 文生图接口代理

数据存储：
- 本地 JSON（项目文件）
- 图片存储在本地目录
```

---

## 3. 核心数据结构

### 3.1 Project

```ts
type Project = {
  id: string
  name: string
  canvas: CanvasConfig
  panels: Panel[]
  bubbles: Bubble[]
}
```

---

### 3.2 画布 Canvas

```ts
type CanvasConfig = {
  width: number      // 像素
  height: number
  preset?: "A4" | "A3" | "custom"
  dpi?: number
}
```

> A4 推荐：

```ts
A4: 2480 x 3508 (300dpi)
```

---

### 3.3 分镜 Panel

```ts
type Panel = {
  id: string

  // 位置 & 尺寸（相对于画布）
  x: number
  y: number
  width: number
  height: number

  // 样式
  borderWidth: number
  borderColor: string
  borderRadius: number
  gap: number

  // 图像
  image?: {
    original: string   // 原始图路径
    crop?: CropConfig  // 裁剪参数
  }

  // AI 生成参数
  prompt?: string
  negativePrompt?: string
}
```

---

### 3.4 裁剪 Crop（非破坏）

```ts
type CropConfig = {
  x: number
  y: number
  width: number
  height: number
  scale: number
}
```

> ⚠️ 原图必须保留，只改变显示区域

---

### 3.5 气泡 Bubble

```ts
type Bubble = {
  id: string

  type: "rect" | "rounded" | "circle"

  x: number
  y: number
  width: number
  height: number

  text: string

  // 排版
  direction: "horizontal" | "vertical"

  fontSize: number
  fontFamily: string

  // 样式
  background: string
  borderColor: string
}
```

---

## 4. UI 设计

### 4.1 主布局

```text
+--------------------------------------------------+
| Toolbar                                          |
+-------------------+------------------------------+
| Canvas            | Inspector Panel              |
|                   |                              |
| (Konva Stage)     | 属性编辑                     |
|                   | - 分镜信息                   |
|                   | - Prompt                     |
|                   | - 生成按钮                   |
|                   |                              |
+-------------------+------------------------------+
```

---

### 4.2 Canvas 交互

#### 基础能力

* 点击 Panel → 高亮选中（描边）
* 拖动 Panel → 移动
* 拖拽边缘 → resize
* 多选（可选）

---

### 4.3 分镜切割

支持三种方式：

#### 1️⃣ 自动网格

```ts
splitGrid(rows: number, cols: number)
```

#### 2️⃣ 手动绘制

* 鼠标拖拽创建 Panel

#### 3️⃣ 二次切割

* 选中 Panel → “Split”
* 在内部继续划分子 Panel

---

## 5. 核心功能

---

### 5.1 Panel 选中

```ts
onClickPanel(panelId) {
  setSelected(panelId)
}
```

渲染：

```ts
stroke = selected ? "blue" : "black"
```

---

### 5.2 AI 生成图像

#### 请求格式

```ts
POST /generate

{
  prompt: string
  width: number
  height: number
}
```

#### 调用逻辑

```ts
async function generate(panel: Panel) {
  const res = await api.generate({
    prompt: panel.prompt,
    width: panel.width,
    height: panel.height
  })

  panel.image.original = res.url
}
```

---

### 5.3 图像裁剪（关键）

#### 原则

* 不修改原图
* 只改变显示区域

#### 渲染逻辑

```ts
drawImage({
  image,
  cropX,
  cropY,
  cropWidth,
  cropHeight
})
```

---

### 5.4 Panel 间距 & 边框

```ts
panelStyle = {
  margin: panel.gap,
  borderWidth: panel.borderWidth,
  borderRadius: panel.borderRadius
}
```

---

### 5.5 气泡系统

#### 创建气泡

```ts
createBubble(type: "rect" | "circle")
```

#### 文字排版

##### 横排

```css
writing-mode: horizontal-tb;
```

##### 竖排（漫画关键）

```css
writing-mode: vertical-rl;
```

---

## 6. 渲染层（Konva）

### 6.1 Panel 渲染

```tsx
<Group>
  <Rect />
  <Image />
</Group>
```

---

### 6.2 裁剪实现

```tsx
<Image
  image={img}
  crop={{
    x: crop.x,
    y: crop.y,
    width: crop.width,
    height: crop.height
  }}
/>
```

---

### 6.3 气泡

```tsx
<Group>
  <Rect | Circle />
  <Text />
</Group>
```

---

## 7. 状态管理（Zustand）

```ts
type Store = {
  project: Project

  selectedPanelId?: string

  selectPanel(id: string): void

  updatePanel(id: string, data: Partial<Panel>): void

  generateImage(id: string): Promise<void>
}
```

---

## 8. 文件存储

```text
/project
  project.json
  /images
    panel_1.png
    panel_2.png
```

---

## 9. 可扩展功能（建议）

### 9.1 高级布局

* 自动漫画分镜模板
* 类似日本漫画排版

---

### 9.2 AI增强

* Inpainting（局部重绘）
* ControlNet（姿态控制）

---

### 9.3 导出

* PNG（整页）
* PDF
* PSD（分层）

---

### 9.4 历史记录

```ts
undo()
redo()
```

---

## 10. MVP 优先级

### P0（必须）

* 画布 + Panel
* 选中 + Inspector
* AI 生成
* 图片显示
* 基础裁剪

---

### P1

* 气泡
* 间距 / 边框
* 竖排文字

---

### P2

* 子 Panel
* 导出
* undo/redo

---

## 11. Codex 实现建议

你可以让 Codex 按以下顺序生成代码：

1. 初始化 React + Konva 项目
2. 实现 Canvas + Panel 渲染
3. 实现 Panel 选中逻辑
4. 实现右侧 Inspector
5. 接入 AI API
6. 实现 Crop UI
7. 实现 Bubble 系统

---

## 12. Prompt 示例

```text
漫画分镜，一个少年站在雨中，赛博朋克风格，高细节
```

---

## 13. 关键难点提示（给 Codex）

```text
1. Crop 必须非破坏（保留 original）
2. Panel 坐标必须相对 Canvas
3. Konva Image crop vs scale 区别
4. 竖排文字使用 CSS writing-mode
5. 状态必须可序列化（用于保存）
```

---

如果你下一步想继续，我可以帮你把这个文档升级成：

* 👉 **完整前端代码骨架（可直接运行）**
* 👉 **Konva 编辑器核心实现**
* 👉 **类似 Figma 的交互系统设计（更专业）**
* 👉 **支持 LoRA / 风格一致性的漫画生成方案**

直接说你想做到哪个深度就行 👍
