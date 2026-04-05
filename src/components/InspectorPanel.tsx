import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bubble, CropConfig, Panel } from "../types";
import { useEditorStore } from "../lib/store";

const containerClass =
  "h-full overflow-auto rounded-2xl border border-slate-700 bg-ink-900 p-4 text-slate-100 shadow-panel";
const sectionClass = "space-y-3 rounded-xl border border-slate-700 bg-ink-800 p-3";
const fieldClass = "flex items-center justify-between gap-3";
const labelClass = "text-xs uppercase tracking-wide text-slate-400";
const inputClass =
  "w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none ring-blue-500 focus:ring";
const textareaClass =
  "w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500 focus:ring";
const buttonClass =
  "rounded-lg border border-slate-500 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 transition hover:border-blue-400 hover:bg-slate-700";

type CropDraft = {
  x: number;
  y: number;
  width: number;
  height: number;
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

function createCropFromPointsWithRatio(
  start: { x: number; y: number },
  end: { x: number; y: number },
  naturalWidth: number,
  naturalHeight: number,
  ratio: number
): CropDraft {
  const safeRatio = Math.max(0.001, ratio);
  const directionX = end.x >= start.x ? 1 : -1;
  const directionY = end.y >= start.y ? 1 : -1;
  const maxWidth = directionX > 0 ? naturalWidth - start.x : start.x;
  const maxHeight = directionY > 0 ? naturalHeight - start.y : start.y;

  let width = Math.abs(end.x - start.x);
  let height = Math.abs(end.y - start.y);

  if (width < 1 && height < 1) {
    width = safeRatio >= 1 ? safeRatio : 1;
    height = safeRatio >= 1 ? 1 : 1 / safeRatio;
  } else if (width / Math.max(height, 0.001) >= safeRatio) {
    height = width / safeRatio;
  } else {
    width = height * safeRatio;
  }

  const fitScale = Math.min(1, maxWidth / Math.max(width, 1), maxHeight / Math.max(height, 1));
  width = Math.max(1, width * fitScale);
  height = Math.max(1, height * fitScale);

  let x = directionX > 0 ? start.x : start.x - width;
  let y = directionY > 0 ? start.y : start.y - height;

  x = clamp(x, 0, naturalWidth - width);
  y = clamp(y, 0, naturalHeight - height);

  return {
    x,
    y,
    width,
    height
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
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(initialCrop);
    setDragStart(null);
  }, [initialCrop, open]);

  if (!open || !panel.image?.original) {
    return null;
  }

  const scale = Math.min(1, 920 / naturalWidth, 560 / naturalHeight);
  const displayWidth = Math.max(1, Math.round(naturalWidth * scale));
  const displayHeight = Math.max(1, Math.round(naturalHeight * scale));

  const toNaturalPoint = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / scale, 0, naturalWidth);
    const y = clamp((event.clientY - rect.top) / scale, 0, naturalHeight);
    return { x, y };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const rawPoint = toNaturalPoint(event);
    const point = {
      x: clamp(rawPoint.x, 0, Math.max(0, naturalWidth - 1)),
      y: clamp(rawPoint.y, 0, Math.max(0, naturalHeight - 1))
    };
    setDragStart(point);
    setDraft(createCropFromPointsWithRatio(point, point, naturalWidth, naturalHeight, frameRatio));
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart) {
      return;
    }

    const point = toNaturalPoint(event);
    setDraft(createCropFromPointsWithRatio(dragStart, point, naturalWidth, naturalHeight, frameRatio));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart) {
      return;
    }

    const point = toNaturalPoint(event);
    setDraft(createCropFromPointsWithRatio(dragStart, point, naturalWidth, naturalHeight, frameRatio));
    setDragStart(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-6xl rounded-2xl border border-slate-700 bg-ink-900 p-4 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-base font-semibold">图像手动裁剪</h4>
          <button className={buttonClass} onClick={onClose}>
            关闭
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-400">
          拖拽框选要保留的区域。裁剪框比例固定为分镜比例 {frameRatioText}，原图会保留在本地。
        </p>

        <div
          className="relative mx-auto mt-4 overflow-hidden rounded-lg border border-slate-700 bg-slate-950"
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
            className="absolute inset-0 cursor-crosshair"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div
              className="absolute border-2 border-blue-400 bg-blue-500/20"
              style={{
                left: draft.x * scale,
                top: draft.y * scale,
                width: Math.max(1, draft.width * scale),
                height: Math.max(1, draft.height * scale)
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span>
            X: {Math.round(draft.x)} Y: {Math.round(draft.y)} W: {Math.round(draft.width)} H: {Math.round(draft.height)}
          </span>
          <span className="text-slate-500">|</span>
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
            className={buttonClass}
            onClick={() => {
              resetPanelCrop(panel.id);
              onClose();
            }}
          >
            清除裁剪
          </button>
          <button className={`${buttonClass} border-blue-500`} onClick={applyCrop}>
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
      <h4 className="text-sm font-semibold text-slate-200">精细裁剪参数（非破坏）</h4>
      <p className="text-xs text-slate-400">
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
        <h3 className="text-sm font-semibold">分镜属性</h3>
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
            className="h-9 w-20 rounded border border-slate-600 bg-transparent"
            type="color"
            value={panel.borderColor}
            onChange={(event) => patch("borderColor")(event.target.value)}
          />
        </label>
      </div>

      <div className={sectionClass}>
        <h3 className="text-sm font-semibold">图像来源</h3>

        <input
          ref={localImageInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          onChange={onLocalImageSelected}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            className={buttonClass}
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
          <p className="text-xs text-slate-400">
            当前图像尺寸: {panel.image.naturalWidth ?? "?"} x {panel.image.naturalHeight ?? "?"}
          </p>
        ) : (
          <p className="text-xs text-slate-400">未导入本地图像时，可继续使用 AI 生成。</p>
        )}
      </div>

      <div className={sectionClass}>
        <h3 className="text-sm font-semibold">AI 生成</h3>
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
          className={buttonClass}
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
        <h3 className="text-sm font-semibold">气泡属性</h3>
        <label className={fieldClass}>
          <span className={labelClass}>Type</span>
          <select
            className={`${inputClass} max-w-40`}
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
            className={`${inputClass} max-w-40`}
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
            className="h-9 w-20 rounded border border-slate-600 bg-transparent"
            type="color"
            value={bubble.background}
            onChange={(event) => patch("background")(event.target.value)}
          />
        </label>

        <label className={fieldClass}>
          <span className={labelClass}>Border</span>
          <input
            className="h-9 w-20 rounded border border-slate-600 bg-transparent"
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
  const project = useEditorStore((state) => state.project);
  const selection = useEditorStore((state) => state.selection);

  const selectedPanel =
    selection?.kind === "panel" ? project.panels.find((panel) => panel.id === selection.id) : undefined;
  const selectedBubble =
    selection?.kind === "bubble" ? project.bubbles.find((bubble) => bubble.id === selection.id) : undefined;

  return (
    <aside className={containerClass}>
      <h2 className="mb-4 text-lg font-semibold">Inspector</h2>

      {!selection && <p className="text-sm text-slate-400">请选择一个分镜或气泡进行编辑。</p>}

      {selectedPanel && <PanelInspector panel={selectedPanel} />}
      {selectedBubble && <BubbleInspector bubble={selectedBubble} />}
    </aside>
  );
}
