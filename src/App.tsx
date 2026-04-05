import { useCallback, useEffect, useRef } from "react";
import CanvasEditor, { CanvasEditorHandle } from "./components/CanvasEditor";
import InspectorPanel from "./components/InspectorPanel";
import PageSidebar from "./components/PageSidebar";
import Toolbar from "./components/Toolbar";
import { getActivePage, useEditorStore } from "./lib/store";

export default function App() {
  const project = useEditorStore((state) => state.project);
  const activePage = useEditorStore((state) => getActivePage(state.project));
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);

  const canvasEditorRef = useRef<CanvasEditorHandle | null>(null);
  const activePageNumber = project.pages.findIndex((page) => page.id === project.activePageId) + 1;

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

        <footer className="studio-surface flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-2">
            <span className="studio-chip px-2.5 py-1">Page {activePageNumber} / {project.pages.length}</span>
            <span className="studio-chip px-2.5 py-1">
              Canvas {activePage.canvas.width} x {activePage.canvas.height}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="studio-chip px-2.5 py-1">Panels {activePage.panels.length}</span>
            <span className="studio-chip px-2.5 py-1">Bubbles {activePage.bubbles.length}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
