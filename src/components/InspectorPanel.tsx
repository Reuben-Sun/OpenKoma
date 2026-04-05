import { ChangeEvent } from "react";
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
      <h4 className="text-sm font-semibold text-slate-200">图像裁剪（非破坏）</h4>
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
  const generatingPanelId = useEditorStore((state) => state.busy.generatingPanelId);

  const patch = (key: keyof Panel) => (value: string | number) => {
    updatePanel(panel.id, {
      [key]: value
    } as Partial<Panel>);
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
