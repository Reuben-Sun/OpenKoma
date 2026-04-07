# OpenKoma

## 项目简介

OpenKoma 是一个专注于漫画排版的编辑器，用户可以将绘制好的图像使用该工具进行分镜布局、裁剪、拼接、标注文本。

项目基于前端技术，非常轻量

## 效果展示

### 漫画布局

![sub](docs/sub.jpg)

### 半透明图片

![trans](docs/trans.jpg)

### 斜切分镜

![skew](docs/skew.jpg)

![split](docs/split.jpg)

### 文字

![text](docs/text.jpg)

### 编辑器界面

![edit](docs/edit.jpg)

## 核心能力

- 真正的斜切分镜：支持矩形、平行四边形、梯形，而不只是旋转矩形。
- 非破坏裁剪：导入原图始终保留，显示结果只由裁剪参数驱动。
- 与分镜形状一致的裁剪编辑：手动裁剪层会跟随分镜的斜切几何形状。
- 多页面工作流：可创建页面、调整顺序，并按页面顺序导出。
- 增量撤销重做：编辑历史以 forward/backward JSON patch 的形式记录。
- 本地优先持久化：支持直接保存到目录，也支持导出/导入单个 `.openkoma.json` 文件。
- 图像导出与PDF导出
- 历史记录与Undo/Redo

## 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 开发启动

```bash
npm install
npm run dev
```

默认地址：`http://localhost:5173`

## 开发路线图

- PSD 分层导出
- 多选与批量对齐工具
- 更多版式模板与排版控制
- 更完整的印刷导出预设

## 协议

Apache License 2.0，详见 [LICENSE](./LICENSE)。
