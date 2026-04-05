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

## 2026-04-05 - 手动裁剪交互升级 + 外部尺寸变化自动重裁剪

- 手动裁剪交互从“框选绘制”升级为“直接编辑裁剪框”：
  - 拖拽裁剪框内部：移动裁剪框位置
  - 拖拽裁剪框四条边：缩放裁剪框
  - 裁剪框比例始终锁定为分镜内可用区域比例（不允许自由拉伸）
  - 交互基于 Pointer Events + pointer capture，支持鼠标/触控的连续拖拽
- 分镜外部尺寸变化时自动重裁剪（保持中心优先）：
  - 在 `updatePanel` 触发 `replacePanel` 时检测分镜内框比例是否变化（宽高或 gap 导致）
  - 若比例变化且存在裁剪参数，自动把旧裁剪框归一化到新比例
  - 自动重裁剪尽量保持原裁剪中心不变，再进行边界约束
- 裁剪边界修复：
  - `setPanelCrop` 中 `x/y` 约束改为 `naturalSize - cropSize` 上限
  - 避免写入超出原图边界的裁剪框

## 2026-04-05 - 多页面管理侧栏 + PDF 按页顺序导出

- 数据模型从单页扩展为多页：
  - `Project` 改为 `pages: ProjectPage[] + activePageId`
  - 新增 `ProjectPage` 类型，页面内独立保存 `canvas/panels/bubbles`
- `store` 新增页面操作：
  - `setActivePage(id)`（仅切换 UI，不入历史）
  - `addPage()` / `deletePage(id)` / `movePage(id, "up" | "down")`（入增量历史）
  - 新增 `getActivePage(project)` 统一读取当前页
- `loadProject` 兼容旧项目结构：
  - 旧版 `canvas/panels/bubbles` 自动归一化为单页 `pages`
  - 多页项目会校验 `activePageId`，异常时回退到第一页
- UI 新增左侧页面预览栏 `PageSidebar`：
  - 页面缩略图预览
  - 点击切换页面
  - 新增 / 删除 / 上移 / 下移
- 导出行为更新：
  - PNG：导出当前页
  - PDF：按 `project.pages` 顺序逐页导出，自动切换活动页截图并在结束后恢复原活动页
- 相关面板与工具条全部切到“当前活动页”语义（Canvas/Inspector/Toolbar/Footer）。
- 本轮修复：
  - `normalizeLoadedProject` 中 `activePageId` 可选类型导致的 TS 报错
  - `npm run build` 已通过

## 2026-04-05 - 修复左侧页面预览空白

- 问题表现：
  - 页面内容编辑后，左侧缩略预览在部分场景下显示为空白/信息不足
- 根因：
  - 初版侧栏预览是简化 DOM 方框绘制，只显示基础轮廓，不包含真实分镜图像与裁剪结果
  - 在“无明显边框 + 以图像内容为主”的页面上，视觉上接近空白
- 修复方案：
  - `PageSidebar` 的 `PageMiniPreview` 改为 Konva 实时缩略渲染
  - 缩略图渲染路径包含：
    - 分镜边框与圆角
    - 本地导入/AI 图像（含 `crop + scale` 规则）
    - 气泡形状与文本（含竖排文本）
  - 预览使用 `Stage + Layer` 按画布比例缩放，确保编辑后可见内容及时同步
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 专业漫画编辑器风格重构（UI）

- 全局视觉系统升级：
  - `src/index.css` 建立统一主题变量（背景、面板、线条、文字、强调色）
  - 新增 `studio-*` 通用样式类（surface/input/select/textarea/button/chip/workspace）
  - 页面背景改为多层渐变 + 细网格纹理，滚动条与交互过渡统一
- 主框架与顶部工具区：
  - `src/App.tsx` 主布局改为专业编辑器三栏结构（页面栏/画布区/检查器）
  - `src/components/Toolbar.tsx` 改为分组控制台样式，保留原有功能逻辑
- 本轮补齐的三块区域：
  - `src/components/PageSidebar.tsx`：
    - 页面栏改为“胶片卡片”视觉，活动页高亮、信息层级更明确
    - 缩略图容器强化边框与阴影，页操作按钮统一到 `studio-btn`
  - `src/components/CanvasEditor.tsx`：
    - 画布区改为“工作台”风格，顶部状态芯片展示画布尺寸/手绘模式/16倍数吸附
    - 缩放条、画布承载层和阴影统一视觉，不改拖拽/缩放/导出逻辑
  - `src/components/InspectorPanel.tsx`：
    - 分镜/气泡/裁剪模块统一为卡片分区，控件切换到 `studio-*` 样式
    - 裁剪弹窗升级为编辑器化视觉，按钮层级（主操作/危险操作）明确
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 顶部工具栏改为单行 + 竖向抽屉

- `src/components/Toolbar.tsx` 交互调整：
  - 顶部默认改为单行紧凑栏，压缩主编辑区垂直空间占用
  - 常用操作（项目名、撤销/重做、保存/加载、PNG/PDF）保留在单行中
  - 新增“展开工具 / 收起工具”按钮，点击后在右侧弹出竖向工具抽屉
- 竖向抽屉内容：
  - 原有的画布设置、分镜布局、批量样式、对象与导出功能全部保留
  - 以纵向分组卡片显示，便于在不占用顶部高度的前提下继续完整编辑
- 通知展示：
  - `notice` 改为悬浮提示，不再强制占用顶栏第二行
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 工具抽屉可见性修复（改为固定右侧抽屉）

- 问题：
  - 顶栏“展开工具”在部分场景下点击后看不到内容（面板被主编辑区层级覆盖）
- 调整：
  - `Toolbar` 的工具面板由顶栏内 `absolute` 下拉改为 `fixed` 右侧抽屉
  - 抽屉开启时显示全屏半透明遮罩，点击遮罩可关闭
  - 增加 `Esc` 快捷关闭逻辑
  - 顶栏提高层级（`z-20`），避免被工作区压盖
- 结果：
  - 保持“默认单行”紧凑布局，同时保证抽屉展开稳定可见
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 工具栏改为“分类按钮 -> 单类别展开”

- 交互改造目标：
  - 顶栏保持单行紧凑，同时让每个工具类别独立展开，避免一次展示全部工具
- `src/components/Toolbar.tsx` 调整：
  - 新增工具类别状态 `activeCategory`（`canvas/layout/style/objects/export`）
  - 顶栏新增类别按钮组：每个类别一个按钮，点击只展开该类别
  - 再次点击同类别按钮可收起；`Esc` 或点击遮罩也可关闭
  - 右侧固定抽屉标题会随当前类别变化
- 类别拆分：
  - `对象` 和 `导出` 从原“对象与导出”拆开成两个独立类别
  - `导出` 类别中提供：
    - 导出 PNG（当前页）
    - 导出 PDF（全部页）
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 通知消息移到底栏正中

- 需求：
  - “已撤销”“项目加载完成”等提示统一显示在最下面状态栏的中间区域
- 实现：
  - `src/App.tsx`
    - 底栏从左右 `flex` 调整为三段式 `grid`（左状态 / 中间通知 / 右状态）
    - 从 store 读取 `notice`，在中间区域居中显示
  - `src/components/Toolbar.tsx`
    - 移除顶部悬浮 `notice` 提示，避免重复和位置冲突
- 效果：
  - 所有状态提示位置统一在底栏正中，视觉更稳定
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 底栏消息栏固定宽度 + 左对齐 + 上展开历史

- 需求：
  - 底栏消息栏宽度固定
  - 消息文本左对齐显示
  - 点击消息栏可向上展开历史记录
- 实现：
  - `src/App.tsx`
    - 新增 `noticeHistory`（最多保留 60 条）与 `historyOpen` 状态
    - 每次 `notice` 变更时记录一条历史（带 `HH:MM:SS` 时间）
    - 底栏中部消息改为固定宽度按钮（`w-[280px] sm:w-[360px] lg:w-[440px]`）
    - 当前消息文本使用左对齐 + 截断显示
    - 历史面板采用 `bottom-full` 定位，点击后向上展开
    - 增加“点击外部关闭”和 `Esc` 关闭历史面板
- 效果：
  - 保持底栏布局稳定，不因消息长短跳动
  - 可快速查看最近通知，不影响主编辑区空间
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 每次修改消息化 + 撤销/重做指向具体动作

- 需求：
  - 每一次项目修改都给出对应提示消息
  - 撤销/重做提示中要明确“撤销/重做的是哪一步”
- 实现：
  - `src/lib/store.ts`
    - 历史项 `HistoryEntry` 新增 `message` 字段，用于记录该次修改的动作描述
    - `withHistory` 增加 `message` 入参，并在成功写历史时自动写入 `notice`
    - `undo/redo` 提示改为：
      - `已撤销：<动作消息>`
      - `已重做：<动作消息>`
    - 为所有会修改 `project` 的动作补充明确消息（命名、画布尺寸、分页、分镜/气泡增删改、裁剪、导图、AI 生图等）
    - 新增 patch 描述函数：
      - `describePanelPatch`：按变更类型输出分镜修改消息
      - `describeBubblePatch`：按变更类型输出气泡修改消息
- 效果：
  - 每次实际修改都会即时进入底栏消息与历史
  - 撤销/重做不再是泛化提示，而是可追溯到具体动作
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 分镜图片与圆角边框贴合渲染

- 问题：
  - 图片导入后与分镜边框之间有可见缝隙，圆角场景下边缘贴合感不足
- 原因定位：
  - 图片显示区域由 `gap` 内缩
  - 旧版裁剪区域是矩形，圆角边框下角落观感不贴合
- 实现：
  - `src/components/CanvasEditor.tsx`
    - `PanelImageLayer` 的 clip 从矩形改为圆角路径裁剪（半径基于 `borderRadius - gap`）
    - 分镜渲染层级改为：背景填充 -> 图片 -> 边框描边（边框在最上层）
  - `src/components/PageSidebar.tsx`
    - 缩略预览同步同一套圆角裁剪与边框层级，保证预览与主画布一致
- 效果：
  - 图片与圆角边框视觉贴合明显改善
  - 边框不再被图片覆盖，边缘显示更稳定
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 默认分镜 gap/radius 置零 + 点击空白取消选中

- 需求：
  - 默认 `gap` 与 `radius` 为 0
  - 选中分镜后点击画布空白区域（不属于任何框）应取消选中
- 实现：
  - `src/lib/project.ts`
    - `DEFAULT_PANEL_STYLE` 调整为：`borderRadius: 0`、`gap: 0`
    - 网格分割创建的新分镜默认 `gap` 从 `10` 改为 `0`
  - `src/components/Toolbar.tsx`
    - 批量样式初始状态改为 `allRounded=false`、`allRadius=0`
    - 页面样本同步时不再把 `0` 半径回退成 `14`
  - `src/components/CanvasEditor.tsx`
    - 空白点击判定改为“只要不是分镜/气泡/Transformer 控件就视为空白”
    - 点击空白时：
      - 手绘模式下开始框选
      - 非手绘模式下执行 `clearSelection()`
    - 为分镜、气泡、Transformer 增加 name 标记，确保命中判定稳定
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 新版项目存档（布局 + 记忆 + 可恢复撤销重做）

- 目标：
  - 项目保存时不仅保留布局，还要保存“编辑记忆”（消息历史）与增量历史补丁
  - 项目加载后可恢复撤销/重做能力，并同步更新底栏消息与历史
- 存档格式升级（v2）：
  - `format: "openkoma-project"`
  - `version: 2`
  - `layout`: 当前项目布局 JSON（多页面）
  - `history.past / history.future`: 增量补丁历史（用于 undo/redo）
  - `memories`: 消息历史（含时间与时间戳）
- 关键实现：
  - `src/lib/store.ts`
    - 新增 `noticeHistory` 到全局 store，消息历史不再由 `App` 本地临时维护
    - 新增统一消息记录辅助函数，所有 `notice` 更新会写入 `noticeHistory`
    - `withHistory` 统一写入增量历史和对应消息，undo/redo 也会记录并可持久化
    - `saveProject` 改为保存 v2 文档（布局 + 历史 + 记忆）
    - `loadProject` 支持两种输入：
      - v2 存档：恢复布局 + undo/redo 历史 + 消息历史
      - 旧版布局文件：兼容加载，提示“旧版项目不包含可恢复编辑记忆”
    - 加载完成消息会明确恢复数量（撤销/重做/消息条数）
  - `src/App.tsx`
    - 移除组件内 `noticeHistory` 本地状态与收集逻辑
    - 直接消费 store 中的 `noticeHistory`，加载后历史面板即时可见
  - `src/lib/api.ts`
    - `saveProject/loadProject` 参数改为 `unknown`，由 store 负责版本解析
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 项目保存/加载改为路径选择（增量）

- 目标：
  - 点击“保存项目”时，若当前还没有绑定项目路径，则先弹出路径选择
  - 点击“加载项目”时，总是弹出路径选择
  - 如果当前已在一个已加载/已保存项目中，再次保存直接更新该项目文件，不再重复弹窗
- 实现：
  - `src/lib/store.ts`
    - 新增目录句柄状态：
      - `projectDirectoryHandle`
      - `projectDirectoryName`
    - 新增项目资产映射与临时 URL 管理：
      - `assetRefMap`
      - `transientObjectUrls`
    - 新增目录读写流程（基于 `showDirectoryPicker`）：
      - 保存到 `<选中目录>/project.json`
      - 加载时从 `<选中目录>/project.json` 读取
    - `saveProject` 行为调整：
      - 有目录句柄：直接保存
      - 无目录句柄：先弹目录选择，再保存
    - `loadProject` 行为调整：
      - 每次加载都先弹目录选择，再读取项目
    - 保留不支持目录选择环境的后备逻辑：
      - 回退到原后端 `/api/project/save` 与 `/api/project/load`
    - 新增图片资产物化逻辑：
      - 保存时将 `image.original` 统一写为项目目录内相对路径（如 `images/...`）
      - 加载时把相对路径恢复为可显示的 `blob:` URL，并维护映射
      - 切换加载项目时回收旧的临时 `blob:` URL，避免泄漏
- 存档版本：
  - `PROJECT_FILE_VERSION` 升级到 `3`
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 新增“另存为” + 未保存项目落盘到 `project/temp`

- 目标：
  - 新增“另存为”按钮
  - 新建/未保存项目统一先放在默认目录 `project/temp/<projectId>`
  - 正式保存到目标路径后，将临时项目从 `temp` 清理（等价“移动过去”）
- 前端改动：
  - `src/components/Toolbar.tsx`
    - 顶栏新增“另存为”按钮，调用 `saveProjectAs`
  - `src/lib/store.ts`
    - store 新增动作：`saveProjectAs()`
    - 抽出统一保存流程 `runSaveProjectFlow`：
      - `saveProject`：有路径直存，无路径弹目录选择
      - `saveProjectAs`：强制弹目录选择
    - 未保存项目自动使用 `project.id` 作为临时作用域 ID
    - 本地导图/AI 生图在未保存状态下写入 temp 作用域
    - 首次从 temp 正式保存成功后：
      - 将运行时图片引用重绑定到保存目录中的资源
      - 清理 `project/temp/<projectId>` 临时目录
    - 新增 store 订阅：
      - 当项目未绑定正式路径时，节流写入临时快照到 `project/temp/<projectId>/project.json`
- API 改动：
  - `src/lib/api.ts`
    - `generateImage` / `uploadLocalImage` 支持 `tempProjectId`
    - 新增：
      - `saveTempProjectSnapshot(projectId, project)`
      - `clearTempProjectSnapshot(projectId)`
- 服务端改动：
  - `server/index.js`
    - 新增 temp 根目录：`project/temp`
    - 生成图与本地上传支持按 `tempProjectId` 写入：
      - 默认：`project/images`
      - 临时项目：`project/temp/<projectId>/images`
    - 新增接口：
      - `POST /api/project/temp/save`
      - `POST /api/project/temp/clear`
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 顶部右侧新增黑暗模式开关（增量）

- 目标：
  - 在最顶部右侧增加一个“黑暗模式”开关按钮
  - 点击后全局 UI 可以在深色/浅色主题之间切换
  - 主题选择在刷新后保持
- 实现：
  - `src/lib/store.ts`
    - 新增主题状态：
      - `themeMode: "dark" | "light"`
    - 新增主题动作：
      - `setThemeMode(mode)`
      - `toggleThemeMode()`
    - 新增本地持久化：
      - `localStorage` 键：`openkoma-theme-mode`
      - 首次初始化优先读取本地值，否则按系统 `prefers-color-scheme` 推断
    - 切换主题时发出消息：
      - `已切换为黑暗模式`
      - `已切换为明亮模式`
  - `src/components/Toolbar.tsx`
    - 顶栏右侧工具分组旁新增主题开关按钮
    - 按当前主题显示文案（黑暗模式/明亮模式）并可一键切换
  - `src/App.tsx`
    - 监听 `themeMode`，将 `data-theme` 写入 `document.documentElement`
    - 消息栏文本颜色改为主题变量，避免浅色模式下对比度不足
  - `src/index.css`
    - 新增 `:root[data-theme=\"light\"]` 变量覆盖
    - 为 `body` 背景、网格遮罩、滚动条、面板/输入框/按钮/工作区等提供浅色模式样式
    - 保持默认深色主题视觉不变
- 验证：
  - `npm run build` 通过

## 2026-04-05 - 画布状态栏简化 + 主题切换改为开关样式（增量）

- 目标：
  - 删除画布上方占空间的状态栏（`画布尺寸 / 手绘分镜 ON-OFF / 16 倍数吸附 ON-OFF`）
  - 保留必要信息但减少视觉干扰
  - 将顶部右侧主题切换改为更直观的“开关”控件
- 实现：
  - `src/components/CanvasEditor.tsx`
    - 移除画布顶部整条 sticky 状态栏
    - 改为右上角悬浮的紧凑缩放控制（`- / 百分比 / 滑杆 / +`）
    - 新增 `clampZoom` 与 `adjustZoom`，统一限制缩放区间为 `0.1 ~ 1`
  - `src/components/Toolbar.tsx`
    - 将原文字按钮改为 `role=\"switch\"` 的主题开关
    - 使用 `data-mode`（`light` / `dark`）驱动视觉状态
  - `src/index.css`
    - 新增 `theme-switch` 系列样式（滑块、双标签、focus/hover、深浅主题适配）
- 简化策略：
  - `画布尺寸` 保留在底部状态栏即可
  - `手绘分镜`、`16 倍数吸附` 属于操作模式，放在工具抽屉内更合理，不必常驻画布顶部
- 验证：
  - `npm run build` 通过
