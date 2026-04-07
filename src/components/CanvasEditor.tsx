import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Circle, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Shape, Stage, Text, Transformer } from "react-konva";
import useImage from "use-image";
import { Bubble, Panel, PanelShape } from "../types";
import {
  PANEL_EDGE_HANDLE_KEYS,
  PANEL_SHAPE_HANDLE_KEYS,
  PanelEdgeKey,
  PanelShapeKey,
  Point,
  getPanelEdgeHandlePoint,
  getPanelRenderTransform,
  getPanelShapeGuideLines,
  getPanelShapeHandlePoint,
  normalizePanelRotation,
  normalizePanelShape,
  updatePanelEdgeHandle,
  updatePanelShapeHandle
} from "../lib/panelGeometry";
import { drawPanelPath, getPanelImageLayout } from "../lib/panelRender";
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

const ROTATION_SNAP_ANGLES = Array.from({ length: 72 }, (_value, index) => index * 5);

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

function clampZoom(value: number) {
  return Math.min(1, Math.max(0.1, value));
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

const SKEW_HANDLE_RADIUS = 10;
const SKEW_HANDLE_HIT_STROKE_WIDTH = 24;
const EDGE_HANDLE_SIZE = 14;
const EDGE_HANDLE_HIT_STROKE_WIDTH = 24;
const SKEW_HANDLE_COLOR = "#2563eb";
const SKEW_GUIDE_COLOR = "rgba(37, 99, 235, 0.35)";

function PanelFillShape({ panel }: { panel: Panel }) {
  return (
    <Shape
      sceneFunc={(context, shape) => {
        context.beginPath();
        drawPanelPath(context, panel);
        context.closePath();
        context.fillStrokeShape(shape);
      }}
      fill="#ffffff"
    />
  );
}

function PanelBorderShape({
  panel,
  selected
}: {
  panel: Panel;
  selected: boolean;
}) {
  return (
    <Shape
      sceneFunc={(context, shape) => {
        context.beginPath();
        drawPanelPath(context, panel);
        context.closePath();
        context.fillStrokeShape(shape);
      }}
      fillEnabled={false}
      stroke={selected ? SKEW_HANDLE_COLOR : panel.borderColor}
      strokeWidth={selected ? panel.borderWidth + 1 : panel.borderWidth}
      listening={false}
    />
  );
}

function PanelImageLayer({ panel }: { panel: Panel }) {
  const imageUrl = panel.image?.original ?? "";
  const [image] = useImage(imageUrl, "anonymous");

  if (!image || !panel.image) {
    return null;
  }

  const imageLayout = getPanelImageLayout(panel, {
    width: image.width,
    height: image.height
  });
  if (!imageLayout) {
    return null;
  }

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
        x={imageLayout.offsetX}
        y={imageLayout.offsetY}
        width={imageLayout.drawWidth}
        height={imageLayout.drawHeight}
        crop={imageLayout.cropRect}
        listening={false}
      />
    </Group>
  );
}

function PanelSkewHandles({
  panel,
  onDraftChange,
  onCommit
}: {
  panel: Panel;
  onDraftChange: (shape: PanelShape) => void;
  onCommit: (shape: PanelShape) => void;
}) {
  const shape = normalizePanelShape(panel.shape, panel.width);
  const transform = getPanelRenderTransform(panel);
  const guideLines = getPanelShapeGuideLines(panel);

  const getLocalPointer = (node: Konva.Node): Point | null => {
    const parent = node.getParent();
    const stage = node.getStage();
    const pointer = stage?.getPointerPosition();
    if (!parent || !pointer) {
      return null;
    }
    return parent.getAbsoluteTransform().copy().invert().point(pointer);
  };

  const createBoundFunc =
    (key: PanelShapeKey) =>
    function dragBoundFunc(this: Konva.Node, position: Konva.Vector2d) {
      const parent = this.getParent();
      if (!parent) {
        return position;
      }

      const inverse = parent.getAbsoluteTransform().copy().invert();
      const localPoint = inverse.point(position);
      const nextShape = updatePanelShapeHandle(shape, key, panel.width, localPoint.x);
      const nextLocalPoint = getPanelShapeHandlePoint({ width: panel.width, height: panel.height, shape: nextShape }, key);

      return parent.getAbsoluteTransform().point(nextLocalPoint);
    };

  const createEdgeBoundFunc =
    (key: PanelEdgeKey) =>
    function dragBoundFunc(this: Konva.Node, position: Konva.Vector2d) {
      const parent = this.getParent();
      if (!parent) {
        return position;
      }

      const inverse = parent.getAbsoluteTransform().copy().invert();
      const localPoint = inverse.point(position);
      const nextShape = updatePanelEdgeHandle(shape, key, panel.width, panel.height, localPoint);
      const nextLocalPoint = getPanelEdgeHandlePoint({ width: panel.width, height: panel.height, shape: nextShape }, key);

      return parent.getAbsoluteTransform().point(nextLocalPoint);
    };

  return (
    <Group
      name="panel-skew-overlay"
      x={transform.x}
      y={transform.y}
      offsetX={transform.offsetX}
      offsetY={transform.offsetY}
      rotation={transform.rotation}
    >
      <Line points={guideLines.top} stroke={SKEW_GUIDE_COLOR} strokeWidth={2} dash={[8, 5]} listening={false} />
      <Line points={guideLines.bottom} stroke={SKEW_GUIDE_COLOR} strokeWidth={2} dash={[8, 5]} listening={false} />

      {PANEL_EDGE_HANDLE_KEYS.map((key) => {
        const handlePoint = getPanelEdgeHandlePoint(panel, key);

        return (
          <Rect
            key={key}
            name="panel-skew-handle panel-edge-handle"
            x={handlePoint.x - EDGE_HANDLE_SIZE / 2}
            y={handlePoint.y - EDGE_HANDLE_SIZE / 2}
            width={EDGE_HANDLE_SIZE}
            height={EDGE_HANDLE_SIZE}
            cornerRadius={3}
            hitStrokeWidth={EDGE_HANDLE_HIT_STROKE_WIDTH}
            fill="#eff6ff"
            stroke={SKEW_HANDLE_COLOR}
            strokeWidth={2}
            draggable
            dragBoundFunc={createEdgeBoundFunc(key)}
            onMouseDown={(event) => {
              event.cancelBubble = true;
            }}
            onTouchStart={(event) => {
              event.cancelBubble = true;
            }}
            onDragMove={(event) => {
              event.cancelBubble = true;
              const localPointer = getLocalPointer(event.target);
              if (!localPointer) {
                return;
              }
              onDraftChange(updatePanelEdgeHandle(shape, key, panel.width, panel.height, localPointer));
            }}
            onDragEnd={(event) => {
              event.cancelBubble = true;
              const localPointer = getLocalPointer(event.target);
              if (!localPointer) {
                return;
              }
              onCommit(updatePanelEdgeHandle(shape, key, panel.width, panel.height, localPointer));
            }}
          />
        );
      })}

      {PANEL_SHAPE_HANDLE_KEYS.map((key) => {
        const handlePoint = getPanelShapeHandlePoint(panel, key);

        return (
          <Circle
            key={key}
            name="panel-skew-handle"
            x={handlePoint.x}
            y={handlePoint.y}
            radius={SKEW_HANDLE_RADIUS}
            hitStrokeWidth={SKEW_HANDLE_HIT_STROKE_WIDTH}
            fill="#dbeafe"
            stroke={SKEW_HANDLE_COLOR}
            strokeWidth={2}
            draggable
            dragBoundFunc={createBoundFunc(key)}
            onMouseDown={(event) => {
              event.cancelBubble = true;
            }}
            onTouchStart={(event) => {
              event.cancelBubble = true;
            }}
            onDragMove={(event) => {
              event.cancelBubble = true;
              onDraftChange(updatePanelShapeHandle(shape, key, panel.width, event.target.x()));
            }}
            onDragEnd={(event) => {
              event.cancelBubble = true;
              onCommit(updatePanelShapeHandle(shape, key, panel.width, event.target.x()));
            }}
          />
        );
      })}
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
  const [skewDraft, setSkewDraft] = useState<{ panelId: string; shape: PanelShape } | null>(null);

  const selectedNodeId = useMemo(() => {
    if (!selection) {
      return null;
    }

    if (selection.kind === "panel") {
      return `panel-${selection.id}`;
    }

    return `bubble-${selection.id}`;
  }, [selection]);

  const selectedPanel = useMemo(() => {
    if (!selection || selection.kind !== "panel") {
      return undefined;
    }

    return activePage.panels.find((panel) => panel.id === selection.id);
  }, [activePage.panels, selection]);

  const liveSnapEnabled =
    snapSizeTo16 &&
    (selection?.kind !== "panel" || !selectedPanel || Math.abs(normalizePanelRotation(selectedPanel.rotation)) < 0.001);

  useEffect(() => {
    if (!selection || selection.kind !== "panel") {
      setSkewDraft(null);
      return;
    }

    setSkewDraft((current) => (current?.panelId === selection.id ? current : null));
  }, [selection, activePage.id]);

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
    const onSkewHandle = Boolean(target?.findAncestor?.(".panel-skew-handle", true) || target?.findAncestor?.(".panel-skew-overlay", true));
    if (onPanel || onBubble || onTransformer || onSkewHandle) {
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

  const adjustZoom = (delta: number) => {
    setZoom((current) => clampZoom(current + delta));
  };

  return (
    <div className="studio-surface flex h-full w-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--panel-border)] px-3 py-2">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="studio-btn h-7 w-7 px-0 text-sm leading-none"
            onClick={() => adjustZoom(-0.05)}
            title="缩小"
            aria-label="缩小"
          >
            -
          </button>
          <label className="text-[11px] text-[var(--text-secondary)]">缩放 {Math.round(zoom * 100)}%</label>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(clampZoom(Number(event.target.value)))}
            className="w-28 accent-[var(--accent)]"
          />
          <button
            type="button"
            className="studio-btn h-7 w-7 px-0 text-sm leading-none"
            onClick={() => adjustZoom(0.05)}
            title="放大"
            aria-label="放大"
          >
            +
          </button>
        </div>
      </div>

      <div className="min-h-0 overflow-auto">
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
                const displayPanel = skewDraft?.panelId === panel.id ? { ...panel, shape: skewDraft.shape } : panel;
                const transform = getPanelRenderTransform(displayPanel);

                return (
                  <Fragment key={panel.id}>
                    <Group
                      id={`panel-${panel.id}`}
                      name="panel-node"
                      x={transform.x}
                      y={transform.y}
                      width={displayPanel.width}
                      height={displayPanel.height}
                      offsetX={transform.offsetX}
                      offsetY={transform.offsetY}
                      rotation={transform.rotation}
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
                          x: event.target.x() - nextWidth / 2,
                          y: event.target.y() - nextHeight / 2,
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
                          x: node.x() - nextWidth / 2,
                          y: node.y() - nextHeight / 2,
                          width: nextWidth,
                          height: nextHeight,
                          rotation: normalizePanelRotation(node.rotation())
                        });
                      }}
                    >
                      <PanelFillShape panel={displayPanel} />
                      <PanelImageLayer panel={displayPanel} />
                      <PanelBorderShape panel={displayPanel} selected={selected} />
                    </Group>

                    {selected ? (
                      <PanelSkewHandles
                        panel={displayPanel}
                        onDraftChange={(shape) => {
                          setSkewDraft({
                            panelId: panel.id,
                            shape
                          });
                        }}
                        onCommit={(shape) => {
                          setSkewDraft(null);
                          updatePanel(panel.id, {
                            shape
                          });
                        }}
                      />
                    ) : null}
                  </Fragment>
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
                rotateEnabled={selection?.kind === "panel"}
                flipEnabled={false}
                borderStroke="#2563eb"
                anchorStroke="#2563eb"
                anchorFill="#bfdbfe"
                rotateAnchorOffset={28}
                rotationSnaps={selection?.kind === "panel" ? ROTATION_SNAP_ANGLES : undefined}
                rotationSnapTolerance={2}
                boundBoxFunc={(oldBox, newBox) => {
                  const minSize = selection?.kind === "bubble" ? 30 : 24;
                  if (newBox.width < minSize || newBox.height < minSize) {
                    return oldBox;
                  }

                  if (liveSnapEnabled) {
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
    </div>
  );
});

export default CanvasEditor;
