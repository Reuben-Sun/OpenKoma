import { FormEvent, useEffect, useState } from "react";
import { Switch } from "@radix-ui/themes";
import { checkAiServiceHealth } from "../lib/api";
import { getActivePage, useEditorStore } from "../lib/store";
import { AiServiceConfig } from "../types";

const inputClass = "studio-input h-9 px-3 text-sm";
const selectClass = "studio-select h-9 px-3 text-sm";
const buttonClass = "studio-btn px-3 py-1.5 text-sm";
const compactInputClass = "studio-input h-8 min-w-[180px] flex-1 px-3 text-sm font-semibold";
const compactButtonClass = "studio-btn h-8 px-2.5 text-xs";
const primaryButtonClass = `${buttonClass} studio-btn-primary`;
const dangerButtonClass = `${buttonClass} studio-btn-danger`;
const groupClass = "studio-subtle space-y-2 rounded-2xl p-3";
const groupTitleClass = "text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)]";

type ToolCategory = "canvas" | "layout" | "style" | "objects" | "service" | "export";

const categories: ToolCategory[] = ["canvas", "layout", "style", "objects", "service", "export"];

const categoryTitleMap: Record<ToolCategory, string> = {
  canvas: "画布设置",
  layout: "分镜布局",
  style: "批量样式",
  objects: "对象",
  service: "服务配置",
  export: "导出"
};

type ToolbarProps = {
  onExportPng: () => Promise<void>;
  onExportPdf: () => Promise<void>;
};

type ServiceHealthState =
  | {
      tone: "success" | "error";
      message: string;
    }
  | null;

export default function Toolbar({ onExportPng, onExportPdf }: ToolbarProps) {
  const project = useEditorStore((state) => state.project);
  const activePage = useEditorStore((state) => getActivePage(state.project));
  const selection = useEditorStore((state) => state.selection);
  const manualPanelMode = useEditorStore((state) => state.manualPanelMode);
  const snapSizeTo16 = useEditorStore((state) => state.snapSizeTo16);
  const themeMode = useEditorStore((state) => state.themeMode);
  const busy = useEditorStore((state) => state.busy);
  const aiServiceConfig = useEditorStore((state) => state.aiServiceConfig);
  const historyPastCount = useEditorStore((state) => state.historyPast.length);
  const historyFutureCount = useEditorStore((state) => state.historyFuture.length);

  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const setNotice = useEditorStore((state) => state.setNotice);
  const setProjectName = useEditorStore((state) => state.setProjectName);
  const setAiServiceConfig = useEditorStore((state) => state.setAiServiceConfig);
  const setCanvasPreset = useEditorStore((state) => state.setCanvasPreset);
  const setCanvasSize = useEditorStore((state) => state.setCanvasSize);
  const setAllPanelsStyle = useEditorStore((state) => state.setAllPanelsStyle);
  const splitGrid = useEditorStore((state) => state.splitGrid);
  const splitSelectedPanel = useEditorStore((state) => state.splitSelectedPanel);
  const toggleManualPanelMode = useEditorStore((state) => state.toggleManualPanelMode);
  const toggleSnapSizeTo16 = useEditorStore((state) => state.toggleSnapSizeTo16);
  const setThemeMode = useEditorStore((state) => state.setThemeMode);
  const addBubble = useEditorStore((state) => state.addBubble);
  const saveProject = useEditorStore((state) => state.saveProject);
  const saveProjectAs = useEditorStore((state) => state.saveProjectAs);
  const loadProject = useEditorStore((state) => state.loadProject);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);

  const [canvasWidth, setCanvasWidth] = useState(activePage.canvas.width);
  const [canvasHeight, setCanvasHeight] = useState(activePage.canvas.height);
  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(2);
  const [splitRows, setSplitRows] = useState(2);
  const [splitCols, setSplitCols] = useState(1);
  const [allRounded, setAllRounded] = useState(false);
  const [allRadius, setAllRadius] = useState(0);
  const [allBorderWidth, setAllBorderWidth] = useState(4);
  const [activeCategory, setActiveCategory] = useState<ToolCategory | null>(null);
  const [checkingServiceHealth, setCheckingServiceHealth] = useState(false);
  const [serviceHealthState, setServiceHealthState] = useState<ServiceHealthState>(null);

  useEffect(() => {
    setCanvasWidth(activePage.canvas.width);
    setCanvasHeight(activePage.canvas.height);
  }, [activePage.canvas.height, activePage.canvas.width, activePage.id]);

  useEffect(() => {
    const sample = activePage.panels[0];
    if (!sample) {
      return;
    }
    setAllRounded(sample.borderRadius > 0);
    setAllRadius(sample.borderRadius);
    setAllBorderWidth(sample.borderWidth);
  }, [activePage.panels]);

  useEffect(() => {
    if (!activeCategory) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveCategory(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeCategory]);

  useEffect(() => {
    setServiceHealthState(null);
  }, [aiServiceConfig.authorization, aiServiceConfig.baseUrl]);

  const applyCanvasSize = (event: FormEvent) => {
    event.preventDefault();
    setCanvasSize(canvasWidth, canvasHeight);
  };

  const toggleCategory = (category: ToolCategory) => {
    setActiveCategory((current) => (current === category ? null : category));
  };

  const patchAiServiceConfig = (key: keyof AiServiceConfig) => (value: string) => {
    setAiServiceConfig({
      [key]: value
    } as Partial<AiServiceConfig>);
  };

  const runServiceHealthCheck = async () => {
    setCheckingServiceHealth(true);
    setServiceHealthState(null);

    try {
      const result = await checkAiServiceHealth(aiServiceConfig);
      const message = result.detail ? `${result.message} · ${result.detail}` : result.message;
      setServiceHealthState({
        tone: "success",
        message
      });
      setNotice(`AI 服务检查通过：${message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "服务检查失败";
      setServiceHealthState({
        tone: "error",
        message
      });
      setNotice(`AI 服务检查失败：${message}`);
    } finally {
      setCheckingServiceHealth(false);
    }
  };

  return (
    <header className="studio-surface relative z-20 p-2.5">
      <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-0.5">
        <span className="studio-chip px-3 py-1 text-[11px] uppercase tracking-[0.14em]">OpenKoma Studio</span>
        <input
          className={compactInputClass}
          value={project.name}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="项目名称"
        />
        <button className={compactButtonClass} disabled={historyPastCount === 0} onClick={() => undo()}>
          撤销
        </button>
        <button className={compactButtonClass} disabled={historyFutureCount === 0} onClick={() => redo()}>
          重做
        </button>
        <button
          className={compactButtonClass}
          disabled={busy.savingProject}
          onClick={() => {
            void saveProject();
          }}
        >
          {busy.savingProject ? "保存中..." : "保存项目"}
        </button>
        <button
          className={compactButtonClass}
          disabled={busy.savingProject}
          onClick={() => {
            void saveProjectAs();
          }}
        >
          {busy.savingProject ? "处理中..." : "另存为"}
        </button>
        <button
          className={compactButtonClass}
          disabled={busy.loadingProject}
          onClick={() => {
            void loadProject();
          }}
        >
          {busy.loadingProject ? "加载中..." : "加载项目"}
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          {categories.map((category) => (
            <button
              key={category}
              className={`${compactButtonClass} ${activeCategory === category ? "studio-btn-primary" : ""}`}
              onClick={() => toggleCategory(category)}
            >
              {categoryTitleMap[category]}
            </button>
          ))}
          <div className="studio-subtle flex h-8 items-center gap-2 rounded-full px-2">
            <span className={`text-[11px] ${themeMode === "light" ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
              亮
            </span>
            <Switch
              size="2"
              color="cyan"
              checked={themeMode === "dark"}
              onCheckedChange={(checked) => setThemeMode(checked ? "dark" : "light")}
              aria-label="切换黑暗模式"
            />
            <span className={`text-[11px] ${themeMode === "dark" ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
              暗
            </span>
          </div>
        </div>
      </div>

      {activeCategory ? (
        <>
          <button
            className="fixed inset-0 z-40 bg-[rgba(2,8,14,0.36)] backdrop-blur-[1px]"
            type="button"
            aria-label="关闭工具抽屉"
            onClick={() => setActiveCategory(null)}
          />

          <aside className="studio-surface fixed right-3 top-[84px] z-50 w-[340px] max-w-[92vw] max-h-[calc(100vh-96px)] overflow-auto p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                {categoryTitleMap[activeCategory]}工具
              </span>
              <button className={compactButtonClass} onClick={() => setActiveCategory(null)}>
                关闭
              </button>
            </div>

            {activeCategory === "canvas" ? (
              <section className={groupClass}>
                <p className={groupTitleClass}>画布设置</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={`${selectClass} min-w-[96px]`}
                    value={activePage.canvas.preset ?? "custom"}
                    onChange={(event) => setCanvasPreset(event.target.value as "A4" | "A3" | "custom")}
                  >
                    <option value="A4">A4</option>
                    <option value="A3">A3</option>
                    <option value="custom">Custom</option>
                  </select>
                  <form className="flex items-center gap-2" onSubmit={applyCanvasSize}>
                    <input
                      className={`${inputClass} w-24 px-2`}
                      type="number"
                      value={canvasWidth}
                      onChange={(event) => setCanvasWidth(Number(event.target.value))}
                    />
                    <span className="text-[var(--text-secondary)]">x</span>
                    <input
                      className={`${inputClass} w-24 px-2`}
                      type="number"
                      value={canvasHeight}
                      onChange={(event) => setCanvasHeight(Number(event.target.value))}
                    />
                    <button type="submit" className={primaryButtonClass}>
                      应用画布
                    </button>
                  </form>
                </div>
              </section>
            ) : null}

            {activeCategory === "layout" ? (
              <section className={groupClass}>
                <p className={groupTitleClass}>分镜布局</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--text-secondary)]">网格切割</span>
                  <input
                    className={`${inputClass} w-16 px-2`}
                    type="number"
                    min={1}
                    value={gridRows}
                    onChange={(event) => setGridRows(Number(event.target.value))}
                  />
                  <span className="text-[var(--text-secondary)]">x</span>
                  <input
                    className={`${inputClass} w-16 px-2`}
                    type="number"
                    min={1}
                    value={gridCols}
                    onChange={(event) => setGridCols(Number(event.target.value))}
                  />
                  <button className={buttonClass} onClick={() => splitGrid(gridRows, gridCols)}>
                    切割画布
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className={`${buttonClass} ${manualPanelMode ? "border-cyan-300/70 bg-cyan-500/25" : ""}`}
                    onClick={() => toggleManualPanelMode()}
                  >
                    手绘分镜
                  </button>
                  <button
                    className={`${buttonClass} ${snapSizeTo16 ? "border-emerald-300/70 bg-emerald-500/25" : ""}`}
                    onClick={() => toggleSnapSizeTo16()}
                  >
                    16 倍数尺寸
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--text-secondary)]">选中分镜二次切割</span>
                  <input
                    className={`${inputClass} w-16 px-2`}
                    type="number"
                    min={1}
                    value={splitRows}
                    onChange={(event) => setSplitRows(Number(event.target.value))}
                  />
                  <span className="text-[var(--text-secondary)]">x</span>
                  <input
                    className={`${inputClass} w-16 px-2`}
                    type="number"
                    min={1}
                    value={splitCols}
                    onChange={(event) => setSplitCols(Number(event.target.value))}
                  />
                  <button className={buttonClass} onClick={() => splitSelectedPanel(splitRows, splitCols)}>
                    应用
                  </button>
                </div>
              </section>
            ) : null}

            {activeCategory === "style" ? (
              <section className={groupClass}>
                <p className={groupTitleClass}>批量样式</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input type="checkbox" checked={allRounded} onChange={(event) => setAllRounded(event.target.checked)} />
                    圆角
                  </label>
                  <input
                    className={`${inputClass} w-20 px-2`}
                    type="number"
                    min={0}
                    value={allRadius}
                    disabled={!allRounded}
                    onChange={(event) => setAllRadius(Math.max(0, Number(event.target.value)))}
                  />
                  <span className="text-xs text-[var(--text-secondary)]">边框</span>
                  <input
                    className={`${inputClass} w-20 px-2`}
                    type="number"
                    min={0}
                    value={allBorderWidth}
                    onChange={(event) => setAllBorderWidth(Math.max(0, Number(event.target.value)))}
                  />
                  <button
                    className={primaryButtonClass}
                    onClick={() =>
                      setAllPanelsStyle({
                        borderRadius: allRounded ? allRadius : 0,
                        borderWidth: allBorderWidth
                      })
                    }
                  >
                    应用到全部分镜
                  </button>
                </div>
              </section>
            ) : null}

            {activeCategory === "objects" ? (
              <section className={groupClass}>
                <p className={groupTitleClass}>对象</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button className={buttonClass} onClick={() => addBubble("rect")}>
                    新建矩形气泡
                  </button>
                  <button className={buttonClass} onClick={() => addBubble("rounded")}>
                    新建圆角气泡
                  </button>
                  <button className={buttonClass} onClick={() => addBubble("circle")}>
                    新建圆形气泡
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button className={dangerButtonClass} disabled={!selection} onClick={() => deleteSelection()}>
                    删除选中对象
                  </button>
                </div>
              </section>
            ) : null}

            {activeCategory === "service" ? (
              <section className={groupClass}>
                <p className={groupTitleClass}>外部 AI 服务</p>
                <div className="space-y-1">
                  <p className="text-xs text-[var(--text-secondary)]">
                    填写服务根地址后，OpenKoma 会自动调用固定端点：`/generate`、`/remove-background`、`/upscale`。
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    `Authorization` 为可选项，只保存在当前浏览器的 `localStorage`。你也可以先点检查按钮验证 `/health` 是否可访问。
                  </p>
                </div>

                <label className="space-y-1">
                  <span className={groupTitleClass}>服务 URL</span>
                  <input
                    className={inputClass}
                    value={aiServiceConfig.baseUrl}
                    placeholder="https://your-fastapi.example.com"
                    onChange={(event) => patchAiServiceConfig("baseUrl")(event.target.value)}
                  />
                </label>

                <label className="space-y-1">
                  <span className={groupTitleClass}>身份认证（可选）</span>
                  <input
                    className={inputClass}
                    value={aiServiceConfig.authorization}
                    placeholder="Authorization / Bearer your-token"
                    autoComplete="off"
                    onChange={(event) => patchAiServiceConfig("authorization")(event.target.value)}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button className={primaryButtonClass} disabled={checkingServiceHealth} onClick={() => void runServiceHealthCheck()}>
                    {checkingServiceHealth ? "检查中..." : "检查 /health"}
                  </button>
                  {serviceHealthState ? (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        serviceHealthState.tone === "success"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-200"
                      }`}
                    >
                      {serviceHealthState.message}
                    </span>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeCategory === "export" ? (
              <section className={groupClass}>
                <p className={groupTitleClass}>导出</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button className={primaryButtonClass} onClick={() => void onExportPng()}>
                    导出 PNG（当前页）
                  </button>
                  <button className={primaryButtonClass} onClick={() => void onExportPdf()}>
                    导出 PDF（全部页）
                  </button>
                </div>
              </section>
            ) : null}
          </aside>
        </>
      ) : null}

    </header>
  );
}
