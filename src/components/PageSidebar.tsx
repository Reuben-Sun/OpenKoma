import { useMemo } from "react";
import { Ellipse, Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import useImage from "use-image";
import { Bubble, Panel, ProjectPage } from "../types";
import { useEditorStore } from "../lib/store";

const buttonClass =
  "studio-btn h-8 px-2.5 text-xs tracking-[0.01em] disabled:cursor-not-allowed disabled:opacity-40";
const dangerButtonClass = `${buttonClass} studio-btn-danger`;

type PathDrawingContext = Pick<CanvasRenderingContext2D, "rect" | "moveTo" | "lineTo" | "quadraticCurveTo">;

function roundedRectPath(
  context: PathDrawingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (safeRadius === 0) {
    context.rect(x, y, width, height);
    return;
  }

  const right = x + width;
  const bottom = y + height;
  context.moveTo(x + safeRadius, y);
  context.lineTo(right - safeRadius, y);
  context.quadraticCurveTo(right, y, right, y + safeRadius);
  context.lineTo(right, bottom - safeRadius);
  context.quadraticCurveTo(right, bottom, right - safeRadius, bottom);
  context.lineTo(x + safeRadius, bottom);
  context.quadraticCurveTo(x, bottom, x, bottom - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
}

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
  const clipX = panel.gap;
  const clipY = panel.gap;
  const clipRadius = Math.max(0, panel.borderRadius - panel.gap);

  return (
    <Group
      clipFunc={(context) => {
        context.beginPath();
        roundedRectPath(context, clipX, clipY, innerWidth, innerHeight, clipRadius);
        context.closePath();
      }}
      listening={false}
    >
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
      className="overflow-hidden rounded-lg border border-slate-300/90 bg-slate-100 shadow-[0_8px_22px_rgba(2,6,23,0.24)]"
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
                listening={false}
              />
              <PreviewPanelImage panel={panel} />
              <Rect
                width={panel.width}
                height={panel.height}
                cornerRadius={panel.borderRadius}
                stroke={panel.borderColor}
                strokeWidth={panel.borderWidth}
                fillEnabled={false}
                listening={false}
              />
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
    <aside className="studio-surface flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-3.5 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">Storyboard</p>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">页面列表</h3>
        </div>
        <button className={`${buttonClass} studio-btn-primary`} onClick={() => addPage()}>
          + 新增
        </button>
      </div>

      <div className="space-y-2.5 overflow-auto p-2.5">
        {project.pages.map((page, index) => {
          const isActive = project.activePageId === page.id;
          const canMoveUp = index > 0;
          const canMoveDown = index < project.pages.length - 1;
          const canDelete = project.pages.length > 1;

          return (
            <div
              key={page.id}
              className={`rounded-2xl border p-2.5 transition ${
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_12px_26px_rgba(2,42,56,0.35)]"
                  : "border-[var(--line-soft)] bg-[rgba(12,18,28,0.72)] hover:border-[var(--line-strong)]"
              }`}
            >
              <button
                className="w-full space-y-2.5 rounded-xl p-1 text-left"
                onClick={() => setActivePage(page.id)}
                type="button"
                title={page.name}
              >
                <div className="flex items-center justify-between">
                  <span className="studio-chip px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
                    P{index + 1}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {page.canvas.width}x{page.canvas.height}
                  </span>
                </div>
                <div className="flex justify-center">
                  <PageMiniPreview page={page} />
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
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
                  className={dangerButtonClass}
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
