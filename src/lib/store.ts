import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { applyPatch, compare, type Operation } from "fast-json-patch";
import { generateImage, loadProject as loadProjectApi, saveProject as saveProjectApi } from "./api";
import { clamp, createBubble as createBubbleFactory, createEmptyProject, createPanel, splitGridPanels } from "./project";
import { Bubble, BubbleType, CanvasPreset, CropConfig, Panel, Project, Selection } from "../types";

type HistoryEntry = {
  forward: Operation[];
  backward: Operation[];
};

type EditorStore = {
  project: Project;
  selection?: Selection;
  manualPanelMode: boolean;
  historyPast: HistoryEntry[];
  historyFuture: HistoryEntry[];
  busy: {
    generatingPanelId?: string;
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

  setPanelCrop: (id: string, crop: CropConfig) => void;
  resetPanelCrop: (id: string) => void;

  generateImageForPanel: (id: string) => Promise<void>;

  saveProject: () => Promise<void>;
  loadProject: () => Promise<void>;
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

function replacePanel(panels: Panel[], id: string, patch: Partial<Panel>): Panel[] {
  return panels.map((panel) => {
    if (panel.id !== id) {
      return panel;
    }
    return sanitizePanel({
      ...panel,
      ...patch,
      image: patch.image === undefined ? panel.image : patch.image
    });
  });
}

function findPanel(project: Project, id: string): Panel | undefined {
  return project.panels.find((panel) => panel.id === id);
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  project: createEmptyProject(),
  selection: undefined,
  manualPanelMode: false,
  historyPast: [],
  historyFuture: [],
  busy: {
    generatingPanelId: undefined,
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
    const presets = {
      A4: { width: 2480, height: 3508, dpi: 300 },
      A3: { width: 3508, height: 4961, dpi: 300 },
      custom: { width: 1600, height: 2400, dpi: 300 }
    };

    const picked = presets[preset];
    set((state) => {
      const nextProject: Project = {
        ...state.project,
        canvas: {
          width: picked.width,
          height: picked.height,
          dpi: picked.dpi,
          preset
        }
      };

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
      const nextProject: Project = {
        ...state.project,
        canvas: {
          ...state.project.canvas,
          width: Math.max(240, Math.round(width)),
          height: Math.max(240, Math.round(height)),
          preset: "custom"
        }
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

  splitGrid: (rows, cols) => {
    const safeRows = Math.max(1, Math.floor(rows));
    const safeCols = Math.max(1, Math.floor(cols));

    set((state) => {
      const nextProject: Project = {
        ...state.project,
        panels: splitGridPanels(state.project.canvas.width, state.project.canvas.height, safeRows, safeCols)
      };

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
      const target = state.project.panels.find((panel) => panel.id === selected.id);
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

      const nextProject: Project = {
        ...state.project,
        panels: [...state.project.panels.filter((panel) => panel.id !== target.id), ...children]
      };

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
      const nextProject: Project = {
        ...state.project,
        panels: [...state.project.panels, panel]
      };

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

      if (state.selection.kind === "panel") {
        const nextPanels = state.project.panels.filter((panel) => panel.id !== state.selection?.id);
        const nextProject: Project = {
          ...state.project,
          panels: nextPanels
        };

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

      const nextBubbles = state.project.bubbles.filter((bubble) => bubble.id !== state.selection?.id);
      const nextProject: Project = {
        ...state.project,
        bubbles: nextBubbles
      };

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
      if (!state.project.panels.some((panel) => panel.id === id)) {
        return state;
      }

      const nextProject: Project = {
        ...state.project,
        panels: replacePanel(state.project.panels, id, patch)
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

  updateBubble: (id, patch) => {
    set((state) => {
      if (!state.project.bubbles.some((bubble) => bubble.id === id)) {
        return state;
      }

      const nextProject: Project = {
        ...state.project,
        bubbles: state.project.bubbles.map((bubble) => {
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

  addBubble: (type) => {
    const bubble = createBubbleFactory(type);
    set((state) => {
      const nextProject: Project = {
        ...state.project,
        bubbles: [...state.project.bubbles, bubble]
      };

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

  setPanelCrop: (id, crop) => {
    set((state) => {
      const panel = findPanel(state.project, id);
      if (!panel?.image?.original) {
        return state;
      }

      const naturalWidth = panel.image.naturalWidth ?? panel.width;
      const naturalHeight = panel.image.naturalHeight ?? panel.height;

      const nextCrop: CropConfig = {
        x: clamp(crop.x, 0, naturalWidth),
        y: clamp(crop.y, 0, naturalHeight),
        width: clamp(crop.width, 1, naturalWidth),
        height: clamp(crop.height, 1, naturalHeight),
        scale: clamp(crop.scale, 0.1, 4)
      };

      const nextProject: Project = {
        ...state.project,
        panels: state.project.panels.map((entry) => {
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

  resetPanelCrop: (id) => {
    set((state) => {
      const target = state.project.panels.find((panel) => panel.id === id);
      if (!target?.image?.crop) {
        return state;
      }

      const nextProject: Project = {
        ...state.project,
        panels: state.project.panels.map((panel) => {
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
        const nextProject: Project = {
          ...state.project,
          panels: state.project.panels.map((entry) => {
            if (entry.id !== id) {
              return entry;
            }
            return {
              ...entry,
              image: {
                original: result.url,
                naturalWidth: result.naturalWidth,
                naturalHeight: result.naturalHeight
              }
            };
          })
        };

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

      set({
        project: {
          ...loaded,
          id: loaded.id || uuidv4()
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
