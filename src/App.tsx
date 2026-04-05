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
    <main className="flex h-screen flex-col gap-3 p-3 text-slate-100">
      <Toolbar onExportPng={exportPng} onExportPdf={exportPdf} />

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="min-h-0 lg:col-span-2">
          <PageSidebar />
        </div>

        <div className="min-h-0 lg:col-span-6">
          <CanvasEditor ref={canvasEditorRef} />
        </div>

        <div className="min-h-0 lg:col-span-4">
          <InspectorPanel />
        </div>
      </section>

      <footer className="flex items-center justify-between rounded-xl border border-slate-700 bg-ink-900 px-4 py-2 text-xs text-slate-400">
        <span>
          Page {project.pages.findIndex((page) => page.id === project.activePageId) + 1} / {project.pages.length} ·
          Canvas {activePage.canvas.width} x {activePage.canvas.height}
        </span>
        <span>
          Panels: {activePage.panels.length} | Bubbles: {activePage.bubbles.length}
        </span>
      </footer>
    </main>
  );
}
