import { v4 as uuidv4 } from "uuid";
import { Bubble, BubbleType, CanvasConfig, CanvasPreset, Panel, Project, ProjectPage } from "../types";
import { normalizePanelRotation, normalizePanelShape, RECT_PANEL_SHAPE } from "./panelGeometry";

export const CANVAS_PRESETS: Record<CanvasPreset, { width: number; height: number; dpi: number }> = {
  A4: {
    width: 2480,
    height: 3508,
    dpi: 300
  },
  A3: {
    width: 3508,
    height: 4961,
    dpi: 300
  },
  custom: {
    width: 1600,
    height: 2400,
    dpi: 300
  }
};

export function createCanvasFromPreset(preset: CanvasPreset = "A4"): CanvasConfig {
  const picked = CANVAS_PRESETS[preset];
  return {
    width: picked.width,
    height: picked.height,
    preset,
    dpi: picked.dpi
  };
}

const DEFAULT_PANEL_STYLE: Pick<Panel, "borderColor" | "borderRadius" | "borderWidth" | "gap" | "rotation" | "shape"> = {
  borderWidth: 4,
  borderColor: "#111827",
  borderRadius: 0,
  gap: 0,
  rotation: 0,
  shape: RECT_PANEL_SHAPE
};

export function createPanel(input: Pick<Panel, "x" | "y" | "width" | "height"> & Partial<Panel>): Panel {
  const width = Math.max(24, input.width);
  const height = Math.max(24, input.height);
  return {
    id: input.id ?? uuidv4(),
    x: input.x,
    y: input.y,
    width,
    height,
    rotation: normalizePanelRotation(input.rotation ?? DEFAULT_PANEL_STYLE.rotation),
    shape: normalizePanelShape(input.shape ?? DEFAULT_PANEL_STYLE.shape, width),
    borderColor: input.borderColor ?? DEFAULT_PANEL_STYLE.borderColor,
    borderRadius: input.borderRadius ?? DEFAULT_PANEL_STYLE.borderRadius,
    borderWidth: input.borderWidth ?? DEFAULT_PANEL_STYLE.borderWidth,
    gap: input.gap ?? DEFAULT_PANEL_STYLE.gap,
    image: input.image,
    parentId: input.parentId
  };
}

export function createBubble(type: BubbleType = "rect", input: Partial<Bubble> = {}): Bubble {
  const safeType = input.type ?? type;
  const defaultWidth = safeType === "circle" ? 180 : 220;
  const defaultHeight = safeType === "circle" ? 180 : 160;
  const safeX = typeof input.x === "number" && Number.isFinite(input.x) ? input.x : 120;
  const safeY = typeof input.y === "number" && Number.isFinite(input.y) ? input.y : 120;
  const safeWidth = typeof input.width === "number" && Number.isFinite(input.width) ? input.width : defaultWidth;
  const safeHeight = typeof input.height === "number" && Number.isFinite(input.height) ? input.height : defaultHeight;
  const safeFontSize = typeof input.fontSize === "number" && Number.isFinite(input.fontSize) ? input.fontSize : 28;
  const safeBorderWidth =
    typeof input.borderWidth === "number" && Number.isFinite(input.borderWidth) ? input.borderWidth : 3;

  return {
    id: input.id ?? uuidv4(),
    type: safeType,
    x: safeX,
    y: safeY,
    width: Math.max(30, safeWidth),
    height: Math.max(30, safeHeight),
    text: input.text ?? "输入文字",
    direction: input.direction === "vertical" ? "vertical" : "horizontal",
    fontSize: Math.max(8, safeFontSize),
    fontFamily: input.fontFamily ?? "Noto Sans SC",
    background: input.background ?? "#ffffff",
    borderColor: input.borderColor ?? "#111827",
    borderWidth: Math.max(0, safeBorderWidth)
  };
}

type CreatePageInput = {
  id?: string;
  name?: string;
  canvas?: CanvasConfig;
  panels?: Panel[];
  bubbles?: Bubble[];
  withDefaultPanel?: boolean;
};

export function createProjectPage(input: CreatePageInput = {}): ProjectPage {
  const canvas = input.canvas ?? createCanvasFromPreset("A4");
  const panels =
    input.panels ??
    (input.withDefaultPanel === false
      ? []
      : [
          createPanel({
            x: 40,
            y: 40,
            width: canvas.width - 80,
            height: canvas.height - 80
          })
        ]);

  return {
    id: input.id ?? uuidv4(),
    name: input.name ?? "第 1 页",
    canvas,
    panels,
    bubbles: input.bubbles ?? []
  };
}

export function createEmptyProject(name = "未命名项目"): Project {
  const firstPage = createProjectPage();
  return {
    id: uuidv4(),
    name,
    pages: [firstPage],
    activePageId: firstPage.id
  };
}

export function splitGridPanels(
  canvasWidth: number,
  canvasHeight: number,
  rows: number,
  cols: number,
  margin = 32,
  gap = 20
): Panel[] {
  const safeRows = Math.max(1, rows);
  const safeCols = Math.max(1, cols);
  const totalGapX = gap * (safeCols - 1);
  const totalGapY = gap * (safeRows - 1);
  const availableWidth = canvasWidth - margin * 2 - totalGapX;
  const availableHeight = canvasHeight - margin * 2 - totalGapY;
  const cellWidth = Math.max(36, Math.floor(availableWidth / safeCols));
  const cellHeight = Math.max(36, Math.floor(availableHeight / safeRows));

  const output: Panel[] = [];
  for (let r = 0; r < safeRows; r += 1) {
    for (let c = 0; c < safeCols; c += 1) {
      output.push(
        createPanel({
          x: margin + c * (cellWidth + gap),
          y: margin + r * (cellHeight + gap),
          width: cellWidth,
          height: cellHeight,
          gap: 0
        })
      );
    }
  }

  return output;
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
