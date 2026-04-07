import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bubble, CropConfig, Panel, PanelShape } from "../types";
import {
  getPanelImageClipBounds,
  getPanelImageClipPoints,
  normalizePanelRotation,
  normalizePanelShape,
  PANEL_SHAPE_MAX_RATIO,
  PANEL_SHAPE_MIN_RATIO,
  RECT_PANEL_SHAPE
} from "../lib/panelGeometry";
import { getActivePage, useEditorStore } from "../lib/store";

const containerClass =
  "studio-surface h-full overflow-auto p-4 text-[var(--text-primary)]";
const sectionClass = "studio-subtle space-y-3 rounded-2xl p-3.5";
const fieldClass = "flex items-center justify-between gap-3";
const labelClass = "text-[11px] uppercase tracking-[0.15em] text-[var(--text-secondary)]";
const inputClass = "studio-input h-9 w-full px-3 text-sm";
const selectClass = "studio-select h-9 w-full px-3 text-sm";
const textareaClass = "studio-textarea w-full px-3 py-2 text-sm";
const buttonClass = "studio-btn px-3 py-1.5 text-sm";
const primaryButtonClass = `${buttonClass} studio-btn-primary`;
const dangerButtonClass = `${buttonClass} studio-btn-danger`;
const colorInputClass = "h-9 w-20 cursor-pointer rounded-lg border border-[var(--line-soft)] bg-transparent";

type CropDraft = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

type ResizeEdge = "left" | "right" | "top" | "bottom";

type CropDragState =
  | {
      kind: "move";
      pointerId: number;
      startPoint: Point;
      startCrop: CropDraft;
    }
  | {
      kind: "resize";
      pointerId: number;
      edge: ResizeEdge;
      startCrop: CropDraft;
    };

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function createCenteredCropWithRatio(naturalWidth: number, naturalHeight: number, ratio: number): CropDraft {
  const safeRatio = Math.max(0.001, ratio);
  if (naturalWidth / naturalHeight >= safeRatio) {
    const height = naturalHeight;
    const width = height * safeRatio;
    return {
      x: (naturalWidth - width) / 2,
      y: 0,
      width,
      height
    };
  }

  const width = naturalWidth;
  const height = width / safeRatio;
  return {
    x: 0,
    y: (naturalHeight - height) / 2,
    width,
    height
  };
}

function getCropCenter(crop: CropDraft): Point {
  return {
    x: crop.x + crop.width / 2,
    y: crop.y + crop.height / 2
  };
}

function createCropFromCenter(centerX: number, centerY: number, width: number, height: number): CropDraft {
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  };
}

function shrinkCropAroundCenter(crop: CropDraft, zoom: number): CropDraft {
  const safeZoom = clamp(zoom, 0.1, 4);
  const width = crop.width / safeZoom;
  const height = crop.height / safeZoom;
  const center = getCropCenter(crop);
  return createCropFromCenter(center.x, center.y, width, height);
}

function expandCropAroundCenter(crop: CropDraft, zoom: number): CropDraft {
  const safeZoom = clamp(zoom, 0.1, 4);
  const width = crop.width * safeZoom;
  const height = crop.height * safeZoom;
  const center = getCropCenter(crop);
  return createCropFromCenter(center.x, center.y, width, height);
}

function createCenteredVisibleCropWithRatio(
  naturalWidth: number,
  naturalHeight: number,
  ratio: number,
  zoom: number
): CropDraft {
  return shrinkCropAroundCenter(createCenteredCropWithRatio(naturalWidth, naturalHeight, ratio), zoom);
}

function getVisibleCropFromStoredCrop(
  crop: CropDraft,
  frameWidth: number,
  frameHeight: number,
  zoom: number
): CropDraft {
  const safeFrameWidth = Math.max(1, frameWidth);
  const safeFrameHeight = Math.max(1, frameHeight);
  const safeCropWidth = Math.max(1, crop.width);
  const safeCropHeight = Math.max(1, crop.height);
  const safeZoom = clamp(zoom, 1, 4);
  const coverScale = Math.max(safeFrameWidth / safeCropWidth, safeFrameHeight / safeCropHeight);
  const drawScale = coverScale * safeZoom;
  const width = Math.min(safeCropWidth, safeFrameWidth / drawScale);
  const height = Math.min(safeCropHeight, safeFrameHeight / drawScale);
  const center = getCropCenter(crop);
  return createCropFromCenter(center.x, center.y, width, height);
}

function normalizeVisibleCropToRatio(
  crop: CropDraft,
  naturalWidth: number,
  naturalHeight: number,
  ratio: number,
  zoom: number
): CropDraft {
  const safeRatio = Math.max(0.001, ratio);
  const safeZoom = clamp(zoom, 1, 4);
  const center = getCropCenter(crop);
  let width = Math.max(1, crop.width);
  let height = Math.max(1, crop.height);

  if (width / height >= safeRatio) {
    height = width / safeRatio;
  } else {
    width = height * safeRatio;
  }

  const maxVisible = createCenteredVisibleCropWithRatio(naturalWidth, naturalHeight, safeRatio, safeZoom);
  const fitScale = Math.min(1, maxVisible.width / width, maxVisible.height / height);
  width = Math.max(1, width * fitScale);
  height = Math.max(1, height * fitScale);

  const clampedCenterX = clamp(center.x, (width * safeZoom) / 2, naturalWidth - (width * safeZoom) / 2);
  const clampedCenterY = clamp(center.y, (height * safeZoom) / 2, naturalHeight - (height * safeZoom) / 2);
  return createCropFromCenter(clampedCenterX, clampedCenterY, width, height);
}

function moveVisibleCropWithinBounds(
  crop: CropDraft,
  deltaX: number,
  deltaY: number,
  naturalWidth: number,
  naturalHeight: number,
  ratio: number,
  zoom: number
): CropDraft {
  return normalizeVisibleCropToRatio(
    {
      x: crop.x + deltaX,
      y: crop.y + deltaY,
      width: crop.width,
      height: crop.height
    },
    naturalWidth,
    naturalHeight,
    ratio,
    zoom
  );
}

function resizeVisibleCropFromEdgeWithRatio(
  initial: CropDraft,
  edge: ResizeEdge,
  point: Point,
  naturalWidth: number,
  naturalHeight: number,
  ratio: number,
  zoom: number
): CropDraft {
  const safeRatio = Math.max(0.001, ratio);
  const safeZoom = clamp(zoom, 1, 4);
  const safeWidth = Math.max(1, naturalWidth);
  const safeHeight = Math.max(1, naturalHeight);
  const maxVisible = createCenteredVisibleCropWithRatio(safeWidth, safeHeight, safeRatio, safeZoom);

  if (edge === "left" || edge === "right") {
    const anchorX = edge === "left" ? initial.x + initial.width : initial.x;
    const centerY = initial.y + initial.height / 2;
    const maxHeightByVertical = (Math.min(centerY, safeHeight - centerY) * 2) / safeZoom;
    const maxWidthByVertical = maxHeightByVertical * safeRatio;
    const maxWidthByNearHorizontal = (2 * (edge === "left" ? anchorX : safeWidth - anchorX)) / (safeZoom + 1);
    const maxWidthByFarHorizontal =
      safeZoom > 1
        ? (2 * (edge === "left" ? safeWidth - anchorX : anchorX)) / (safeZoom - 1)
        : Number.POSITIVE_INFINITY;
    const maxWidth = Math.max(1, Math.min(maxVisible.width, maxWidthByVertical, maxWidthByNearHorizontal, maxWidthByFarHorizontal));

    let width = edge === "left" ? anchorX - point.x : point.x - anchorX;
    width = clamp(width, 1, maxWidth);
    const height = width / safeRatio;
    return normalizeVisibleCropToRatio(
      {
        x: edge === "left" ? anchorX - width : anchorX,
        y: centerY - height / 2,
        width,
        height
      },
      safeWidth,
      safeHeight,
      safeRatio,
      safeZoom
    );
  }

  const anchorY = edge === "top" ? initial.y + initial.height : initial.y;
  const centerX = initial.x + initial.width / 2;
  const maxWidthByHorizontal = (Math.min(centerX, safeWidth - centerX) * 2) / safeZoom;
  const maxHeightByHorizontal = maxWidthByHorizontal / safeRatio;
  const maxHeightByNearVertical = (2 * (edge === "top" ? anchorY : safeHeight - anchorY)) / (safeZoom + 1);
  const maxHeightByFarVertical =
    safeZoom > 1
      ? (2 * (edge === "top" ? safeHeight - anchorY : anchorY)) / (safeZoom - 1)
      : Number.POSITIVE_INFINITY;
  const maxHeight = Math.max(1, Math.min(maxVisible.height, maxHeightByHorizontal, maxHeightByNearVertical, maxHeightByFarVertical));

  let height = edge === "top" ? anchorY - point.y : point.y - anchorY;
  height = clamp(height, 1, maxHeight);
  const width = height * safeRatio;
  return normalizeVisibleCropToRatio(
    {
      x: centerX - width / 2,
      y: edge === "top" ? anchorY - height : anchorY,
      width,
      height
    },
    safeWidth,
    safeHeight,
    safeRatio,
    safeZoom
  );
}

function toNaturalPoint(
  event: PointerEvent<Element>,
  overlayElement: HTMLDivElement | null,
  scale: number,
  naturalWidth: number,
  naturalHeight: number
): Point {
  if (!overlayElement) {
    return {
      x: 0,
      y: 0
    };
  }

  const rect = overlayElement.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / scale, 0, naturalWidth),
    y: clamp((event.clientY - rect.top) / scale, 0, naturalHeight)
  };
}

function isMainPointer(event: PointerEvent<Element>) {
  if (event.pointerType === "touch") {
    return true;
  }
  return event.button === 0;
}

function beginPointerCapture(overlay: HTMLDivElement | null, pointerId: number) {
  if (!overlay || overlay.hasPointerCapture(pointerId)) {
    return;
  }
  overlay.setPointerCapture(pointerId);
}

function endPointerCapture(overlay: HTMLDivElement | null, pointerId: number) {
  if (!overlay || !overlay.hasPointerCapture(pointerId)) {
    return;
  }
  overlay.releasePointerCapture(pointerId);
}

function getHandleCursor(edge: ResizeEdge) {
  if (edge === "left" || edge === "right") {
    return "ew-resize";
  }
  return "ns-resize";
}

function updateDraftForDragState(
  dragState: CropDragState,
  point: Point,
  naturalWidth: number,
  naturalHeight: number,
  frameRatio: number,
  zoom: number
): CropDraft {
  if (dragState.kind === "move") {
    const deltaX = point.x - dragState.startPoint.x;
    const deltaY = point.y - dragState.startPoint.y;
    return moveVisibleCropWithinBounds(dragState.startCrop, deltaX, deltaY, naturalWidth, naturalHeight, frameRatio, zoom);
  }

  return resizeVisibleCropFromEdgeWithRatio(dragState.startCrop, dragState.edge, point, naturalWidth, naturalHeight, frameRatio, zoom);
}

function createScaledStyle(draft: CropDraft, scale: number) {
  return {
    left: draft.x * scale,
    top: draft.y * scale,
    width: Math.max(1, draft.width * scale),
    height: Math.max(1, draft.height * scale)
  };
}

function getCropShapePreview(panel: Pick<Panel, "width" | "height" | "shape" | "gap">) {
  const clipPoints = getPanelImageClipPoints(panel);
  const clipBounds = getPanelImageClipBounds(panel);
  const normalizedPoints = clipPoints.map((point) => ({
    x: (point.x - clipBounds.minX) / Math.max(1, clipBounds.width),
    y: (point.y - clipBounds.minY) / Math.max(1, clipBounds.height)
  }));

  return {
    clipBounds,
    normalizedPoints,
    svgPoints: normalizedPoints.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")
  };
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className={fieldClass}>
      <span className={labelClass}>{label}</span>
      <input
        className={`${inputClass} max-w-36`}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ShapePercentField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberField
      label={label}
      value={Math.round(value * 100)}
      min={Math.round(PANEL_SHAPE_MIN_RATIO * 100)}
      max={Math.round(PANEL_SHAPE_MAX_RATIO * 100)}
      step={1}
      onChange={(nextValue) => onChange(nextValue / 100)}
    />
  );
}

type PanelShapePreset = {
  label: string;
  shape: PanelShape;
};

const PANEL_SHAPE_PRESETS: PanelShapePreset[] = [
  {
    label: "重置",
    shape: RECT_PANEL_SHAPE
  },
  {
    label: "平行 /",
    shape: {
      topLeft: 0.16,
      topRight: 1,
      bottomRight: 0.84,
      bottomLeft: 0
    }
  },
  {
    label: "平行 \\",
    shape: {
      topLeft: 0,
      topRight: 0.84,
      bottomRight: 1,
      bottomLeft: 0.16
    }
  },
  {
    label: "上窄",
    shape: {
      topLeft: 0.14,
      topRight: 0.86,
      bottomRight: 1,
      bottomLeft: 0
    }
  },
  {
    label: "下窄",
    shape: {
      topLeft: 0,
      topRight: 1,
      bottomRight: 0.86,
      bottomLeft: 0.14
    }
  }
];

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1">
      <span className={labelClass}>{label}</span>
      <input className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function VisualCropModal({ panel, open, onClose }: { panel: Panel; open: boolean; onClose: () => void }) {
  const setPanelCrop = useEditorStore((state) => state.setPanelCrop);
  const resetPanelCrop = useEditorStore((state) => state.resetPanelCrop);

  const naturalWidth = panel.image?.naturalWidth ?? panel.width;
  const naturalHeight = panel.image?.naturalHeight ?? panel.height;
  const cropZoom = clamp(panel.image?.crop?.scale ?? 1, 0.1, 4);
  const visibleCropZoom = Math.max(1, cropZoom);
  const cropShapePreview = useMemo(() => getCropShapePreview(panel), [panel.gap, panel.height, panel.shape, panel.width]);
  const frameRatio = cropShapePreview.clipBounds.width / cropShapePreview.clipBounds.height;
  const frameRatioText = `${Math.round(cropShapePreview.clipBounds.width)}:${Math.round(cropShapePreview.clipBounds.height)}`;
  const storedCrop = useMemo(
    () =>
      panel.image?.crop
        ? {
            x: panel.image.crop.x,
            y: panel.image.crop.y,
            width: panel.image.crop.width,
            height: panel.image.crop.height
          }
        : {
            x: 0,
            y: 0,
            width: naturalWidth,
            height: naturalHeight
          },
    [naturalHeight, naturalWidth, panel.image?.crop?.height, panel.image?.crop?.width, panel.image?.crop?.x, panel.image?.crop?.y]
  );
  const initialCrop: CropDraft = useMemo(
    () =>
      getVisibleCropFromStoredCrop(
        storedCrop,
        cropShapePreview.clipBounds.width,
        cropShapePreview.clipBounds.height,
        visibleCropZoom
      ),
    [cropShapePreview.clipBounds.height, cropShapePreview.clipBounds.width, storedCrop, visibleCropZoom]
  );

  const [draft, setDraft] = useState<CropDraft>(initialCrop);
  const [dragState, setDragState] = useState<CropDragState | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(initialCrop);
    setDragState(null);
  }, [initialCrop, open]);

  if (!open || !panel.image?.original) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  const scale = Math.min(1, 920 / naturalWidth, 560 / naturalHeight);
  const displayWidth = Math.max(1, Math.round(naturalWidth * scale));
  const displayHeight = Math.max(1, Math.round(naturalHeight * scale));
  const draftStyle = createScaledStyle(draft, scale);
  const storedPreview = Math.abs(visibleCropZoom - 1) > 0.001 ? expandCropAroundCenter(draft, visibleCropZoom) : null;
  const storedPreviewStyle = storedPreview ? createScaledStyle(storedPreview, scale) : null;
  const cropEdges: { edge: ResizeEdge; start: Point; end: Point; mid: Point }[] = [
    {
      edge: "top",
      start: cropShapePreview.normalizedPoints[0],
      end: cropShapePreview.normalizedPoints[1],
      mid: {
        x: (cropShapePreview.normalizedPoints[0].x + cropShapePreview.normalizedPoints[1].x) / 2,
        y: (cropShapePreview.normalizedPoints[0].y + cropShapePreview.normalizedPoints[1].y) / 2
      }
    },
    {
      edge: "right",
      start: cropShapePreview.normalizedPoints[1],
      end: cropShapePreview.normalizedPoints[2],
      mid: {
        x: (cropShapePreview.normalizedPoints[1].x + cropShapePreview.normalizedPoints[2].x) / 2,
        y: (cropShapePreview.normalizedPoints[1].y + cropShapePreview.normalizedPoints[2].y) / 2
      }
    },
    {
      edge: "bottom",
      start: cropShapePreview.normalizedPoints[2],
      end: cropShapePreview.normalizedPoints[3],
      mid: {
        x: (cropShapePreview.normalizedPoints[2].x + cropShapePreview.normalizedPoints[3].x) / 2,
        y: (cropShapePreview.normalizedPoints[2].y + cropShapePreview.normalizedPoints[3].y) / 2
      }
    },
    {
      edge: "left",
      start: cropShapePreview.normalizedPoints[3],
      end: cropShapePreview.normalizedPoints[0],
      mid: {
        x: (cropShapePreview.normalizedPoints[3].x + cropShapePreview.normalizedPoints[0].x) / 2,
        y: (cropShapePreview.normalizedPoints[3].y + cropShapePreview.normalizedPoints[0].y) / 2
      }
    }
  ];

  const toPoint = (event: PointerEvent<Element>) =>
    toNaturalPoint(event, overlayRef.current, scale, naturalWidth, naturalHeight);

  const startMove = (event: PointerEvent<Element>) => {
    if (!isMainPointer(event)) {
      return;
    }

    event.preventDefault();
    const point = toPoint(event);
    setDragState({
      kind: "move",
      pointerId: event.pointerId,
      startPoint: point,
      startCrop: draft
    });
    beginPointerCapture(overlayRef.current, event.pointerId);
  };

  const startResize = (edge: ResizeEdge) => (event: PointerEvent<Element>) => {
    if (!isMainPointer(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = toPoint(event);
    const nextDragState: CropDragState = {
      kind: "resize",
      pointerId: event.pointerId,
      edge,
      startCrop: draft
    };
    setDraft(updateDraftForDragState(nextDragState, point, naturalWidth, naturalHeight, frameRatio, visibleCropZoom));
    setDragState(nextDragState);
    beginPointerCapture(overlayRef.current, event.pointerId);
  };

  const onOverlayPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const point = toPoint(event);
    setDraft(updateDraftForDragState(dragState, point, naturalWidth, naturalHeight, frameRatio, visibleCropZoom));
  };

  const stopDrag = (pointerId: number) => {
    endPointerCapture(overlayRef.current, pointerId);
    setDragState((current) => {
      if (!current || current.pointerId !== pointerId) {
        return current;
      }
      return null;
    });
  };

  const onOverlayPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const point = toPoint(event);
    setDraft(updateDraftForDragState(dragState, point, naturalWidth, naturalHeight, frameRatio, visibleCropZoom));
    stopDrag(event.pointerId);
  };

  const onOverlayPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    stopDrag(event.pointerId);
  };

  const applyCrop = () => {
    const storedDraft = expandCropAroundCenter(draft, visibleCropZoom);
    setPanelCrop(panel.id, {
      x: storedDraft.x,
      y: storedDraft.y,
      width: storedDraft.width,
      height: storedDraft.height,
      scale: cropZoom
    });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,8,14,0.82)] p-4 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="studio-surface relative w-full max-w-6xl p-4 md:p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Crop Editor</p>
            <h4 className="text-base font-semibold text-[var(--text-primary)]">图像手动裁剪</h4>
          </div>
          <button className={buttonClass} onClick={onClose}>
            关闭
          </button>
        </div>

        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          蓝色主梯形表示分镜里真正能看到的图像区域；拖动内部可移动，拖动四条边上的控制点可缩放。形状会跟随当前分镜梯形，实际可见区域的比例固定为 {frameRatioText}。
        </p>
        {storedPreviewStyle ? (
          <p className="mt-1 text-xs text-[var(--text-secondary)]">当前图片缩放为 {cropZoom.toFixed(2)}x，外层虚线梯形表示为保留这块可见区域而实际保存的 crop 缓冲范围。</p>
        ) : null}

        <div
          className="relative mx-auto mt-4 overflow-hidden rounded-xl border border-[var(--line-soft)] bg-slate-950 shadow-[0_16px_46px_rgba(2,6,23,0.55)]"
          style={{ width: displayWidth, height: displayHeight }}
        >
          <img
            src={panel.image.original}
            alt="crop-source"
            className="block select-none"
            draggable={false}
            style={{ width: displayWidth, height: displayHeight }}
          />

          <div
            ref={overlayRef}
            className="absolute inset-0 touch-none"
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
            onPointerCancel={onOverlayPointerCancel}
          >
            {storedPreviewStyle ? (
              <div className="pointer-events-none absolute" style={storedPreviewStyle}>
                <svg
                  className="absolute inset-0 block h-full w-full overflow-visible"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <polygon
                    points={cropShapePreview.svgPoints}
                    fill="rgba(34, 211, 238, 0.08)"
                    stroke="rgb(165 243 252)"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
            ) : null}
            <div className="absolute" style={draftStyle}>
              <svg
                className="absolute inset-0 block h-full w-full overflow-visible"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polygon
                  points={cropShapePreview.svgPoints}
                  fill="rgba(34, 211, 238, 0.10)"
                  className="cursor-move"
                  onPointerDown={startMove}
                />
                <polygon
                  points={cropShapePreview.svgPoints}
                  fill="none"
                  stroke="rgb(103 232 249)"
                  strokeWidth="1.8"
                  vectorEffect="non-scaling-stroke"
                />
                {cropEdges.map((edge) => (
                  <g key={edge.edge}>
                    <line
                      x1={edge.start.x * 100}
                      y1={edge.start.y * 100}
                      x2={edge.end.x * 100}
                      y2={edge.end.y * 100}
                      stroke="transparent"
                      strokeWidth="14"
                      vectorEffect="non-scaling-stroke"
                      style={{ cursor: getHandleCursor(edge.edge) }}
                      onPointerDown={startResize(edge.edge)}
                    />
                  </g>
                ))}
              </svg>
              {cropEdges.map((edge) => (
                <div
                  key={`${edge.edge}-handle`}
                  className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100 bg-cyan-400 shadow-[0_0_0_1px_rgba(34,211,238,0.35)]"
                  style={{
                    left: `${edge.mid.x * 100}%`,
                    top: `${edge.mid.y * 100}%`,
                    cursor: getHandleCursor(edge.edge)
                  }}
                  onPointerDown={startResize(edge.edge)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-primary)]">
          <span>
            可见: X {Math.round(draft.x)} Y {Math.round(draft.y)} W {Math.round(draft.width)} H {Math.round(draft.height)}
          </span>
          {storedPreview ? (
            <>
              <span className="text-[var(--text-secondary)]">|</span>
              <span>
                保存: X {Math.round(storedPreview.x)} Y {Math.round(storedPreview.y)} W {Math.round(storedPreview.width)} H {Math.round(storedPreview.height)}
              </span>
            </>
          ) : null}
          <span className="text-[var(--text-secondary)]">|</span>
          <span>
            原图: {naturalWidth} x {naturalHeight}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className={buttonClass} onClick={() => setDraft(initialCrop)}>
            回到当前裁剪
          </button>
          <button
            className={buttonClass}
            onClick={() => setDraft(createCenteredVisibleCropWithRatio(naturalWidth, naturalHeight, frameRatio, visibleCropZoom))}
          >
            匹配比例最大区域
          </button>
          <button
            className={dangerButtonClass}
            onClick={() => {
              resetPanelCrop(panel.id);
              onClose();
            }}
          >
            清除裁剪
          </button>
          <button className={primaryButtonClass} onClick={applyCrop}>
            应用裁剪
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CropEditor({ panel }: { panel: Panel }) {
  const setPanelCrop = useEditorStore((state) => state.setPanelCrop);
  const resetPanelCrop = useEditorStore((state) => state.resetPanelCrop);

  if (!panel.image?.original) {
    return null;
  }

  const naturalWidth = panel.image.naturalWidth ?? panel.width;
  const naturalHeight = panel.image.naturalHeight ?? panel.height;
  const crop: CropConfig = panel.image.crop ?? {
    x: 0,
    y: 0,
    width: naturalWidth,
    height: naturalHeight,
    scale: 1
  };

  const update = (patch: Partial<CropConfig>) => {
    setPanelCrop(panel.id, {
      ...crop,
      ...patch
    });
  };

  return (
    <div className={sectionClass}>
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">精细裁剪参数（非破坏）</h4>
      <p className="text-xs text-[var(--text-secondary)]">
        原图尺寸: {naturalWidth} x {naturalHeight}
      </p>

      <NumberField label="Crop X" value={crop.x} min={0} onChange={(value) => update({ x: value })} />
      <NumberField label="Crop Y" value={crop.y} min={0} onChange={(value) => update({ y: value })} />
      <NumberField
        label="Crop Width"
        value={crop.width}
        min={1}
        max={naturalWidth}
        onChange={(value) => update({ width: value })}
      />
      <NumberField
        label="Crop Height"
        value={crop.height}
        min={1}
        max={naturalHeight}
        onChange={(value) => update({ height: value })}
      />
      <NumberField label="Scale" value={crop.scale} min={0.1} max={4} step={0.05} onChange={(value) => update({ scale: value })} />

      <button className={buttonClass} onClick={() => resetPanelCrop(panel.id)}>
        重置裁剪
      </button>
    </div>
  );
}

function PanelInspector({ panel }: { panel: Panel }) {
  const updatePanel = useEditorStore((state) => state.updatePanel);
  const generateImageForPanel = useEditorStore((state) => state.generateImageForPanel);
  const uploadLocalImageForPanel = useEditorStore((state) => state.uploadLocalImageForPanel);
  const generatingPanelId = useEditorStore((state) => state.busy.generatingPanelId);
  const uploadingPanelId = useEditorStore((state) => state.busy.uploadingPanelId);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const localImageInputRef = useRef<HTMLInputElement | null>(null);
  const panelRotation = normalizePanelRotation(panel.rotation);
  const panelShape = normalizePanelShape(panel.shape, panel.width);

  useEffect(() => {
    setCropModalOpen(false);
  }, [panel.id]);

  const patch = (key: keyof Panel) => (value: string | number) => {
    updatePanel(panel.id, {
      [key]: value
    } as Partial<Panel>);
  };

  const onLocalImageSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void uploadLocalImageForPanel(panel.id, file);
    event.target.value = "";
  };

  const adjustRotation = (delta: number) => {
    updatePanel(panel.id, {
      rotation: normalizePanelRotation(panelRotation + delta)
    });
  };

  const updateShape = (patchShape: Partial<PanelShape>) => {
    updatePanel(panel.id, {
      shape: normalizePanelShape(
        {
          ...panelShape,
          ...patchShape
        },
        panel.width
      )
    });
  };

  const applyShapePreset = (shape: PanelShape) => {
    updatePanel(panel.id, {
      shape: normalizePanelShape(shape, panel.width)
    });
  };

  return (
    <div className="space-y-3">
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">分镜属性</h3>
          <span className="studio-chip px-2.5 py-1 text-[11px]">Panel</span>
        </div>
        <NumberField label="X" value={panel.x} onChange={patch("x") as (v: number) => void} />
        <NumberField label="Y" value={panel.y} onChange={patch("y") as (v: number) => void} />
        <NumberField label="Width" value={panel.width} min={24} onChange={patch("width") as (v: number) => void} />
        <NumberField label="Height" value={panel.height} min={24} onChange={patch("height") as (v: number) => void} />
        <NumberField
          label="Tilt"
          value={panelRotation}
          min={-180}
          max={180}
          onChange={(value) => patch("rotation")(normalizePanelRotation(value))}
        />
        <NumberField label="BorderWidth" value={panel.borderWidth} min={0} onChange={patch("borderWidth") as (v: number) => void} />
        <NumberField label="Radius" value={panel.borderRadius} min={0} onChange={patch("borderRadius") as (v: number) => void} />
        <NumberField label="Gap" value={panel.gap} min={0} onChange={patch("gap") as (v: number) => void} />

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} onClick={() => adjustRotation(-10)}>
              -10°
            </button>
            <button className={buttonClass} onClick={() => adjustRotation(-5)}>
              -5°
            </button>
            <button
              className={buttonClass}
              onClick={() => {
                updatePanel(panel.id, {
                  rotation: 0
                });
              }}
            >
              归零
            </button>
            <button className={buttonClass} onClick={() => adjustRotation(5)}>
              +5°
            </button>
            <button className={buttonClass} onClick={() => adjustRotation(10)}>
              +10°
            </button>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">画布上也可以直接拖动蓝色旋转手柄，角度会按 5° 吸附。</p>
        </div>

        <label className={fieldClass}>
          <span className={labelClass}>BorderColor</span>
          <input
            className={colorInputClass}
            type="color"
            value={panel.borderColor}
            onChange={(event) => patch("borderColor")(event.target.value)}
          />
        </label>
      </div>

      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">斜切</h3>
          <span className="studio-chip px-2.5 py-1 text-[11px]">Skew</span>
        </div>

        <p className="text-xs text-[var(--text-secondary)]">
          最推荐的编辑方式是直接在画布拖动四个蓝色角点；这里更适合精修百分比或一键套用常见构图。
        </p>
        <p className="text-xs text-[var(--text-secondary)]">支持负值和超过 100% 的数值，这样就能把边角向外扩出去。</p>

        <ShapePercentField label="Top Left" value={panelShape.topLeft} onChange={(value) => updateShape({ topLeft: value })} />
        <ShapePercentField label="Top Right" value={panelShape.topRight} onChange={(value) => updateShape({ topRight: value })} />
        <ShapePercentField
          label="Bottom Right"
          value={panelShape.bottomRight}
          onChange={(value) => updateShape({ bottomRight: value })}
        />
        <ShapePercentField
          label="Bottom Left"
          value={panelShape.bottomLeft}
          onChange={(value) => updateShape({ bottomLeft: value })}
        />

        <div className="flex flex-wrap gap-2">
          {PANEL_SHAPE_PRESETS.map((preset) => (
            <button key={preset.label} className={buttonClass} onClick={() => applyShapePreset(preset.shape)}>
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">图像来源</h3>
          <span className="studio-chip px-2.5 py-1 text-[11px]">Image</span>
        </div>

        <input
          ref={localImageInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          onChange={onLocalImageSelected}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            className={primaryButtonClass}
            disabled={uploadingPanelId === panel.id}
            onClick={() => localImageInputRef.current?.click()}
          >
            {uploadingPanelId === panel.id ? "导入中..." : "导入本地图片"}
          </button>

          {panel.image?.original ? (
            <button className={buttonClass} onClick={() => setCropModalOpen(true)}>
              打开手动裁剪
            </button>
          ) : null}
        </div>

        {panel.image?.original ? (
          <p className="text-xs text-[var(--text-secondary)]">
            当前图像尺寸: {panel.image.naturalWidth ?? "?"} x {panel.image.naturalHeight ?? "?"}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">未导入本地图像时，可继续使用 AI 生成。</p>
        )}
      </div>

      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI 生成</h3>
          <span className="studio-chip px-2.5 py-1 text-[11px]">Prompt</span>
        </div>
        <label className="space-y-1">
          <span className={labelClass}>Prompt</span>
          <textarea
            className={textareaClass}
            rows={4}
            value={panel.prompt ?? ""}
            onChange={(event) => patch("prompt")(event.target.value)}
          />
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Negative Prompt</span>
          <textarea
            className={textareaClass}
            rows={3}
            value={panel.negativePrompt ?? ""}
            onChange={(event) => patch("negativePrompt")(event.target.value)}
          />
        </label>

        <button
          className={primaryButtonClass}
          disabled={generatingPanelId === panel.id}
          onClick={() => {
            void generateImageForPanel(panel.id);
          }}
        >
          {generatingPanelId === panel.id ? "生成中..." : "生成图像"}
        </button>
      </div>

      <CropEditor panel={panel} />

      <VisualCropModal panel={panel} open={cropModalOpen} onClose={() => setCropModalOpen(false)} />
    </div>
  );
}

function BubbleInspector({ bubble }: { bubble: Bubble }) {
  const updateBubble = useEditorStore((state) => state.updateBubble);

  const patch = (key: keyof Bubble) => (value: string | number) => {
    updateBubble(bubble.id, {
      [key]: value
    } as Partial<Bubble>);
  };

  return (
    <div className="space-y-3">
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">气泡属性</h3>
          <span className="studio-chip px-2.5 py-1 text-[11px]">Bubble</span>
        </div>
        <label className={fieldClass}>
          <span className={labelClass}>Type</span>
          <select
            className={`${selectClass} max-w-40`}
            value={bubble.type}
            onChange={(event) => patch("type")(event.target.value)}
          >
            <option value="rect">Rect</option>
            <option value="rounded">Rounded</option>
            <option value="circle">Circle</option>
          </select>
        </label>

        <label className={fieldClass}>
          <span className={labelClass}>Direction</span>
          <select
            className={`${selectClass} max-w-40`}
            value={bubble.direction}
            onChange={(event) => patch("direction")(event.target.value)}
          >
            <option value="horizontal">horizontal</option>
            <option value="vertical">vertical</option>
          </select>
        </label>

        <NumberField label="X" value={bubble.x} onChange={patch("x") as (v: number) => void} />
        <NumberField label="Y" value={bubble.y} onChange={patch("y") as (v: number) => void} />
        <NumberField label="Width" value={bubble.width} min={30} onChange={patch("width") as (v: number) => void} />
        <NumberField label="Height" value={bubble.height} min={30} onChange={patch("height") as (v: number) => void} />
        <NumberField label="Font Size" value={bubble.fontSize} min={8} onChange={patch("fontSize") as (v: number) => void} />

        <TextField label="Font Family" value={bubble.fontFamily} onChange={patch("fontFamily") as (v: string) => void} />

        <label className={fieldClass}>
          <span className={labelClass}>Background</span>
          <input
            className={colorInputClass}
            type="color"
            value={bubble.background}
            onChange={(event) => patch("background")(event.target.value)}
          />
        </label>

        <label className={fieldClass}>
          <span className={labelClass}>Border</span>
          <input
            className={colorInputClass}
            type="color"
            value={bubble.borderColor}
            onChange={(event) => patch("borderColor")(event.target.value)}
          />
        </label>
      </div>

      <div className={sectionClass}>
        <label className="space-y-1">
          <span className={labelClass}>Text</span>
          <textarea
            rows={6}
            className={textareaClass}
            value={bubble.text}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => patch("text")(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

export default function InspectorPanel() {
  const activePage = useEditorStore((state) => getActivePage(state.project));
  const selection = useEditorStore((state) => state.selection);

  const selectedPanel =
    selection?.kind === "panel" ? activePage.panels.find((panel) => panel.id === selection.id) : undefined;
  const selectedBubble =
    selection?.kind === "bubble" ? activePage.bubbles.find((bubble) => bubble.id === selection.id) : undefined;

  return (
    <aside className={containerClass}>
      <div className="mb-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">Inspector</p>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">属性检查器</h2>
      </div>

      {!selection && (
        <p className="studio-subtle rounded-xl px-3 py-2 text-sm text-[var(--text-secondary)]">
          请选择一个分镜或气泡进行编辑。
        </p>
      )}

      {selectedPanel && <PanelInspector panel={selectedPanel} />}
      {selectedBubble && <BubbleInspector bubble={selectedBubble} />}
    </aside>
  );
}
