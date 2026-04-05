import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { applyPatch, compare, type Operation } from "fast-json-patch";
import { generateImage, loadProject as loadProjectApi, saveProject as saveProjectApi, uploadLocalImage } from "./api";
import {
  clamp,
  createBubble as createBubbleFactory,
  createCanvasFromPreset,
  createEmptyProject,
  createPanel,
  createProjectPage,
  splitGridPanels
} from "./project";
import { Bubble, BubbleType, CanvasPreset, CropConfig, Panel, Project, ProjectPage, Selection } from "../types";

type HistoryEntry = {
  forward: Operation[];
  backward: Operation[];
};

type EditorStore = {
  project: Project;
  selection?: Selection;
  manualPanelMode: boolean;
  snapSizeTo16: boolean;
  historyPast: HistoryEntry[];
  historyFuture: HistoryEntry[];
  busy: {
    generatingPanelId?: string;
    uploadingPanelId?: string;
    loadingProject: boolean;
    savingProject: boolean;
  };
  notice?: string;

  setNotice: (notice?: string) => void;

  undo: () => void;
  redo: () => void;

  setProjectName: (name: string) => void;
  setCanvasPreset: (preset: CanvasPreset) => void;
  setCanvasSize: (width: number, height: number) => void;
  setAllPanelsStyle: (style: { borderRadius?: number; borderWidth?: number }) => void;

  setActivePage: (id: string) => void;
  addPage: () => void;
  deletePage: (id: string) => void;
  movePage: (id: string, direction: "up" | "down") => void;

  splitGrid: (rows: number, cols: number) => void;
  splitSelectedPanel: (rows: number, cols: number) => void;
  createPanelFromRect: (x: number, y: number, width: number, height: number) => void;

  selectPanel: (id: string) => void;
  selectBubble: (id: string) => void;
  clearSelection: () => void;
  deleteSelection: () => void;

  updatePanel: (id: string, patch: Partial<Panel>) => void;
  updateBubble: (id: string, patch: Partial<Bubble>) => void;

  addBubble: (type: BubbleType) => void;

  toggleManualPanelMode: (enabled?: boolean) => void;
  toggleSnapSizeTo16: (enabled?: boolean) => void;

  setPanelCrop: (id: string, crop: CropConfig) => void;
  resetPanelCrop: (id: string) => void;
  uploadLocalImageForPanel: (id: string, file: File) => Promise<void>;

  generateImageForPanel: (id: string) => Promise<void>;

  saveProject: () => Promise<void>;
  loadProject: () => Promise<void>;
};

type LegacyProject = {
  id?: string;
  name?: string;
  canvas?: ProjectPage["canvas"];
  panels?: Panel[];
  bubbles?: Bubble[];
  pages?: ProjectPage[];
  activePageId?: string;
};

const HISTORY_LIMIT = 80;

function cloneProject(project: Project): Project {
  return structuredClone(project);
}

function createHistoryEntry(previous: Project, next: Project): HistoryEntry | null {
  const forward = compare(previous, next);
  if (forward.length === 0) {
    return null;
  }
  const backward = compare(next, previous);
  return {
    forward,
    backward
  };
}

function applyHistory(project: Project, operations: Operation[]): Project {
  return applyPatch(cloneProject(project), operations, false, true).newDocument as Project;
}

function withHistory(state: Pick<EditorStore, "project" | "historyPast">, nextProject: Project) {
  const entry = createHistoryEntry(state.project, nextProject);
  if (!entry) {
    return null;
  }

  const nextPast = [...state.historyPast, entry];
  if (nextPast.length > HISTORY_LIMIT) {
    nextPast.shift();
  }

  return {
    project: nextProject,
    historyPast: nextPast,
    historyFuture: [] as HistoryEntry[]
  };
}

function sanitizePanel(panel: Panel): Panel {
  return {
    ...panel,
    width: Math.max(24, panel.width),
    height: Math.max(24, panel.height),
    borderRadius: Math.max(0, panel.borderRadius),
    borderWidth: Math.max(0, panel.borderWidth),
    gap: Math.max(0, panel.gap)
  };
}

function sanitizeCanvas(canvas: Partial<ProjectPage["canvas"]> | undefined): ProjectPage["canvas"] {
  const fallback = createCanvasFromPreset("A4");
  const width = Number(canvas?.width ?? fallback.width);
  const height = Number(canvas?.height ?? fallback.height);
  const dpi = Number(canvas?.dpi ?? fallback.dpi);
  const preset = canvas?.preset;

  return {
    width: Math.max(240, Math.round(Number.isFinite(width) ? width : fallback.width)),
    height: Math.max(240, Math.round(Number.isFinite(height) ? height : fallback.height)),
    dpi: Math.max(72, Math.round(Number.isFinite(dpi) ? dpi : fallback.dpi ?? 300)),
    preset: preset === "A3" || preset === "A4" || preset === "custom" ? preset : "custom"
  };
}

function sanitizePage(page: Partial<ProjectPage> | undefined, index: number): ProjectPage {
  const fallbackName = `第 ${index + 1} 页`;
  const safePanels = Array.isArray(page?.panels) ? page.panels.map((entry) => sanitizePanel(entry)) : [];
  const safeBubbles = Array.isArray(page?.bubbles) ? page.bubbles : [];

  return {
    id: page?.id || uuidv4(),
    name: (typeof page?.name === "string" && page.name.trim()) || fallbackName,
    canvas: sanitizeCanvas(page?.canvas),
    panels: safePanels,
    bubbles: safeBubbles
  };
}

function normalizeLoadedProject(loaded: LegacyProject): Project {
  if (Array.isArray(loaded.pages) && loaded.pages.length > 0) {
    const pages = loaded.pages.map((page, index) => sanitizePage(page, index));
    const activePageId =
      loaded.activePageId && pages.some((page) => page.id === loaded.activePageId) ? loaded.activePageId : pages[0].id;
    return {
      id: loaded.id || uuidv4(),
      name: (typeof loaded.name === "string" && loaded.name.trim()) || "未命名项目",
      pages,
      activePageId
    };
  }

  const fallbackPage = sanitizePage(
    {
      id: uuidv4(),
      name: "第 1 页",
      canvas: loaded.canvas,
      panels: loaded.panels,
      bubbles: loaded.bubbles
    },
    0
  );

  if (fallbackPage.panels.length === 0) {
    const defaultPanel = createPanel({
      x: 40,
      y: 40,
      width: fallbackPage.canvas.width - 80,
      height: fallbackPage.canvas.height - 80,
      prompt: "漫画分镜，一个少年站在雨中，赛博朋克风格，高细节"
    });
    fallbackPage.panels = [defaultPanel];
  }

  return {
    id: loaded.id || uuidv4(),
    name: (typeof loaded.name === "string" && loaded.name.trim()) || "未命名项目",
    pages: [fallbackPage],
    activePageId: fallbackPage.id
  };
}

function getActivePageIndex(project: Project): number {
  if (project.pages.length === 0) {
    return -1;
  }
  const found = project.pages.findIndex((page) => page.id === project.activePageId);
  return found >= 0 ? found : 0;
}

export function getActivePage(project: Project): ProjectPage {
  const index = getActivePageIndex(project);
  if (index >= 0) {
    return project.pages[index];
  }
  return createProjectPage({ name: "第 1 页" });
}

function updatePageAt(project: Project, index: number, updater: (page: ProjectPage) => ProjectPage): Project {
  if (index < 0 || index >= project.pages.length) {
    return project;
  }

  const nextPages = project.pages.map((page, pageIndex) => {
    if (pageIndex !== index) {
      return page;
    }
    return updater(page);
  });

  return {
    ...project,
    pages: nextPages,
    activePageId: nextPages[index].id
  };
}

function updateActivePage(project: Project, updater: (page: ProjectPage) => ProjectPage): Project {
  return updatePageAt(project, getActivePageIndex(project), updater);
}

function updateProjectPanelById(project: Project, id: string, updater: (panel: Panel) => Panel): Project | null {
  let touched = false;

  const nextPages = project.pages.map((page) => {
    let pageTouched = false;
    const nextPanels = page.panels.map((panel) => {
      if (panel.id !== id) {
        return panel;
      }
      touched = true;
      pageTouched = true;
      return updater(panel);
    });

    if (!pageTouched) {
      return page;
    }

    return {
      ...page,
      panels: nextPanels
    };
  });

  if (!touched) {
    return null;
  }

  return {
    ...project,
    pages: nextPages
  };
}

function findPanel(project: Project, id: string): Panel | undefined {
  for (const page of project.pages) {
    const panel = page.panels.find((entry) => entry.id === id);
    if (panel) {
      return panel;
    }
  }
  return undefined;
}

function getPanelFrameRatio(panel: Pick<Panel, "width" | "height" | "gap">): number {
  const innerWidth = Math.max(1, panel.width - panel.gap * 2);
  const innerHeight = Math.max(1, panel.height - panel.gap * 2);
  return innerWidth / innerHeight;
}

function normalizeCropToRatio(
  crop: CropConfig,
  naturalWidth: number,
  naturalHeight: number,
  ratio: number
): CropConfig {
  const safeRatio = Math.max(0.001, ratio);
  let width = clamp(crop.width, 1, naturalWidth);
  let height = clamp(crop.height, 1, naturalHeight);
  const centerX = crop.x + width / 2;
  const centerY = crop.y + height / 2;

  if (width / Math.max(height, 0.001) >= safeRatio) {
    height = width / safeRatio;
  } else {
    width = height * safeRatio;
  }

  const fitScale = Math.min(1, naturalWidth / Math.max(width, 1), naturalHeight / Math.max(height, 1));
  width = Math.max(1, width * fitScale);
  height = Math.max(1, height * fitScale);

  return {
    x: clamp(centerX - width / 2, 0, Math.max(0, naturalWidth - width)),
    y: clamp(centerY - height / 2, 0, Math.max(0, naturalHeight - height)),
    width,
    height,
    scale: clamp(crop.scale, 0.1, 4)
  };
}

function replacePanel(panels: Panel[], id: string, patch: Partial<Panel>): Panel[] {
  return panels.map((panel) => {
    if (panel.id !== id) {
      return panel;
    }

    const nextPanel = sanitizePanel({
      ...panel,
      ...patch,
      image: patch.image === undefined ? panel.image : patch.image
    });

    if (!nextPanel.image?.crop) {
      return nextPanel;
    }

    const previousRatio = getPanelFrameRatio(panel);
    const nextRatio = getPanelFrameRatio(nextPanel);
    if (Math.abs(previousRatio - nextRatio) < 0.000001) {
      return nextPanel;
    }

    const naturalWidth = Math.max(1, nextPanel.image.naturalWidth ?? nextPanel.width);
    const naturalHeight = Math.max(1, nextPanel.image.naturalHeight ?? nextPanel.height);
    return {
      ...nextPanel,
      image: {
        ...nextPanel.image,
        crop: normalizeCropToRatio(nextPanel.image.crop, naturalWidth, naturalHeight, nextRatio)
      }
    };
  });
}

function createNewPageName(project: Project): string {
  return `第 ${project.pages.length + 1} 页`;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  project: createEmptyProject(),
  selection: undefined,
  manualPanelMode: false,
  snapSizeTo16: false,
  historyPast: [],
  historyFuture: [],
  busy: {
    generatingPanelId: undefined,
    uploadingPanelId: undefined,
    loadingProject: false,
    savingProject: false
  },
  notice: undefined,

  setNotice: (notice) => set({ notice }),

  undo: () => {
    set((state) => {
      if (state.historyPast.length === 0) {
        return {
          notice: "没有可撤销操作"
        };
      }

      const entry = state.historyPast[state.historyPast.length - 1];
      const nextPast = state.historyPast.slice(0, -1);
      const nextFuture = [entry, ...state.historyFuture].slice(0, HISTORY_LIMIT);

      return {
        project: applyHistory(state.project, entry.backward),
        historyPast: nextPast,
        historyFuture: nextFuture,
        selection: undefined,
        notice: "已撤销"
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.historyFuture.length === 0) {
        return {
          notice: "没有可重做操作"
        };
      }

      const entry = state.historyFuture[0];
      const nextFuture = state.historyFuture.slice(1);
      const nextPast = [...state.historyPast, entry].slice(-HISTORY_LIMIT);

      return {
        project: applyHistory(state.project, entry.forward),
        historyPast: nextPast,
        historyFuture: nextFuture,
        selection: undefined,
        notice: "已重做"
      };
    });
  },

  setProjectName: (name) => {
    set((state) => {
      if (state.project.name === name) {
        return state;
      }

      const nextProject: Project = {
        ...state.project,
        name
      };

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  setCanvasPreset: (preset) => {
    const picked = createCanvasFromPreset(preset);
    set((state) => {
      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        canvas: {
          width: picked.width,
          height: picked.height,
          dpi: picked.dpi,
          preset
        }
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        notice: `画布已切换为 ${preset}`
      };
    });
  },

  setCanvasSize: (width, height) => {
    set((state) => {
      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        canvas: {
          ...page.canvas,
          width: Math.max(240, Math.round(width)),
          height: Math.max(240, Math.round(height)),
          preset: "custom"
        }
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  setAllPanelsStyle: (style) => {
    set((state) => {
      const activePage = getActivePage(state.project);
      if (activePage.panels.length === 0) {
        return {
          notice: "当前没有分镜"
        };
      }

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: page.panels.map((panel) =>
          sanitizePanel({
            ...panel,
            borderRadius: style.borderRadius === undefined ? panel.borderRadius : style.borderRadius,
            borderWidth: style.borderWidth === undefined ? panel.borderWidth : style.borderWidth
          })
        )
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return {
          notice: "所有分镜样式未变化"
        };
      }

      return {
        ...historyState,
        notice: "已应用到全部分镜"
      };
    });
  },

  setActivePage: (id) => {
    set((state) => {
      if (state.project.activePageId === id || !state.project.pages.some((page) => page.id === id)) {
        return state;
      }
      return {
        project: {
          ...state.project,
          activePageId: id
        },
        selection: undefined
      };
    });
  },

  addPage: () => {
    set((state) => {
      const activePage = getActivePage(state.project);
      const newPage = createProjectPage({
        name: createNewPageName(state.project),
        canvas: {
          ...activePage.canvas
        }
      });

      const nextProject: Project = {
        ...state.project,
        pages: [...state.project.pages, newPage],
        activePageId: newPage.id
      };

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: undefined,
        notice: "已新增页面"
      };
    });
  },

  deletePage: (id) => {
    set((state) => {
      if (state.project.pages.length <= 1) {
        return {
          notice: "至少保留 1 页"
        };
      }

      const index = state.project.pages.findIndex((page) => page.id === id);
      if (index < 0) {
        return state;
      }

      const nextPages = state.project.pages.filter((page) => page.id !== id);
      const nextActive =
        state.project.activePageId === id
          ? nextPages[Math.min(index, nextPages.length - 1)].id
          : state.project.activePageId;

      const nextProject: Project = {
        ...state.project,
        pages: nextPages,
        activePageId: nextActive
      };

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: undefined,
        notice: "已删除页面"
      };
    });
  },

  movePage: (id, direction) => {
    set((state) => {
      const index = state.project.pages.findIndex((page) => page.id === id);
      if (index < 0) {
        return state;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= state.project.pages.length) {
        return state;
      }

      const nextPages = [...state.project.pages];
      const temp = nextPages[index];
      nextPages[index] = nextPages[targetIndex];
      nextPages[targetIndex] = temp;

      const nextProject: Project = {
        ...state.project,
        pages: nextPages
      };

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        notice: direction === "up" ? "页面已上移" : "页面已下移"
      };
    });
  },

  splitGrid: (rows, cols) => {
    const safeRows = Math.max(1, Math.floor(rows));
    const safeCols = Math.max(1, Math.floor(cols));

    set((state) => {
      const activePage = getActivePage(state.project);
      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: splitGridPanels(activePage.canvas.width, activePage.canvas.height, safeRows, safeCols)
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: undefined,
        notice: `已按 ${safeRows} x ${safeCols} 网格切割`
      };
    });
  },

  splitSelectedPanel: (rows, cols) => {
    const selected = get().selection;
    if (!selected || selected.kind !== "panel") {
      set({ notice: "请先选择一个分镜" });
      return;
    }

    const safeRows = Math.max(1, Math.floor(rows));
    const safeCols = Math.max(1, Math.floor(cols));

    set((state) => {
      const activePage = getActivePage(state.project);
      const target = activePage.panels.find((panel) => panel.id === selected.id);
      if (!target) {
        return state;
      }

      const innerGap = Math.max(4, target.gap);
      const availableWidth = target.width - innerGap * (safeCols - 1);
      const availableHeight = target.height - innerGap * (safeRows - 1);
      const cellWidth = Math.max(24, Math.floor(availableWidth / safeCols));
      const cellHeight = Math.max(24, Math.floor(availableHeight / safeRows));

      const children: Panel[] = [];
      for (let row = 0; row < safeRows; row += 1) {
        for (let col = 0; col < safeCols; col += 1) {
          children.push(
            createPanel({
              x: target.x + col * (cellWidth + innerGap),
              y: target.y + row * (cellHeight + innerGap),
              width: cellWidth,
              height: cellHeight,
              borderColor: target.borderColor,
              borderRadius: target.borderRadius,
              borderWidth: target.borderWidth,
              gap: target.gap,
              parentId: target.id,
              prompt: target.prompt,
              negativePrompt: target.negativePrompt
            })
          );
        }
      }

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: [...page.panels.filter((panel) => panel.id !== target.id), ...children]
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: {
          kind: "panel",
          id: children[0]?.id ?? target.id
        },
        notice: `已将分镜切割为 ${safeRows} x ${safeCols}`
      };
    });
  },

  createPanelFromRect: (x, y, width, height) => {
    const normalizedX = width >= 0 ? x : x + width;
    const normalizedY = height >= 0 ? y : y + height;
    const absWidth = Math.abs(width);
    const absHeight = Math.abs(height);

    if (absWidth < 24 || absHeight < 24) {
      return;
    }

    const panel = createPanel({
      x: Math.max(0, normalizedX),
      y: Math.max(0, normalizedY),
      width: absWidth,
      height: absHeight
    });

    set((state) => {
      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: [...page.panels, panel]
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: {
          kind: "panel",
          id: panel.id
        }
      };
    });
  },

  selectPanel: (id) => {
    set({
      selection: {
        kind: "panel",
        id
      }
    });
  },

  selectBubble: (id) => {
    set({
      selection: {
        kind: "bubble",
        id
      }
    });
  },

  clearSelection: () => {
    set({ selection: undefined });
  },

  deleteSelection: () => {
    set((state) => {
      if (!state.selection) {
        return state;
      }

      const activePage = getActivePage(state.project);
      if (state.selection.kind === "panel") {
        if (!activePage.panels.some((panel) => panel.id === state.selection?.id)) {
          return {
            selection: undefined
          };
        }

        const nextProject = updateActivePage(state.project, (page) => ({
          ...page,
          panels: page.panels.filter((panel) => panel.id !== state.selection?.id)
        }));

        const historyState = withHistory(state, nextProject);
        if (!historyState) {
          return state;
        }

        return {
          ...historyState,
          selection: undefined,
          notice: "已删除分镜"
        };
      }

      if (!activePage.bubbles.some((bubble) => bubble.id === state.selection?.id)) {
        return {
          selection: undefined
        };
      }

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        bubbles: page.bubbles.filter((bubble) => bubble.id !== state.selection?.id)
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: undefined,
        notice: "已删除气泡"
      };
    });
  },

  updatePanel: (id, patch) => {
    set((state) => {
      const activePage = getActivePage(state.project);
      if (!activePage.panels.some((panel) => panel.id === id)) {
        return state;
      }

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: replacePanel(page.panels, id, patch)
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  updateBubble: (id, patch) => {
    set((state) => {
      const activePage = getActivePage(state.project);
      if (!activePage.bubbles.some((bubble) => bubble.id === id)) {
        return state;
      }

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        bubbles: page.bubbles.map((bubble) => {
          if (bubble.id !== id) {
            return bubble;
          }

          return {
            ...bubble,
            ...patch,
            x: patch.x === undefined ? bubble.x : patch.x,
            y: patch.y === undefined ? bubble.y : patch.y,
            width: patch.width === undefined ? bubble.width : Math.max(30, patch.width),
            height: patch.height === undefined ? bubble.height : Math.max(30, patch.height),
            fontSize: patch.fontSize === undefined ? bubble.fontSize : Math.max(8, patch.fontSize)
          };
        })
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  addBubble: (type) => {
    const bubble = createBubbleFactory(type);
    set((state) => {
      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        bubbles: [...page.bubbles, bubble]
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: {
          kind: "bubble",
          id: bubble.id
        },
        notice: "已创建气泡"
      };
    });
  },

  toggleManualPanelMode: (enabled) => {
    set((state) => ({
      manualPanelMode: enabled ?? !state.manualPanelMode,
      notice: (enabled ?? !state.manualPanelMode) ? "手绘分镜模式已开启" : "手绘分镜模式已关闭"
    }));
  },

  toggleSnapSizeTo16: (enabled) => {
    set((state) => ({
      snapSizeTo16: enabled ?? !state.snapSizeTo16,
      notice: (enabled ?? !state.snapSizeTo16) ? "已开启 16 倍数尺寸吸附" : "已关闭 16 倍数尺寸吸附"
    }));
  },

  setPanelCrop: (id, crop) => {
    set((state) => {
      const activePage = getActivePage(state.project);
      const panel = activePage.panels.find((entry) => entry.id === id);
      if (!panel?.image?.original) {
        return state;
      }

      const naturalWidth = Math.max(1, panel.image.naturalWidth ?? panel.width);
      const naturalHeight = Math.max(1, panel.image.naturalHeight ?? panel.height);
      const width = clamp(crop.width, 1, naturalWidth);
      const height = clamp(crop.height, 1, naturalHeight);

      const nextCrop: CropConfig = {
        x: clamp(crop.x, 0, Math.max(0, naturalWidth - width)),
        y: clamp(crop.y, 0, Math.max(0, naturalHeight - height)),
        width,
        height,
        scale: clamp(crop.scale, 0.1, 4)
      };

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: page.panels.map((entry) => {
          if (entry.id !== id || !entry.image) {
            return entry;
          }
          return {
            ...entry,
            image: {
              ...entry.image,
              crop: nextCrop
            }
          };
        })
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  resetPanelCrop: (id) => {
    set((state) => {
      const activePage = getActivePage(state.project);
      const target = activePage.panels.find((panel) => panel.id === id);
      if (!target?.image?.crop) {
        return state;
      }

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: page.panels.map((panel) => {
          if (panel.id !== id || !panel.image) {
            return panel;
          }
          return {
            ...panel,
            image: {
              ...panel.image,
              crop: undefined
            }
          };
        })
      }));

      const historyState = withHistory(state, nextProject);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  uploadLocalImageForPanel: async (id, file) => {
    const panel = findPanel(get().project, id);
    if (!panel) {
      set({ notice: "找不到分镜" });
      return;
    }

    set((state) => ({
      busy: {
        ...state.busy,
        uploadingPanelId: id
      },
      notice: "正在导入本地图像..."
    }));

    try {
      const result = await uploadLocalImage(file);
      set((state) => {
        const nextProject = updateProjectPanelById(state.project, id, (entry) => ({
          ...entry,
          image: {
            original: result.url,
            naturalWidth: result.naturalWidth,
            naturalHeight: result.naturalHeight,
            crop: undefined
          }
        }));

        if (!nextProject) {
          return {
            notice: "分镜已不存在"
          };
        }

        const historyState = withHistory(state, nextProject);
        if (!historyState) {
          return state;
        }

        return {
          ...historyState,
          notice: "本地图像导入完成"
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      set({ notice: message });
    } finally {
      set((state) => ({
        busy: {
          ...state.busy,
          uploadingPanelId: undefined
        }
      }));
    }
  },

  generateImageForPanel: async (id) => {
    const panel = findPanel(get().project, id);
    if (!panel) {
      set({ notice: "找不到分镜" });
      return;
    }

    const prompt = panel.prompt?.trim();
    if (!prompt) {
      set({ notice: "请先输入 Prompt" });
      return;
    }

    set((state) => ({
      busy: {
        ...state.busy,
        generatingPanelId: id
      },
      notice: "正在生成图像..."
    }));

    try {
      const result = await generateImage({
        prompt,
        negativePrompt: panel.negativePrompt,
        width: Math.max(64, Math.round(panel.width)),
        height: Math.max(64, Math.round(panel.height))
      });

      set((state) => {
        const nextProject = updateProjectPanelById(state.project, id, (entry) => ({
          ...entry,
          image: {
            original: result.url,
            naturalWidth: result.naturalWidth,
            naturalHeight: result.naturalHeight
          }
        }));

        if (!nextProject) {
          return {
            notice: "分镜已不存在"
          };
        }

        const historyState = withHistory(state, nextProject);
        if (!historyState) {
          return state;
        }

        return {
          ...historyState,
          notice: "图像生成完成"
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "图像生成失败";
      set({ notice: message });
    } finally {
      set((state) => ({
        busy: {
          ...state.busy,
          generatingPanelId: undefined
        }
      }));
    }
  },

  saveProject: async () => {
    set((state) => ({
      busy: {
        ...state.busy,
        savingProject: true
      },
      notice: "正在保存项目..."
    }));

    try {
      await saveProjectApi(get().project);
      set({ notice: "项目已保存到 ./project/project.json" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      set({ notice: message });
    } finally {
      set((state) => ({
        busy: {
          ...state.busy,
          savingProject: false
        }
      }));
    }
  },

  loadProject: async () => {
    set((state) => ({
      busy: {
        ...state.busy,
        loadingProject: true
      },
      notice: "正在加载项目..."
    }));

    try {
      const loaded = await loadProjectApi();
      if (!loaded) {
        set({ notice: "未找到已保存项目" });
        return;
      }

      const normalized = normalizeLoadedProject(loaded as LegacyProject);

      set({
        project: {
          ...normalized,
          id: normalized.id || uuidv4()
        },
        historyPast: [],
        historyFuture: [],
        selection: undefined,
        notice: "项目加载完成"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载失败";
      set({ notice: message });
    } finally {
      set((state) => ({
        busy: {
          ...state.busy,
          loadingProject: false
        }
      }));
    }
  }
}));
