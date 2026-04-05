import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bubble, CropConfig, Panel } from "../types";
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

function normalizeCropToRatio(
  crop: CropDraft,
  naturalWidth: number,
  naturalHeight: number,
  ratio: number
): CropDraft {
  const safeRatio = Math.max(0.001, ratio);
  let width = Math.max(1, crop.width);
  let height = Math.max(1, crop.height);
  const centerX = crop.x + width / 2;
  const centerY = crop.y + height / 2;

  if (width / height >= safeRatio) {
    height = width / safeRatio;
  } else {
    width = height * safeRatio;
  }

  const fitScale = Math.min(1, naturalWidth / width, naturalHeight / height);
  width = Math.max(1, width * fitScale);
  height = Math.max(1, height * fitScale);

  const x = clamp(centerX - width / 2, 0, naturalWidth - width);
  const y = clamp(centerY - height / 2, 0, naturalHeight - height);
  return {
    x,
    y,
    width,
    height
  };
}

function moveCropWithinBounds(
  crop: CropDraft,
  deltaX: number,
  deltaY: number,
  naturalWidth: number,
  naturalHeight: number
): CropDraft {
  return {
    x: clamp(crop.x + deltaX, 0, Math.max(0, naturalWidth - crop.width)),
    y: clamp(crop.y + deltaY, 0, Math.max(0, naturalHeight - crop.height)),
    width: crop.width,
    height: crop.height
  };
}

function resizeCropFromEdgeWithRatio(
  initial: CropDraft,
  edge: ResizeEdge,
  point: Point,
  naturalWidth: number,
  naturalHeight: number,
  ratio: number
): CropDraft {
  const safeRatio = Math.max(0.001, ratio);
  const safeWidth = Math.max(1, naturalWidth);
  const safeHeight = Math.max(1, naturalHeight);

  if (edge === "left" || edge === "right") {
    const anchorX = edge === "left" ? initial.x + initial.width : initial.x;
    const centerY = initial.y + initial.height / 2;
    const maxWidthByHorizontal = edge === "left" ? anchorX : safeWidth - anchorX;
    const maxHalfHeight = Math.min(centerY, safeHeight - centerY);
    const maxWidthByVertical = maxHalfHeight * 2 * safeRatio;
    const maxWidth = Math.max(1, Math.min(maxWidthByHorizontal, maxWidthByVertical));

    let width = edge === "left" ? anchorX - point.x : point.x - anchorX;
    width = clamp(width, 1, maxWidth);
    const height = width / safeRatio;
    const x = edge === "left" ? anchorX - width : anchorX;
    const y = clamp(centerY - height / 2, 0, Math.max(0, safeHeight - height));
    return {
      x: clamp(x, 0, Math.max(0, safeWidth - width)),
      y,
      width,
      height
    };
  }

  const anchorY = edge === "top" ? initial.y + initial.height : initial.y;
  const centerX = initial.x + initial.width / 2;
  const maxHeightByVertical = edge === "top" ? anchorY : safeHeight - anchorY;
  const maxHalfWidth = Math.min(centerX, safeWidth - centerX);
  const maxHeightByHorizontal = (maxHalfWidth * 2) / safeRatio;
  const maxHeight = Math.max(1, Math.min(maxHeightByVertical, maxHeightByHorizontal));

  let height = edge === "top" ? anchorY - point.y : point.y - anchorY;
  height = clamp(height, 1, maxHeight);
  const width = height * safeRatio;
  const y = edge === "top" ? anchorY - height : anchorY;
  const x = clamp(centerX - width / 2, 0, Math.max(0, safeWidth - width));
  return {
    x,
    y: clamp(y, 0, Math.max(0, safeHeight - height)),
    width,
    height
  };
}

function toNaturalPoint(
  event: PointerEvent<HTMLElement>,
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

function isMainPointer(event: PointerEvent<HTMLElement>) {
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

function cropHandleClass(edge: ResizeEdge) {
  if (edge === "left") {
    return "absolute bottom-2 left-0 top-2 w-4 -translate-x-1/2";
  }
  if (edge === "right") {
    return "absolute bottom-2 right-0 top-2 w-4 translate-x-1/2";
  }
  if (edge === "top") {
    return "absolute left-2 right-2 top-0 h-4 -translate-y-1/2";
  }
  return "absolute bottom-0 left-2 right-2 h-4 translate-y-1/2";
}

function cropHandleGuideClass(edge: ResizeEdge) {
  if (edge === "left" || edge === "right") {
    return "mx-auto h-full w-0.5 bg-cyan-200/90";
  }
  return "my-auto h-0.5 w-full bg-cyan-200/90";
}

function CropEdgeHandle({
  edge,
  onPointerDown
}: {
  edge: ResizeEdge;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={`${cropHandleClass(edge)}`}
      style={{ cursor: getHandleCursor(edge) }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown(event);
      }}
    >
      <div className={cropHandleGuideClass(edge)} />
    </div>
  );
}

function updateDraftForDragState(
  dragState: CropDragState,
  point: Point,
  naturalWidth: number,
  naturalHeight: number,
  frameRatio: number
): CropDraft {
  if (dragState.kind === "move") {
    const deltaX = point.x - dragState.startPoint.x;
    const deltaY = point.y - dragState.startPoint.y;
    return moveCropWithinBounds(dragState.startCrop, deltaX, deltaY, naturalWidth, naturalHeight);
  }

  return resizeCropFromEdgeWithRatio(dragState.startCrop, dragState.edge, point, naturalWidth, naturalHeight, frameRatio);
}

function createScaledStyle(draft: CropDraft, scale: number) {
  return {
    left: draft.x * scale,
    top: draft.y * scale,
    width: Math.max(1, draft.width * scale),
    height: Math.max(1, draft.height * scale)
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
  const frameWidth = Math.max(1, panel.width - panel.gap * 2);
  const frameHeight = Math.max(1, panel.height - panel.gap * 2);
  const frameRatio = frameWidth / frameHeight;
  const frameRatioText = `${Math.round(frameWidth)}:${Math.round(frameHeight)}`;
  const initialCrop: CropDraft = useMemo(
    () => {
      if (panel.image?.crop) {
        return normalizeCropToRatio(
          {
            x: panel.image.crop.x,
            y: panel.image.crop.y,
            width: panel.image.crop.width,
            height: panel.image.crop.height
          },
          naturalWidth,
          naturalHeight,
          frameRatio
        );
      }
      return createCenteredCropWithRatio(naturalWidth, naturalHeight, frameRatio);
    },
    [frameRatio, naturalHeight, naturalWidth, panel.image?.crop]
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

  const scale = Math.min(1, 920 / naturalWidth, 560 / naturalHeight);
  const displayWidth = Math.max(1, Math.round(naturalWidth * scale));
  const displayHeight = Math.max(1, Math.round(naturalHeight * scale));

  const toPoint = (event: PointerEvent<HTMLElement>) =>
    toNaturalPoint(event, overlayRef.current, scale, naturalWidth, naturalHeight);

  const startMove = (event: PointerEvent<HTMLDivElement>) => {
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

  const startResize = (edge: ResizeEdge) => (event: PointerEvent<HTMLDivElement>) => {
    if (!isMainPointer(event)) {
      return;
    }

    event.preventDefault();
    const point = toPoint(event);
    const nextDragState: CropDragState = {
      kind: "resize",
      pointerId: event.pointerId,
      edge,
      startCrop: draft
    };
    setDraft(updateDraftForDragState(nextDragState, point, naturalWidth, naturalHeight, frameRatio));
    setDragState(nextDragState);
    beginPointerCapture(overlayRef.current, event.pointerId);
  };

  const onOverlayPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const point = toPoint(event);
    setDraft(updateDraftForDragState(dragState, point, naturalWidth, naturalHeight, frameRatio));
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
    setDraft(updateDraftForDragState(dragState, point, naturalWidth, naturalHeight, frameRatio));
    stopDrag(event.pointerId);
  };

  const onOverlayPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    stopDrag(event.pointerId);
  };

  const applyCrop = () => {
    setPanelCrop(panel.id, {
      x: draft.x,
      y: draft.y,
      width: draft.width,
      height: draft.height,
      scale: panel.image?.crop?.scale ?? 1
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,8,14,0.82)] p-4 backdrop-blur-sm">
      <div className="studio-surface w-full max-w-6xl p-4 md:p-5">
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
          拖动框内可移动裁剪区域，拖动四条边可缩放。裁剪框比例固定为分镜比例 {frameRatioText}，原图会保留在本地。
        </p>

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
            <div
              className="absolute border-2 border-cyan-300 bg-cyan-400/20"
              style={createScaledStyle(draft, scale)}
              onPointerDown={startMove}
            >
              <CropEdgeHandle edge="left" onPointerDown={startResize("left")} />
              <CropEdgeHandle edge="right" onPointerDown={startResize("right")} />
              <CropEdgeHandle edge="top" onPointerDown={startResize("top")} />
              <CropEdgeHandle edge="bottom" onPointerDown={startResize("bottom")} />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-primary)]">
          <span>
            X: {Math.round(draft.x)} Y: {Math.round(draft.y)} W: {Math.round(draft.width)} H: {Math.round(draft.height)}
          </span>
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
            onClick={() => setDraft(createCenteredCropWithRatio(naturalWidth, naturalHeight, frameRatio))}
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
    </div>
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
        <NumberField label="BorderWidth" value={panel.borderWidth} min={0} onChange={patch("borderWidth") as (v: number) => void} />
        <NumberField label="Radius" value={panel.borderRadius} min={0} onChange={patch("borderRadius") as (v: number) => void} />
        <NumberField label="Gap" value={panel.gap} min={0} onChange={patch("gap") as (v: number) => void} />

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
