import { useCallback, useEffect, useRef, useState } from "react";
import CanvasEditor, { CanvasEditorHandle } from "./components/CanvasEditor";
import InspectorPanel from "./components/InspectorPanel";
import PageSidebar from "./components/PageSidebar";
import Toolbar from "./components/Toolbar";
import { getActivePage, useEditorStore } from "./lib/store";

export default function App() {
  const project = useEditorStore((state) => state.project);
  const activePage = useEditorStore((state) => getActivePage(state.project));
  const themeMode = useEditorStore((state) => state.themeMode);
  const notice = useEditorStore((state) => state.notice);
  const noticeHistory = useEditorStore((state) => state.noticeHistory);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);

  const canvasEditorRef = useRef<CanvasEditorHandle | null>(null);
  const noticeBarRef = useRef<HTMLDivElement | null>(null);
  const activePageNumber = project.pages.findIndex((page) => page.id === project.activePageId) + 1;
  const [historyOpen, setHistoryOpen] = useState(false);

  const exportPng = useCallback(async () => {
    if (!canvasEditorRef.current) {
      return;
    }
    await canvasEditorRef.current.exportPng();
  }, []);

  const exportPdf = useCallback(async () => {
    if (!canvasEditorRef.current) {
      return;
    }
    await canvasEditorRef.current.exportPdf();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      const editing = tag === "input" || tag === "textarea" || target?.isContentEditable;
      if (editing) {
        return;
      }

      const commandPressed = event.metaKey || event.ctrlKey;
      if (commandPressed && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }

        if (key === "y") {
          event.preventDefault();
          redo();
          return;
        }
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelection, redo, undo]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    if (!historyOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!noticeBarRef.current?.contains(event.target as Node)) {
        setHistoryOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [historyOpen]);

  return (
    <div className="app-shell">
      <main className="mx-auto flex h-[calc(100vh-28px)] max-w-[1920px] min-w-0 flex-col gap-3 text-[var(--text-primary)]">
        <Toolbar onExportPng={exportPng} onExportPdf={exportPdf} />

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[274px_minmax(740px,1fr)_400px]">
          <div className="min-h-0">
            <PageSidebar />
          </div>

          <div className="min-h-0">
            <CanvasEditor ref={canvasEditorRef} />
          </div>

          <div className="min-h-0">
            <InspectorPanel />
          </div>
        </section>

        <footer className="studio-surface grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2.5 text-xs text-[var(--text-secondary)]">
          <div className="flex min-w-0 flex-wrap items-center gap-2 justify-self-start">
            <span className="studio-chip px-2.5 py-1">Page {activePageNumber} / {project.pages.length}</span>
            <span className="studio-chip px-2.5 py-1">
              Canvas {activePage.canvas.width} x {activePage.canvas.height}
            </span>
          </div>

          <div className="justify-self-center" ref={noticeBarRef}>
            <div className="relative">
              {historyOpen ? (
                <div className="studio-surface absolute bottom-full left-0 right-0 z-30 mb-2 max-h-56 overflow-auto p-2">
                  <div className="mb-1 px-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">消息历史</div>
                  {noticeHistory.length === 0 ? (
                    <p className="px-1 py-1 text-xs text-[var(--text-secondary)]">暂无消息</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {noticeHistory.map((entry) => (
                        <li key={entry.id} className="studio-subtle rounded-lg px-2 py-1.5 text-left">
                          <p className="text-xs text-[var(--text-primary)]">{entry.text}</p>
                          <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{entry.time}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              <button
                type="button"
                className="studio-subtle flex h-[30px] w-[280px] items-center justify-between gap-2 rounded-lg px-3 text-left sm:w-[360px] lg:w-[440px]"
                onClick={() => setHistoryOpen((open) => !open)}
                title={notice ?? "暂无消息"}
              >
                <span className="truncate text-xs text-[var(--text-primary)]">{notice ?? "准备就绪"}</span>
                <span className="text-[10px] text-[var(--text-secondary)]">{historyOpen ? "收起" : "历史"}</span>
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 justify-self-end">
            <span className="studio-chip px-2.5 py-1">Panels {activePage.panels.length}</span>
            <span className="studio-chip px-2.5 py-1">Bubbles {activePage.bubbles.length}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
