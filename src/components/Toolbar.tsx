import { FormEvent, useEffect, useState } from "react";
import { useEditorStore } from "../lib/store";

const inputClass =
  "rounded-lg border border-slate-600 bg-ink-800 px-3 py-1 text-sm text-slate-100 outline-none ring-blue-500 transition focus:ring";

const buttonClass =
  "rounded-lg border border-slate-500 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 transition hover:border-blue-400 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50";

type ToolbarProps = {
  onExportPng: () => Promise<void>;
  onExportPdf: () => Promise<void>;
};

export default function Toolbar({ onExportPng, onExportPdf }: ToolbarProps) {
  const project = useEditorStore((state) => state.project);
  const selection = useEditorStore((state) => state.selection);
  const manualPanelMode = useEditorStore((state) => state.manualPanelMode);
  const busy = useEditorStore((state) => state.busy);
  const notice = useEditorStore((state) => state.notice);
  const historyPastCount = useEditorStore((state) => state.historyPast.length);
  const historyFutureCount = useEditorStore((state) => state.historyFuture.length);

  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const setProjectName = useEditorStore((state) => state.setProjectName);
  const setCanvasPreset = useEditorStore((state) => state.setCanvasPreset);
  const setCanvasSize = useEditorStore((state) => state.setCanvasSize);
  const splitGrid = useEditorStore((state) => state.splitGrid);
  const splitSelectedPanel = useEditorStore((state) => state.splitSelectedPanel);
  const toggleManualPanelMode = useEditorStore((state) => state.toggleManualPanelMode);
  const addBubble = useEditorStore((state) => state.addBubble);
  const saveProject = useEditorStore((state) => state.saveProject);
  const loadProject = useEditorStore((state) => state.loadProject);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);

  const [canvasWidth, setCanvasWidth] = useState(project.canvas.width);
  const [canvasHeight, setCanvasHeight] = useState(project.canvas.height);
  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(2);
  const [splitRows, setSplitRows] = useState(2);
  const [splitCols, setSplitCols] = useState(1);

  useEffect(() => {
    setCanvasWidth(project.canvas.width);
    setCanvasHeight(project.canvas.height);
  }, [project.canvas.height, project.canvas.width]);

  const applyCanvasSize = (event: FormEvent) => {
    event.preventDefault();
    setCanvasSize(canvasWidth, canvasHeight);
  };

  return (
    <header className="space-y-3 rounded-2xl border border-slate-700 bg-ink-900 p-3 shadow-panel">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} min-w-56 flex-1`}
          value={project.name}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="项目名称"
        />

        <select
          className={inputClass}
          value={project.canvas.preset ?? "custom"}
          onChange={(event) => setCanvasPreset(event.target.value as "A4" | "A3" | "custom")}
        >
          <option value="A4">A4</option>
          <option value="A3">A3</option>
          <option value="custom">Custom</option>
        </select>

        <form className="flex items-center gap-2" onSubmit={applyCanvasSize}>
          <input
            className={`${inputClass} w-24`}
            type="number"
            value={canvasWidth}
            onChange={(event) => setCanvasWidth(Number(event.target.value))}
          />
          <span className="text-slate-400">x</span>
          <input
            className={`${inputClass} w-24`}
            type="number"
            value={canvasHeight}
            onChange={(event) => setCanvasHeight(Number(event.target.value))}
          />
          <button type="submit" className={buttonClass}>
            应用画布
          </button>
        </form>

        <button className={buttonClass} disabled={historyPastCount === 0} onClick={() => undo()}>
          撤销
        </button>
        <button className={buttonClass} disabled={historyFutureCount === 0} onClick={() => redo()}>
          重做
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">网格切割</span>
        <input
          className={`${inputClass} w-16`}
          type="number"
          min={1}
          value={gridRows}
          onChange={(event) => setGridRows(Number(event.target.value))}
        />
        <span className="text-slate-400">x</span>
        <input
          className={`${inputClass} w-16`}
          type="number"
          min={1}
          value={gridCols}
          onChange={(event) => setGridCols(Number(event.target.value))}
        />
        <button className={buttonClass} onClick={() => splitGrid(gridRows, gridCols)}>
          切割画布
        </button>

        <button
          className={`${buttonClass} ${manualPanelMode ? "border-blue-400 bg-blue-500/30" : ""}`}
          onClick={() => toggleManualPanelMode()}
        >
          手绘分镜
        </button>

        <span className="ml-4 text-xs text-slate-400">选中分镜二次切割</span>
        <input
          className={`${inputClass} w-16`}
          type="number"
          min={1}
          value={splitRows}
          onChange={(event) => setSplitRows(Number(event.target.value))}
        />
        <span className="text-slate-400">x</span>
        <input
          className={`${inputClass} w-16`}
          type="number"
          min={1}
          value={splitCols}
          onChange={(event) => setSplitCols(Number(event.target.value))}
        />
        <button className={buttonClass} onClick={() => splitSelectedPanel(splitRows, splitCols)}>
          Split
        </button>
      </div>

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

        <button className={`${buttonClass} ml-4`} onClick={() => void onExportPng()}>
          导出 PNG
        </button>
        <button className={buttonClass} onClick={() => void onExportPdf()}>
          导出 PDF
        </button>

        <button
          className={`${buttonClass} ml-4`}
          disabled={busy.savingProject}
          onClick={() => {
            void saveProject();
          }}
        >
          {busy.savingProject ? "保存中..." : "保存项目"}
        </button>
        <button
          className={buttonClass}
          disabled={busy.loadingProject}
          onClick={() => {
            void loadProject();
          }}
        >
          {busy.loadingProject ? "加载中..." : "加载项目"}
        </button>

        <button
          className={`${buttonClass} border-rose-500 hover:border-rose-400`}
          disabled={!selection}
          onClick={() => deleteSelection()}
        >
          删除选中对象
        </button>
      </div>

      {notice ? <p className="text-sm text-blue-200">{notice}</p> : null}
    </header>
  );
}
