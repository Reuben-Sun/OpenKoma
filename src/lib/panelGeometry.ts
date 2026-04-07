import { Panel, PanelShape } from "../types";

export type Point = {
  x: number;
  y: number;
};
export type PanelShapeKey = keyof PanelShape;
export type PanelEdgeKey = "top" | "right" | "bottom" | "left";

const MIN_PANEL_SIZE = 24;
const MIN_PANEL_EDGE_WIDTH = MIN_PANEL_SIZE;
export const PANEL_SHAPE_MIN_RATIO = -1;
export const PANEL_SHAPE_MAX_RATIO = 2;
export const PANEL_SHAPE_HANDLE_KEYS: PanelShapeKey[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
export const PANEL_EDGE_HANDLE_KEYS: PanelEdgeKey[] = ["top", "right", "bottom", "left"];

export const RECT_PANEL_SHAPE: PanelShape = {
  topLeft: 0,
  topRight: 1,
  bottomRight: 1,
  bottomLeft: 0
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeEdge(start: number, end: number, minSpan: number): [number, number] {
  const safeMinSpan = clamp(minSpan, 0.01, PANEL_SHAPE_MAX_RATIO - PANEL_SHAPE_MIN_RATIO);
  const maxStart = PANEL_SHAPE_MAX_RATIO - safeMinSpan;
  let nextStart = clamp(start, PANEL_SHAPE_MIN_RATIO, PANEL_SHAPE_MAX_RATIO);
  let nextEnd = clamp(end, PANEL_SHAPE_MIN_RATIO, PANEL_SHAPE_MAX_RATIO);

  if (nextEnd - nextStart >= safeMinSpan) {
    return [nextStart, nextEnd];
  }

  const center = (nextStart + nextEnd) / 2;
  nextStart = clamp(center - safeMinSpan / 2, PANEL_SHAPE_MIN_RATIO, maxStart);
  nextEnd = clamp(nextStart + safeMinSpan, PANEL_SHAPE_MIN_RATIO + safeMinSpan, PANEL_SHAPE_MAX_RATIO);
  nextStart = clamp(nextEnd - safeMinSpan, PANEL_SHAPE_MIN_RATIO, maxStart);
  return [nextStart, nextEnd];
}

export function normalizePanelShape(shape?: Partial<PanelShape> | null, width = 240): PanelShape {
  const minSpan = Math.min(0.96, MIN_PANEL_EDGE_WIDTH / Math.max(24, width));
  const [topLeft, topRight] = normalizeEdge(shape?.topLeft ?? RECT_PANEL_SHAPE.topLeft, shape?.topRight ?? RECT_PANEL_SHAPE.topRight, minSpan);
  const [bottomLeft, bottomRight] = normalizeEdge(
    shape?.bottomLeft ?? RECT_PANEL_SHAPE.bottomLeft,
    shape?.bottomRight ?? RECT_PANEL_SHAPE.bottomRight,
    minSpan
  );

  return {
    topLeft,
    topRight,
    bottomRight,
    bottomLeft
  };
}

export function normalizePanelRotation(rotation?: number): number {
  const raw = Number(rotation ?? 0);
  if (!Number.isFinite(raw)) {
    return 0;
  }

  let normalized = raw % 360;
  if (normalized > 180) {
    normalized -= 360;
  } else if (normalized < -180) {
    normalized += 360;
  }

  const rounded = Math.round(normalized * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function getPanelCenter(panel: Pick<Panel, "x" | "y" | "width" | "height">): Point {
  return {
    x: panel.x + panel.width / 2,
    y: panel.y + panel.height / 2
  };
}

export function getPanelRenderTransform(panel: Pick<Panel, "x" | "y" | "width" | "height" | "rotation">) {
  const center = getPanelCenter(panel);
  return {
    x: center.x,
    y: center.y,
    offsetX: panel.width / 2,
    offsetY: panel.height / 2,
    rotation: normalizePanelRotation(panel.rotation)
  };
}

export function getPanelCanvasPoint(
  panel: Pick<Panel, "x" | "y" | "width" | "height" | "rotation">,
  localPoint: Point
): Point {
  return rotatePointAround(
    {
      x: panel.x + localPoint.x,
      y: panel.y + localPoint.y
    },
    getPanelCenter(panel),
    panel.rotation
  );
}

export function rotatePointAround(point: Point, center: Point, rotation?: number): Point {
  const radians = (normalizePanelRotation(rotation) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const deltaX = point.x - center.x;
  const deltaY = point.y - center.y;

  return {
    x: center.x + deltaX * cos - deltaY * sin,
    y: center.y + deltaX * sin + deltaY * cos
  };
}

export function getPanelLocalPoints(panel: Pick<Panel, "width" | "height" | "shape">): Point[] {
  const shape = normalizePanelShape(panel.shape, panel.width);
  return [
    { x: panel.width * shape.topLeft, y: 0 },
    { x: panel.width * shape.topRight, y: 0 },
    { x: panel.width * shape.bottomRight, y: panel.height },
    { x: panel.width * shape.bottomLeft, y: panel.height }
  ];
}

export function getPanelShapeHandlePoint(
  panel: Pick<Panel, "width" | "height" | "shape">,
  key: PanelShapeKey
): Point {
  const shape = normalizePanelShape(panel.shape, panel.width);
  return {
    x: shape[key] * panel.width,
    y: key.startsWith("top") ? 0 : panel.height
  };
}

export function getPanelShapeGuideLines(panel: Pick<Panel, "width" | "height" | "shape">) {
  const [topLeft, topRight, bottomRight, bottomLeft] = getPanelLocalPoints(panel);
  return {
    top: [topLeft.x, topLeft.y, topRight.x, topRight.y],
    bottom: [bottomLeft.x, bottomLeft.y, bottomRight.x, bottomRight.y]
  };
}

export function getPanelEdgeHandlePoint(
  panel: Pick<Panel, "width" | "height" | "shape">,
  key: PanelEdgeKey
): Point {
  const [topLeft, topRight, bottomRight, bottomLeft] = getPanelLocalPoints(panel);

  if (key === "top") {
    return {
      x: (topLeft.x + topRight.x) / 2,
      y: (topLeft.y + topRight.y) / 2
    };
  }

  if (key === "right") {
    return {
      x: (topRight.x + bottomRight.x) / 2,
      y: (topRight.y + bottomRight.y) / 2
    };
  }

  if (key === "bottom") {
    return {
      x: (bottomLeft.x + bottomRight.x) / 2,
      y: (bottomLeft.y + bottomRight.y) / 2
    };
  }

  return {
    x: (topLeft.x + bottomLeft.x) / 2,
    y: (topLeft.y + bottomLeft.y) / 2
  };
}

export function clampPanelShapeHandleX(
  shape: PanelShape,
  key: PanelShapeKey,
  width: number,
  nextX: number
): number {
  const minSpan = width * Math.min(0.96, MIN_PANEL_EDGE_WIDTH / Math.max(24, width));
  const minX = width * PANEL_SHAPE_MIN_RATIO;
  const maxX = width * PANEL_SHAPE_MAX_RATIO;

  if (key === "topLeft") {
    return Math.min(Math.max(minX, nextX), width * shape.topRight - minSpan);
  }
  if (key === "topRight") {
    return Math.max(width * shape.topLeft + minSpan, Math.min(maxX, nextX));
  }
  if (key === "bottomLeft") {
    return Math.min(Math.max(minX, nextX), width * shape.bottomRight - minSpan);
  }

  return Math.max(width * shape.bottomLeft + minSpan, Math.min(maxX, nextX));
}

export function updatePanelShapeHandle(shape: PanelShape, key: PanelShapeKey, width: number, x: number): PanelShape {
  const clampedX = clampPanelShapeHandleX(shape, key, width, x);
  return normalizePanelShape(
    {
      ...shape,
      [key]: clampedX / Math.max(1, width)
    },
    width
  );
}

function getPanelEdgeTranslationBounds(pointA: number, pointB: number, width: number) {
  const minX = width * PANEL_SHAPE_MIN_RATIO;
  const maxX = width * PANEL_SHAPE_MAX_RATIO;
  return {
    minShift: minX - Math.min(pointA, pointB),
    maxShift: maxX - Math.max(pointA, pointB)
  };
}

function shiftPanelVerticalEdge(shape: PanelShape, key: "left" | "right", width: number, nextCenterX: number): PanelShape {
  if (key === "left") {
    const currentTop = shape.topLeft * width;
    const currentBottom = shape.bottomLeft * width;
    const currentCenter = (currentTop + currentBottom) / 2;
    const bounds = getPanelEdgeTranslationBounds(currentTop, currentBottom, width);
    const shift = clamp(nextCenterX - currentCenter, bounds.minShift, bounds.maxShift);
    return normalizePanelShape(
      {
        ...shape,
        topLeft: (currentTop + shift) / Math.max(1, width),
        bottomLeft: (currentBottom + shift) / Math.max(1, width)
      },
      width
    );
  }

  const currentTop = shape.topRight * width;
  const currentBottom = shape.bottomRight * width;
  const currentCenter = (currentTop + currentBottom) / 2;
  const bounds = getPanelEdgeTranslationBounds(currentTop, currentBottom, width);
  const shift = clamp(nextCenterX - currentCenter, bounds.minShift, bounds.maxShift);
  return normalizePanelShape(
    {
      ...shape,
      topRight: (currentTop + shift) / Math.max(1, width),
      bottomRight: (currentBottom + shift) / Math.max(1, width)
    },
    width
  );
}

function resizePanelHorizontalEdge(
  panel: Pick<Panel, "x" | "y" | "width" | "height" | "rotation" | "shape">,
  key: "top" | "bottom",
  nextY: number
) {
  const currentHeight = Math.max(MIN_PANEL_SIZE, panel.height);
  const nextHeight =
    key === "top"
      ? Math.max(MIN_PANEL_SIZE, currentHeight - nextY)
      : Math.max(MIN_PANEL_SIZE, nextY);
  const centerOffsetY = key === "top" ? (currentHeight - nextHeight) / 2 : (nextHeight - currentHeight) / 2;
  const rotatedOffset = rotatePointAround({ x: 0, y: centerOffsetY }, { x: 0, y: 0 }, panel.rotation);
  const currentCenter = getPanelCenter(panel);
  const nextCenter = {
    x: currentCenter.x + rotatedOffset.x,
    y: currentCenter.y + rotatedOffset.y
  };

  return {
    x: nextCenter.x - panel.width / 2,
    y: nextCenter.y - nextHeight / 2,
    width: panel.width,
    height: nextHeight,
    shape: normalizePanelShape(panel.shape, panel.width)
  };
}

export function updatePanelEdgeHandle(
  panel: Pick<Panel, "x" | "y" | "width" | "height" | "rotation" | "shape">,
  key: PanelEdgeKey,
  point: Point
) {
  const shape = normalizePanelShape(panel.shape, panel.width);
  if (key === "top" || key === "bottom") {
    return resizePanelHorizontalEdge(panel, key, point.y);
  }

  return {
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: panel.height,
    shape: shiftPanelVerticalEdge(shape, key, panel.width, point.x)
  };
}

export function getInsetPanelLocalPoints(
  panel: Pick<Panel, "width" | "height" | "shape">,
  inset = 0
): Point[] {
  const points = getPanelLocalPoints(panel);
  if (inset <= 0) {
    return points;
  }
  return insetConvexPolygon(points, inset);
}

export function getPanelImageClipPoints(panel: Pick<Panel, "width" | "height" | "shape" | "gap">): Point[] {
  return getInsetPanelLocalPoints(panel, panel.gap);
}

export function drawPolygonPath(
  context: Pick<CanvasRenderingContext2D, "moveTo" | "lineTo">,
  points: Point[]
) {
  if (points.length === 0) {
    return;
  }

  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.lineTo(points[0].x, points[0].y);
}

export function drawRoundedPolygonPath(
  context: Pick<CanvasRenderingContext2D, "moveTo" | "lineTo" | "quadraticCurveTo">,
  points: Point[],
  radius: number
) {
  if (points.length === 0) {
    return;
  }

  if (points.length < 3 || radius <= 0) {
    drawPolygonPath(context, points);
    return;
  }

  const safeRadius = Math.max(0, radius);
  const corners = points.map((current, index) => {
    const prev = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const prevVectorX = prev.x - current.x;
    const prevVectorY = prev.y - current.y;
    const nextVectorX = next.x - current.x;
    const nextVectorY = next.y - current.y;
    const prevLength = Math.hypot(prevVectorX, prevVectorY);
    const nextLength = Math.hypot(nextVectorX, nextVectorY);

    if (prevLength < 0.000001 || nextLength < 0.000001) {
      return {
        current,
        start: current,
        end: current
      };
    }

    const prevUnit = {
      x: prevVectorX / prevLength,
      y: prevVectorY / prevLength
    };
    const nextUnit = {
      x: nextVectorX / nextLength,
      y: nextVectorY / nextLength
    };
    const dot = clamp(prevUnit.x * nextUnit.x + prevUnit.y * nextUnit.y, -1, 1);
    const angle = Math.acos(dot);

    if (angle < 0.000001 || Math.abs(Math.PI - angle) < 0.000001) {
      return {
        current,
        start: current,
        end: current
      };
    }

    const distance = Math.min(safeRadius / Math.tan(angle / 2), prevLength / 2, nextLength / 2);
    return {
      current,
      start: {
        x: current.x + prevUnit.x * distance,
        y: current.y + prevUnit.y * distance
      },
      end: {
        x: current.x + nextUnit.x * distance,
        y: current.y + nextUnit.y * distance
      }
    };
  });

  const lastCorner = corners[corners.length - 1];
  context.moveTo(lastCorner.end.x, lastCorner.end.y);

  corners.forEach((corner) => {
    context.lineTo(corner.start.x, corner.start.y);
    context.quadraticCurveTo(corner.current.x, corner.current.y, corner.end.x, corner.end.y);
  });
}

export function getPolygonBounds(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

export function getPanelImageClipBounds(panel: Pick<Panel, "width" | "height" | "shape" | "gap">) {
  return getPolygonBounds(getPanelImageClipPoints(panel));
}

function getCentroid(points: Point[]): Point {
  const total = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / Math.max(1, points.length),
    y: total.y / Math.max(1, points.length)
  };
}

function intersectLines(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const denominator = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(denominator) < 0.000001) {
    return null;
  }

  const crossA = a1.x * a2.y - a1.y * a2.x;
  const crossB = b1.x * b2.y - b1.y * b2.x;
  return {
    x: (crossA * (b1.x - b2.x) - (a1.x - a2.x) * crossB) / denominator,
    y: (crossA * (b1.y - b2.y) - (a1.y - a2.y) * crossB) / denominator
  };
}

function insetPointTowardCentroid(point: Point, centroid: Point, inset: number): Point {
  const deltaX = centroid.x - point.x;
  const deltaY = centroid.y - point.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < 0.000001) {
    return point;
  }

  const ratio = Math.min(1, inset / distance);
  return {
    x: point.x + deltaX * ratio,
    y: point.y + deltaY * ratio
  };
}

export function insetConvexPolygon(points: Point[], inset: number): Point[] {
  if (points.length < 3 || inset <= 0) {
    return points.map((point) => ({ ...point }));
  }

  const centroid = getCentroid(points);
  const output: Point[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const prevStart = points[(index - 1 + points.length) % points.length];
    const prevEnd = points[index];
    const nextStart = points[index];
    const nextEnd = points[(index + 1) % points.length];

    const prevVectorX = prevEnd.x - prevStart.x;
    const prevVectorY = prevEnd.y - prevStart.y;
    const prevLength = Math.hypot(prevVectorX, prevVectorY);
    const nextVectorX = nextEnd.x - nextStart.x;
    const nextVectorY = nextEnd.y - nextStart.y;
    const nextLength = Math.hypot(nextVectorX, nextVectorY);

    if (prevLength < 0.000001 || nextLength < 0.000001) {
      output.push(insetPointTowardCentroid(points[index], centroid, inset));
      continue;
    }

    const prevNormal = {
      x: (-prevVectorY / prevLength) * inset,
      y: (prevVectorX / prevLength) * inset
    };
    const nextNormal = {
      x: (-nextVectorY / nextLength) * inset,
      y: (nextVectorX / nextLength) * inset
    };

    const prevLineStart = {
      x: prevStart.x + prevNormal.x,
      y: prevStart.y + prevNormal.y
    };
    const prevLineEnd = {
      x: prevEnd.x + prevNormal.x,
      y: prevEnd.y + prevNormal.y
    };
    const nextLineStart = {
      x: nextStart.x + nextNormal.x,
      y: nextStart.y + nextNormal.y
    };
    const nextLineEnd = {
      x: nextEnd.x + nextNormal.x,
      y: nextEnd.y + nextNormal.y
    };

    output.push(intersectLines(prevLineStart, prevLineEnd, nextLineStart, nextLineEnd) ?? insetPointTowardCentroid(points[index], centroid, inset));
  }

  return output;
}
