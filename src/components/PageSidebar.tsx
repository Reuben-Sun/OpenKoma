import { useMemo } from "react";
import { ProjectPage } from "../types";
import { useEditorStore } from "../lib/store";

const buttonClass =
  "rounded-lg border border-slate-500 bg-slate-800 px-2 py-1 text-xs text-slate-100 transition hover:border-blue-400 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40";

function PageMiniPreview({ page }: { page: ProjectPage }) {
  const preview = useMemo(() => {
    const scale = Math.min(1, 140 / page.canvas.width, 198 / page.canvas.height);
    const width = Math.max(70, Math.round(page.canvas.width * scale));
    const height = Math.max(100, Math.round(page.canvas.height * scale));
    return {
      scale,
      width,
      height
    };
  }, [page.canvas.height, page.canvas.width]);

  return (
    <div className="relative rounded-md border border-slate-400 bg-slate-100 shadow-inner" style={{ width: preview.width, height: preview.height }}>
      {page.panels.map((panel) => {
        const left = Math.max(0, panel.x * preview.scale);
        const top = Math.max(0, panel.y * preview.scale);
        const width = Math.max(2, panel.width * preview.scale);
        const height = Math.max(2, panel.height * preview.scale);
        const borderWidth = Math.max(1, panel.borderWidth * preview.scale);
        return (
          <div
            key={panel.id}
            className="absolute bg-white/80"
            style={{
              left,
              top,
              width,
              height,
              borderColor: panel.borderColor,
              borderWidth,
              borderStyle: "solid",
              borderRadius: Math.max(0, panel.borderRadius * preview.scale)
            }}
          />
        );
      })}

      {page.bubbles.map((bubble) => {
        const left = Math.max(0, bubble.x * preview.scale);
        const top = Math.max(0, bubble.y * preview.scale);
        const width = Math.max(2, bubble.width * preview.scale);
        const height = Math.max(2, bubble.height * preview.scale);
        const borderRadius = bubble.type === "circle" ? 999 : bubble.type === "rounded" ? 8 : 2;
        return (
          <div
            key={bubble.id}
            className="absolute bg-blue-100/55"
            style={{
              left,
              top,
              width,
              height,
              borderColor: "#2563eb",
              borderWidth: 1,
              borderStyle: "dashed",
              borderRadius
            }}
          />
        );
      })}
    </div>
  );
}

export default function PageSidebar() {
  const project = useEditorStore((state) => state.project);
  const setActivePage = useEditorStore((state) => state.setActivePage);
  const addPage = useEditorStore((state) => state.addPage);
  const deletePage = useEditorStore((state) => state.deletePage);
  const movePage = useEditorStore((state) => state.movePage);

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-700 bg-ink-900 shadow-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-100">页面</h3>
        <button className={buttonClass} onClick={() => addPage()}>
          + 新增
        </button>
      </div>

      <div className="space-y-2 overflow-auto p-2">
        {project.pages.map((page, index) => {
          const isActive = project.activePageId === page.id;
          const canMoveUp = index > 0;
          const canMoveDown = index < project.pages.length - 1;
          const canDelete = project.pages.length > 1;

          return (
            <div
              key={page.id}
              className={`rounded-xl border p-2 transition ${
                isActive ? "border-blue-400 bg-blue-500/15" : "border-slate-700 bg-ink-800 hover:border-slate-500"
              }`}
            >
              <button
                className="w-full space-y-2 text-left"
                onClick={() => setActivePage(page.id)}
                type="button"
                title={page.name}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-100">P{index + 1}</span>
                  <span className="text-[11px] text-slate-400">
                    {page.canvas.width}x{page.canvas.height}
                  </span>
                </div>
                <div className="flex justify-center">
                  <PageMiniPreview page={page} />
                </div>
                <div className="text-[11px] text-slate-400">
                  分镜 {page.panels.length} · 气泡 {page.bubbles.length}
                </div>
              </button>

              <div className="mt-2 flex items-center justify-between gap-1">
                <button
                  className={buttonClass}
                  disabled={!canMoveUp}
                  onClick={() => movePage(page.id, "up")}
                  type="button"
                >
                  上移
                </button>
                <button
                  className={buttonClass}
                  disabled={!canMoveDown}
                  onClick={() => movePage(page.id, "down")}
                  type="button"
                >
                  下移
                </button>
                <button
                  className={`${buttonClass} border-rose-600/70 hover:border-rose-400`}
                  disabled={!canDelete}
                  onClick={() => deletePage(page.id)}
                  type="button"
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
