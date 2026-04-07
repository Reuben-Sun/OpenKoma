import { useMemo } from "react";
import { Ellipse, Group, Image as KonvaImage, Layer, Rect, Shape, Stage, Text } from "react-konva";
import useImage from "use-image";
import { Bubble, Panel, ProjectPage } from "../types";
import { drawRoundedPolygonPath, getInsetPanelLocalPoints, getPanelRenderTransform, getPolygonBounds } from "../lib/panelGeometry";
import { useEditorStore } from "../lib/store";

const buttonClass =
  "studio-btn h-8 px-2.5 text-xs tracking-[0.01em] disabled:cursor-not-allowed disabled:opacity-40";
const dangerButtonClass = `${buttonClass} studio-btn-danger`;

type PathDrawingContext = Pick<CanvasRenderingContext2D, "moveTo" | "lineTo" | "quadraticCurveTo">;

function drawPanelPath(context: PathDrawingContext, panel: Pick<Panel, "width" | "height" | "shape" | "borderRadius">, inset = 0) {
  const points = getInsetPanelLocalPoints(panel, inset);
  drawRoundedPolygonPath(context, points, Math.max(0, panel.borderRadius - inset));
}

function PreviewPanelFill({ panel }: { panel: Panel }) {
  return (
    <Shape
      sceneFunc={(context, shape) => {
        context.beginPath();
        drawPanelPath(context, panel);
        context.closePath();
        context.fillStrokeShape(shape);
      }}
      fill="#ffffff"
      listening={false}
    />
  );
}

function PreviewPanelBorder({ panel }: { panel: Panel }) {
  return (
    <Shape
      sceneFunc={(context, shape) => {
        context.beginPath();
        drawPanelPath(context, panel);
        context.closePath();
        context.fillStrokeShape(shape);
      }}
      fillEnabled={false}
      stroke={panel.borderColor}
      strokeWidth={panel.borderWidth}
      listening={false}
    />
  );
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

  const clipPoints = getInsetPanelLocalPoints(panel, panel.gap);
  const clipBounds = getPolygonBounds(clipPoints);
  const innerWidth = clipBounds.width;
  const innerHeight = clipBounds.height;

  const crop = panel.image.crop;
  const sourceWidth = crop?.width ?? panel.image.naturalWidth ?? image.width;
  const sourceHeight = crop?.height ?? panel.image.naturalHeight ?? image.height;
  const coverScale = Math.max(innerWidth / Math.max(1, sourceWidth), innerHeight / Math.max(1, sourceHeight));
  const drawScale = coverScale * (crop?.scale ?? 1);
  const drawWidth = sourceWidth * drawScale;
  const drawHeight = sourceHeight * drawScale;
  const offsetX = clipBounds.minX + (innerWidth - drawWidth) / 2;
  const offsetY = clipBounds.minY + (innerHeight - drawHeight) / 2;

  return (
    <Group
      clipFunc={(context) => {
        context.beginPath();
        drawPanelPath(context, panel, panel.gap);
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

          {page.panels.map((panel) => {
            const transform = getPanelRenderTransform(panel);
            return (
              <Group
                key={panel.id}
                x={transform.x}
                y={transform.y}
                width={panel.width}
                height={panel.height}
                offsetX={transform.offsetX}
                offsetY={transform.offsetY}
                rotation={transform.rotation}
                listening={false}
              >
                <PreviewPanelFill panel={panel} />
                <PreviewPanelImage panel={panel} />
                <PreviewPanelBorder panel={panel} />
              </Group>
            );
          })}

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
                  : "border-[var(--line-soft)] bg-[var(--panel-1)] hover:border-[var(--line-strong)] hover:bg-[var(--panel-0)]"
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
