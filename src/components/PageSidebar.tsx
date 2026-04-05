import { useMemo } from "react";
import { Ellipse, Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import useImage from "use-image";
import { Bubble, Panel, ProjectPage } from "../types";
import { useEditorStore } from "../lib/store";

const buttonClass =
  "rounded-lg border border-slate-500 bg-slate-800 px-2 py-1 text-xs text-slate-100 transition hover:border-blue-400 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40";

function toVerticalText(text: string) {
  return text
    .split("\n")
    .map((line) => line.split("").join("\n"))
    .join("\n\n");
}

function PreviewPanelImage({ panel }: { panel: Panel }) {
  const imageUrl = panel.image?.original ?? "";
  const [image] = useImage(imageUrl, "anonymous");

  if (!image || !panel.image) {
    return null;
  }

  const innerWidth = Math.max(1, panel.width - panel.gap * 2);
  const innerHeight = Math.max(1, panel.height - panel.gap * 2);

  const crop = panel.image.crop;
  const sourceWidth = crop?.width ?? panel.image.naturalWidth ?? image.width;
  const sourceHeight = crop?.height ?? panel.image.naturalHeight ?? image.height;
  const coverScale = Math.max(innerWidth / Math.max(1, sourceWidth), innerHeight / Math.max(1, sourceHeight));
  const drawScale = coverScale * (crop?.scale ?? 1);
  const drawWidth = sourceWidth * drawScale;
  const drawHeight = sourceHeight * drawScale;
  const offsetX = panel.gap + (innerWidth - drawWidth) / 2;
  const offsetY = panel.gap + (innerHeight - drawHeight) / 2;

  return (
    <Group clipX={panel.gap} clipY={panel.gap} clipWidth={innerWidth} clipHeight={innerHeight} listening={false}>
      <KonvaImage
        image={image}
        x={offsetX}
        y={offsetY}
        width={drawWidth}
        height={drawHeight}
        crop={
          crop
            ? {
                x: crop.x,
                y: crop.y,
                width: crop.width,
                height: crop.height
              }
            : undefined
        }
        listening={false}
      />
    </Group>
  );
}

function PreviewBubbleShape({ bubble }: { bubble: Bubble }) {
  if (bubble.type === "circle") {
    return (
      <Ellipse
        x={bubble.width / 2}
        y={bubble.height / 2}
        radiusX={bubble.width / 2}
        radiusY={bubble.height / 2}
        fill={bubble.background}
        stroke={bubble.borderColor}
        strokeWidth={3}
        listening={false}
      />
    );
  }

  return (
    <Rect
      width={bubble.width}
      height={bubble.height}
      fill={bubble.background}
      stroke={bubble.borderColor}
      strokeWidth={3}
      cornerRadius={bubble.type === "rounded" ? 30 : 8}
      listening={false}
    />
  );
}

function PageMiniPreview({ page }: { page: ProjectPage }) {
  const preview = useMemo(() => {
    const scale = Math.min(1, 140 / page.canvas.width, 198 / page.canvas.height);
    const width = Math.max(70, Math.round(page.canvas.width * scale));
    const height = Math.max(100, Math.round(page.canvas.height * scale));
    return {
      scale,
      width,
      height
    };
  }, [page.canvas.height, page.canvas.width]);

  return (
    <div
      className="overflow-hidden rounded-md border border-slate-400 bg-slate-100 shadow-inner"
      style={{ width: preview.width, height: preview.height }}
    >
      <Stage
        width={preview.width}
        height={preview.height}
        scaleX={preview.scale}
        scaleY={preview.scale}
        className="pointer-events-none"
      >
        <Layer listening={false}>
          <Rect x={0} y={0} width={page.canvas.width} height={page.canvas.height} fill="#f8fafc" listening={false} />

          {page.panels.map((panel) => (
            <Group key={panel.id} x={panel.x} y={panel.y} width={panel.width} height={panel.height} listening={false}>
              <Rect
                width={panel.width}
                height={panel.height}
                fill="#ffffff"
                cornerRadius={panel.borderRadius}
                stroke={panel.borderColor}
                strokeWidth={panel.borderWidth}
                listening={false}
              />
              <PreviewPanelImage panel={panel} />
            </Group>
          ))}

          {page.bubbles.map((bubble) => (
            <Group key={bubble.id} x={bubble.x} y={bubble.y} width={bubble.width} height={bubble.height} listening={false}>
              <PreviewBubbleShape bubble={bubble} />
              <Text
                x={10}
                y={10}
                width={Math.max(10, bubble.width - 20)}
                height={Math.max(10, bubble.height - 20)}
                text={bubble.direction === "vertical" ? toVerticalText(bubble.text) : bubble.text}
                align="center"
                verticalAlign="middle"
                fontSize={bubble.fontSize}
                fontFamily={bubble.fontFamily}
                fill="#0f172a"
                lineHeight={1.2}
                listening={false}
              />
            </Group>
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

export default function PageSidebar() {
  const project = useEditorStore((state) => state.project);
  const setActivePage = useEditorStore((state) => state.setActivePage);
  const addPage = useEditorStore((state) => state.addPage);
  const deletePage = useEditorStore((state) => state.deletePage);
  const movePage = useEditorStore((state) => state.movePage);

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-700 bg-ink-900 shadow-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-100">页面</h3>
        <button className={buttonClass} onClick={() => addPage()}>
          + 新增
        </button>
      </div>

      <div className="space-y-2 overflow-auto p-2">
        {project.pages.map((page, index) => {
          const isActive = project.activePageId === page.id;
          const canMoveUp = index > 0;
          const canMoveDown = index < project.pages.length - 1;
          const canDelete = project.pages.length > 1;

          return (
            <div
              key={page.id}
              className={`rounded-xl border p-2 transition ${
                isActive ? "border-blue-400 bg-blue-500/15" : "border-slate-700 bg-ink-800 hover:border-slate-500"
              }`}
            >
              <button
                className="w-full space-y-2 text-left"
                onClick={() => setActivePage(page.id)}
                type="button"
                title={page.name}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-100">P{index + 1}</span>
                  <span className="text-[11px] text-slate-400">
                    {page.canvas.width}x{page.canvas.height}
                  </span>
                </div>
                <div className="flex justify-center">
                  <PageMiniPreview page={page} />
                </div>
                <div className="text-[11px] text-slate-400">
                  分镜 {page.panels.length} · 气泡 {page.bubbles.length}
                </div>
              </button>

              <div className="mt-2 flex items-center justify-between gap-1">
                <button
                  className={buttonClass}
                  disabled={!canMoveUp}
                  onClick={() => movePage(page.id, "up")}
                  type="button"
                >
                  上移
                </button>
                <button
                  className={buttonClass}
                  disabled={!canMoveDown}
                  onClick={() => movePage(page.id, "down")}
                  type="button"
                >
                  下移
                </button>
                <button
                  className={`${buttonClass} border-rose-600/70 hover:border-rose-400`}
                  disabled={!canDelete}
                  onClick={() => deletePage(page.id)}
                  type="button"
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
