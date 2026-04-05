import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Ellipse, Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import useImage from "use-image";
import { Bubble, Panel } from "../types";
import { getActivePage, useEditorStore } from "../lib/store";

type DraftRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasEditorHandle = {
  exportPng: () => Promise<void>;
  exportPdf: () => Promise<void>;
};

function formatFilename(projectName: string, ext: "png" | "pdf") {
  const safe = projectName.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_") || "openkoma";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safe}_${stamp}.${ext}`;
}

function triggerDownload(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

function snapSize(value: number, minValue: number, step = 16) {
  const minMultiple = Math.ceil(minValue / step) * step;
  const snapped = Math.round(value / step) * step;
  return Math.max(minMultiple, snapped);
}

function getOrientation(width: number, height: number): "landscape" | "portrait" {
  return width >= height ? "landscape" : "portrait";
}

function waitForStageRefresh(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

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

function PanelImageLayer({ panel }: { panel: Panel }) {
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
      />
    </Group>
  );
}

function BubbleShape({ bubble }: { bubble: Bubble }) {
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
    />
  );
}

function toVerticalText(text: string) {
  return text
    .split("\n")
    .map((line) => line.split("").join("\n"))
    .join("\n\n");
}

function BubbleText({ bubble }: { bubble: Bubble }) {
  const text = bubble.direction === "vertical" ? toVerticalText(bubble.text) : bubble.text;

  return (
    <Text
      x={10}
      y={10}
      width={Math.max(10, bubble.width - 20)}
      height={Math.max(10, bubble.height - 20)}
      text={text}
      align="center"
      verticalAlign="middle"
      fontSize={bubble.fontSize}
      fontFamily={bubble.fontFamily}
      fill="#0f172a"
      lineHeight={1.2}
      listening={false}
    />
  );
}

const CanvasEditor = forwardRef<CanvasEditorHandle>(function CanvasEditor(_props, ref) {
  const project = useEditorStore((state) => state.project);
  const activePage = useEditorStore((state) => getActivePage(state.project));
  const selection = useEditorStore((state) => state.selection);
  const manualPanelMode = useEditorStore((state) => state.manualPanelMode);
  const snapSizeTo16 = useEditorStore((state) => state.snapSizeTo16);

  const setNotice = useEditorStore((state) => state.setNotice);
  const setActivePage = useEditorStore((state) => state.setActivePage);
  const selectPanel = useEditorStore((state) => state.selectPanel);
  const selectBubble = useEditorStore((state) => state.selectBubble);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const updatePanel = useEditorStore((state) => state.updatePanel);
  const updateBubble = useEditorStore((state) => state.updateBubble);
  const createPanelFromRect = useEditorStore((state) => state.createPanelFromRect);

  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const [zoom, setZoom] = useState(0.27);

  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);
  const [draftStart, setDraftStart] = useState<{ x: number; y: number } | null>(null);

  const selectedNodeId = useMemo(() => {
    if (!selection) {
      return null;
    }

    if (selection.kind === "panel") {
      return `panel-${selection.id}`;
    }

    return `bubble-${selection.id}`;
  }, [selection]);

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) {
      return;
    }

    if (!selectedNodeId) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
      return;
    }

    const node = stageRef.current.findOne(`#${selectedNodeId}`);
    if (!node) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
      return;
    }

    transformerRef.current.nodes([node]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedNodeId, activePage.id, activePage.panels, activePage.bubbles]);

  const captureStageDataUrl = (exportWidth: number, exportHeight: number) => {
    const stage = stageRef.current;
    if (!stage) {
      throw new Error("画布未初始化");
    }

    const prevWidth = stage.width();
    const prevHeight = stage.height();
    const prevScale = stage.scale();
    const prevNodes = transformerRef.current ? [...transformerRef.current.nodes()] : [];

    if (transformerRef.current) {
      transformerRef.current.nodes([]);
    }

    stage.width(exportWidth);
    stage.height(exportHeight);
    stage.scale({ x: 1, y: 1 });
    stage.batchDraw();

    const dataUrl = stage.toDataURL({
      mimeType: "image/png",
      pixelRatio: 2
    });

    stage.width(prevWidth);
    stage.height(prevHeight);
    stage.scale(prevScale);

    if (transformerRef.current) {
      transformerRef.current.nodes(prevNodes);
      transformerRef.current.getLayer()?.batchDraw();
    }

    stage.batchDraw();
    return dataUrl;
  };

  useImperativeHandle(
    ref,
    () => ({
      exportPng: async () => {
        try {
          const dataUrl = captureStageDataUrl(activePage.canvas.width, activePage.canvas.height);
          const filename = formatFilename(project.name, "png");
          triggerDownload(dataUrl, filename);
          setNotice("PNG 导出完成");
        } catch (error) {
          const message = error instanceof Error ? error.message : "PNG 导出失败";
          setNotice(message);
        }
      },

      exportPdf: async () => {
        if (project.pages.length === 0) {
          setNotice("没有可导出的页面");
          return;
        }

        const originalPageId = project.activePageId;

        try {
          const filename = formatFilename(project.name, "pdf");
          const { jsPDF } = await import("jspdf");

          let doc: InstanceType<typeof jsPDF> | null = null;

          for (let index = 0; index < project.pages.length; index += 1) {
            const page = project.pages[index];

            if (useEditorStore.getState().project.activePageId !== page.id) {
              setActivePage(page.id);
              await waitForStageRefresh();
            }

            const dataUrl = captureStageDataUrl(page.canvas.width, page.canvas.height);
            const orientation = getOrientation(page.canvas.width, page.canvas.height);

            if (!doc) {
              doc = new jsPDF({
                orientation,
                unit: "px",
                format: [page.canvas.width, page.canvas.height],
                compress: true
              });
            } else {
              doc.addPage([page.canvas.width, page.canvas.height], orientation);
            }

            doc.addImage(dataUrl, "PNG", 0, 0, page.canvas.width, page.canvas.height, undefined, "FAST");
          }

          doc?.save(filename);
          setNotice("PDF 导出完成（按页面顺序）");
        } catch (error) {
          const message = error instanceof Error ? error.message : "PDF 导出失败";
          setNotice(message);
        } finally {
          if (useEditorStore.getState().project.activePageId !== originalPageId) {
            setActivePage(originalPageId);
            await waitForStageRefresh();
          }
        }
      }
    }),
    [activePage.canvas.height, activePage.canvas.width, project.activePageId, project.name, project.pages, setActivePage, setNotice]
  );

  const toScene = (screen: { x: number; y: number }) => ({
    x: screen.x / zoom,
    y: screen.y / zoom
  });

  const beginManualPanel = (position: { x: number; y: number }) => {
    const scenePoint = toScene(position);
    setDraftStart(scenePoint);
    setDraftRect({ x: scenePoint.x, y: scenePoint.y, width: 0, height: 0 });
  };

  const handleMouseDown = (event: any) => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const target = event.target;
    const onPanel = Boolean(target?.findAncestor?.(".panel-node", true));
    const onBubble = Boolean(target?.findAncestor?.(".bubble-node", true));
    const onTransformer = Boolean(target?.findAncestor?.(".selection-transformer", true));
    if (onPanel || onBubble || onTransformer) {
      return;
    }

    if (manualPanelMode) {
      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return;
      }
      beginManualPanel(pointer);
      return;
    }

    clearSelection();
  };

  const handleMouseMove = () => {
    if (!manualPanelMode || !draftStart || !stageRef.current) {
      return;
    }

    const pointer = stageRef.current.getPointerPosition();
    if (!pointer) {
      return;
    }

    const scenePoint = toScene(pointer);
    setDraftRect({
      x: draftStart.x,
      y: draftStart.y,
      width: scenePoint.x - draftStart.x,
      height: scenePoint.y - draftStart.y
    });
  };

  const handleMouseUp = () => {
    if (!manualPanelMode || !draftRect) {
      setDraftStart(null);
      return;
    }

    createPanelFromRect(draftRect.x, draftRect.y, draftRect.width, draftRect.height);
    setDraftRect(null);
    setDraftStart(null);
  };

  return (
    <div className="studio-surface relative h-full w-full overflow-auto">
      <div className="sticky left-0 top-0 z-10 flex w-full flex-wrap items-center gap-3 border-b border-[var(--line-soft)] bg-[rgba(12,18,28,0.9)] px-4 py-2.5 backdrop-blur">
        <span className="studio-chip px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
          画布 {activePage.canvas.width} x {activePage.canvas.height}
        </span>
        <span
          className={`studio-chip px-2.5 py-1 text-[11px] ${
            manualPanelMode ? "border-cyan-300/60 text-cyan-100" : "text-[var(--text-secondary)]"
          }`}
        >
          手绘分镜 {manualPanelMode ? "ON" : "OFF"}
        </span>
        <span
          className={`studio-chip px-2.5 py-1 text-[11px] ${
            snapSizeTo16 ? "border-emerald-300/60 text-emerald-100" : "text-[var(--text-secondary)]"
          }`}
        >
          16 倍数吸附 {snapSizeTo16 ? "ON" : "OFF"}
        </span>
        <label className="ml-auto text-xs text-[var(--text-secondary)]">缩放 {Math.round(zoom * 100)}%</label>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.01}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="w-44 accent-[var(--accent)]"
        />
      </div>

      <div className="studio-workspace min-w-fit p-6 lg:p-8">
        <div
          className="relative overflow-hidden rounded-xl border border-slate-300/90 bg-slate-100 shadow-[0_28px_70px_rgba(2,6,23,0.4)]"
          style={{
            width: Math.ceil(activePage.canvas.width * zoom),
            height: Math.ceil(activePage.canvas.height * zoom)
          }}
        >
          <Stage
            ref={stageRef}
            width={Math.ceil(activePage.canvas.width * zoom)}
            height={Math.ceil(activePage.canvas.height * zoom)}
            scaleX={zoom}
            scaleY={zoom}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="bg-slate-200"
          >
            <Layer>
              <Rect name="canvas-bg" x={0} y={0} width={activePage.canvas.width} height={activePage.canvas.height} fill="#f8fafc" />

              {activePage.panels.map((panel) => {
                const selected = selection?.kind === "panel" && selection.id === panel.id;
                return (
                  <Group
                    key={panel.id}
                    id={`panel-${panel.id}`}
                    name="panel-node"
                    x={panel.x}
                    y={panel.y}
                    width={panel.width}
                    height={panel.height}
                    draggable
                    onClick={(event) => {
                      event.cancelBubble = true;
                      selectPanel(panel.id);
                    }}
                    onTap={(event) => {
                      event.cancelBubble = true;
                      selectPanel(panel.id);
                    }}
                    onDragEnd={(event) => {
                      const nextWidth = snapSizeTo16 ? snapSize(panel.width, 24) : panel.width;
                      const nextHeight = snapSizeTo16 ? snapSize(panel.height, 24) : panel.height;
                      updatePanel(panel.id, {
                        x: event.target.x(),
                        y: event.target.y(),
                        width: nextWidth,
                        height: nextHeight
                      });
                    }}
                    onTransformEnd={(event) => {
                      const node = event.target;
                      let nextWidth = Math.max(24, node.width() * node.scaleX());
                      let nextHeight = Math.max(24, node.height() * node.scaleY());
                      if (snapSizeTo16) {
                        nextWidth = snapSize(nextWidth, 24);
                        nextHeight = snapSize(nextHeight, 24);
                      }
                      node.scaleX(1);
                      node.scaleY(1);
                      updatePanel(panel.id, {
                        x: node.x(),
                        y: node.y(),
                        width: nextWidth,
                        height: nextHeight
                      });
                    }}
                  >
                    <Rect
                      width={panel.width}
                      height={panel.height}
                      fill="#ffffff"
                      cornerRadius={panel.borderRadius}
                    />
                    <PanelImageLayer panel={panel} />
                    <Rect
                      width={panel.width}
                      height={panel.height}
                      cornerRadius={panel.borderRadius}
                      stroke={selected ? "#2563eb" : panel.borderColor}
                      strokeWidth={selected ? panel.borderWidth + 1 : panel.borderWidth}
                      fillEnabled={false}
                      listening={false}
                    />
                  </Group>
                );
              })}

              {activePage.bubbles.map((bubble) => {
                const selected = selection?.kind === "bubble" && selection.id === bubble.id;
                return (
                  <Group
                    key={bubble.id}
                    id={`bubble-${bubble.id}`}
                    name="bubble-node"
                    x={bubble.x}
                    y={bubble.y}
                    width={bubble.width}
                    height={bubble.height}
                    draggable
                    onClick={(event) => {
                      event.cancelBubble = true;
                      selectBubble(bubble.id);
                    }}
                    onTap={(event) => {
                      event.cancelBubble = true;
                      selectBubble(bubble.id);
                    }}
                    onDragEnd={(event) => {
                      const nextWidth = snapSizeTo16 ? snapSize(bubble.width, 30) : bubble.width;
                      const nextHeight = snapSizeTo16 ? snapSize(bubble.height, 30) : bubble.height;
                      updateBubble(bubble.id, {
                        x: event.target.x(),
                        y: event.target.y(),
                        width: nextWidth,
                        height: nextHeight
                      });
                    }}
                    onTransformEnd={(event) => {
                      const node = event.target;
                      let nextWidth = Math.max(30, node.width() * node.scaleX());
                      let nextHeight = Math.max(30, node.height() * node.scaleY());
                      if (snapSizeTo16) {
                        nextWidth = snapSize(nextWidth, 30);
                        nextHeight = snapSize(nextHeight, 30);
                      }
                      node.scaleX(1);
                      node.scaleY(1);
                      updateBubble(bubble.id, {
                        x: node.x(),
                        y: node.y(),
                        width: nextWidth,
                        height: nextHeight
                      });
                    }}
                  >
                    <BubbleShape bubble={bubble} />
                    <BubbleText bubble={bubble} />
                    {selected && <Rect width={bubble.width} height={bubble.height} stroke="#2563eb" strokeWidth={2} dash={[8, 5]} />}
                  </Group>
                );
              })}

              {draftRect && manualPanelMode && (
                <Rect
                  x={draftRect.width >= 0 ? draftRect.x : draftRect.x + draftRect.width}
                  y={draftRect.height >= 0 ? draftRect.y : draftRect.y + draftRect.height}
                  width={Math.abs(draftRect.width)}
                  height={Math.abs(draftRect.height)}
                  fill="rgba(37, 99, 235, 0.2)"
                  stroke="#1d4ed8"
                  strokeWidth={2}
                  dash={[8, 6]}
                />
              )}

              <Transformer
                ref={transformerRef}
                name="selection-transformer"
                rotateEnabled={false}
                flipEnabled={false}
                borderStroke="#2563eb"
                anchorStroke="#2563eb"
                anchorFill="#bfdbfe"
                boundBoxFunc={(oldBox, newBox) => {
                  const minSize = selection?.kind === "bubble" ? 30 : 24;
                  if (newBox.width < minSize || newBox.height < minSize) {
                    return oldBox;
                  }

                  if (snapSizeTo16) {
                    return {
                      ...newBox,
                      width: snapSize(newBox.width, minSize),
                      height: snapSize(newBox.height, minSize)
                    };
                  }

                  return newBox;
                }}
              />
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
});

export default CanvasEditor;
