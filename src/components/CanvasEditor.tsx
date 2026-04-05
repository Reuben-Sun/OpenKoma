import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Ellipse, Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import useImage from "use-image";
import { Bubble, Panel } from "../types";
import { useEditorStore } from "../lib/store";

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

function PanelImageLayer({ panel }: { panel: Panel }) {
  const imageUrl = panel.image?.original ?? "";
  const [image] = useImage(imageUrl, "anonymous");

  if (!image || !panel.image) {
    return null;
  }

  const innerWidth = Math.max(1, panel.width - panel.gap * 2);
  const innerHeight = Math.max(1, panel.height - panel.gap * 2);

  const crop = panel.image.crop;
  const scale = crop?.scale ?? 1;
  const drawWidth = innerWidth * scale;
  const drawHeight = innerHeight * scale;
  const offsetX = panel.gap - (drawWidth - innerWidth) / 2;
  const offsetY = panel.gap - (drawHeight - innerHeight) / 2;

  return (
    <Group clipX={panel.gap} clipY={panel.gap} clipWidth={innerWidth} clipHeight={innerHeight}>
      <KonvaImage
        image={image}
        x={crop ? offsetX : panel.gap}
        y={crop ? offsetY : panel.gap}
        width={crop ? drawWidth : innerWidth}
        height={crop ? drawHeight : innerHeight}
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
  const selection = useEditorStore((state) => state.selection);
  const manualPanelMode = useEditorStore((state) => state.manualPanelMode);

  const setNotice = useEditorStore((state) => state.setNotice);
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
  }, [selectedNodeId, project.panels, project.bubbles]);

  const captureStageDataUrl = () => {
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

    stage.width(project.canvas.width);
    stage.height(project.canvas.height);
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
          const dataUrl = captureStageDataUrl();
          const filename = formatFilename(project.name, "png");
          triggerDownload(dataUrl, filename);
          setNotice("PNG 导出完成");
        } catch (error) {
          const message = error instanceof Error ? error.message : "PNG 导出失败";
          setNotice(message);
        }
      },

      exportPdf: async () => {
        try {
          const dataUrl = captureStageDataUrl();
          const filename = formatFilename(project.name, "pdf");
          const { jsPDF } = await import("jspdf");
          const orientation = project.canvas.width >= project.canvas.height ? "landscape" : "portrait";

          const doc = new jsPDF({
            orientation,
            unit: "px",
            format: [project.canvas.width, project.canvas.height],
            compress: true
          });

          doc.addImage(dataUrl, "PNG", 0, 0, project.canvas.width, project.canvas.height, undefined, "FAST");
          doc.save(filename);
          setNotice("PDF 导出完成");
        } catch (error) {
          const message = error instanceof Error ? error.message : "PDF 导出失败";
          setNotice(message);
        }
      }
    }),
    [project.canvas.height, project.canvas.width, project.name, setNotice]
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

    const targetName = event.target?.name?.();
    const isCanvasBackground = event.target === stage || targetName === "canvas-bg";

    if (!isCanvasBackground) {
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
    <div className="relative h-full w-full overflow-auto rounded-2xl border border-slate-700 bg-ink-900 shadow-panel">
      <div className="sticky left-0 top-0 z-10 flex w-full items-center gap-3 border-b border-slate-800 bg-ink-900/95 px-4 py-2 backdrop-blur">
        <label className="text-xs text-slate-400">缩放 {Math.round(zoom * 100)}%</label>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.01}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="w-44"
        />
      </div>

      <div className="min-w-fit p-6">
        <div
          className="relative"
          style={{
            width: Math.ceil(project.canvas.width * zoom),
            height: Math.ceil(project.canvas.height * zoom)
          }}
        >
          <Stage
            ref={stageRef}
            width={Math.ceil(project.canvas.width * zoom)}
            height={Math.ceil(project.canvas.height * zoom)}
            scaleX={zoom}
            scaleY={zoom}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="bg-slate-200"
          >
            <Layer>
              <Rect
                name="canvas-bg"
                x={0}
                y={0}
                width={project.canvas.width}
                height={project.canvas.height}
                fill="#f8fafc"
              />

              {project.panels.map((panel) => {
                const selected = selection?.kind === "panel" && selection.id === panel.id;
                return (
                  <Group
                    key={panel.id}
                    id={`panel-${panel.id}`}
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
                      updatePanel(panel.id, {
                        x: event.target.x(),
                        y: event.target.y()
                      });
                    }}
                    onTransformEnd={(event) => {
                      const node = event.target;
                      const nextWidth = Math.max(24, node.width() * node.scaleX());
                      const nextHeight = Math.max(24, node.height() * node.scaleY());
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
                      stroke={selected ? "#2563eb" : panel.borderColor}
                      strokeWidth={selected ? panel.borderWidth + 1 : panel.borderWidth}
                    />
                    <PanelImageLayer panel={panel} />
                  </Group>
                );
              })}

              {project.bubbles.map((bubble) => {
                const selected = selection?.kind === "bubble" && selection.id === bubble.id;
                return (
                  <Group
                    key={bubble.id}
                    id={`bubble-${bubble.id}`}
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
                      updateBubble(bubble.id, {
                        x: event.target.x(),
                        y: event.target.y()
                      });
                    }}
                    onTransformEnd={(event) => {
                      const node = event.target;
                      const nextWidth = Math.max(30, node.width() * node.scaleX());
                      const nextHeight = Math.max(30, node.height() * node.scaleY());
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
                    {selected && (
                      <Rect
                        width={bubble.width}
                        height={bubble.height}
                        stroke="#2563eb"
                        strokeWidth={2}
                        dash={[8, 5]}
                      />
                    )}
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
                rotateEnabled={false}
                borderStroke="#2563eb"
                anchorStroke="#2563eb"
                anchorFill="#bfdbfe"
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < 24 || newBox.height < 24) {
                    return oldBox;
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
