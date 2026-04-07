import { CropConfig } from "../types";
import { Point } from "./panelGeometry";

export type CropDraft = Omit<CropConfig, "scale">;
export type ResizeEdge = "left" | "right" | "top" | "bottom";

export function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function createCenteredCropWithRatio(naturalWidth: number, naturalHeight: number, ratio: number): CropDraft {
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

export function getCropCenter(crop: CropDraft): Point {
  return {
    x: crop.x + crop.width / 2,
    y: crop.y + crop.height / 2
  };
}

export function createCropFromCenter(centerX: number, centerY: number, width: number, height: number): CropDraft {
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  };
}

export function shrinkCropAroundCenter(crop: CropDraft, zoom: number): CropDraft {
  const safeZoom = clampNumber(zoom, 0.1, 4);
  const width = crop.width / safeZoom;
  const height = crop.height / safeZoom;
  const center = getCropCenter(crop);
  return createCropFromCenter(center.x, center.y, width, height);
}

export function expandCropAroundCenter(crop: CropDraft, zoom: number): CropDraft {
  const safeZoom = clampNumber(zoom, 0.1, 4);
  const width = crop.width * safeZoom;
  const height = crop.height * safeZoom;
  const center = getCropCenter(crop);
  return createCropFromCenter(center.x, center.y, width, height);
}

export function createCenteredVisibleCropWithRatio(
  naturalWidth: number,
  naturalHeight: number,
  ratio: number,
  zoom: number
): CropDraft {
  return shrinkCropAroundCenter(createCenteredCropWithRatio(naturalWidth, naturalHeight, ratio), zoom);
}

export function createStoredCropDraft(
  crop: CropConfig | undefined,
  naturalWidth: number,
  naturalHeight: number
): CropDraft {
  if (crop) {
    return {
      x: crop.x,
      y: crop.y,
      width: crop.width,
      height: crop.height
    };
  }

  return {
    x: 0,
    y: 0,
    width: naturalWidth,
    height: naturalHeight
  };
}

export function getVisibleCropFromStoredCrop(
  crop: CropDraft,
  frameWidth: number,
  frameHeight: number,
  zoom: number
): CropDraft {
  const safeFrameWidth = Math.max(1, frameWidth);
  const safeFrameHeight = Math.max(1, frameHeight);
  const safeCropWidth = Math.max(1, crop.width);
  const safeCropHeight = Math.max(1, crop.height);
  const safeZoom = clampNumber(zoom, 1, 4);
  const coverScale = Math.max(safeFrameWidth / safeCropWidth, safeFrameHeight / safeCropHeight);
  const drawScale = coverScale * safeZoom;
  const width = Math.min(safeCropWidth, safeFrameWidth / drawScale);
  const height = Math.min(safeCropHeight, safeFrameHeight / drawScale);
  const center = getCropCenter(crop);
  return createCropFromCenter(center.x, center.y, width, height);
}

export function normalizeVisibleCropToRatio(
  crop: CropDraft,
  naturalWidth: number,
  naturalHeight: number,
  ratio: number,
  zoom: number
): CropDraft {
  const safeRatio = Math.max(0.001, ratio);
  const safeZoom = clampNumber(zoom, 1, 4);
  const center = getCropCenter(crop);
  let width = Math.max(1, crop.width);
  let height = Math.max(1, crop.height);

  if (width / height >= safeRatio) {
    height = width / safeRatio;
  } else {
    width = height * safeRatio;
  }

  const maxVisible = createCenteredVisibleCropWithRatio(naturalWidth, naturalHeight, safeRatio, safeZoom);
  const fitScale = Math.min(1, maxVisible.width / width, maxVisible.height / height);
  width = Math.max(1, width * fitScale);
  height = Math.max(1, height * fitScale);

  const clampedCenterX = clampNumber(center.x, (width * safeZoom) / 2, naturalWidth - (width * safeZoom) / 2);
  const clampedCenterY = clampNumber(center.y, (height * safeZoom) / 2, naturalHeight - (height * safeZoom) / 2);
  return createCropFromCenter(clampedCenterX, clampedCenterY, width, height);
}

export function moveVisibleCropWithinBounds(
  crop: CropDraft,
  deltaX: number,
  deltaY: number,
  naturalWidth: number,
  naturalHeight: number,
  ratio: number,
  zoom: number
): CropDraft {
  return normalizeVisibleCropToRatio(
    {
      x: crop.x + deltaX,
      y: crop.y + deltaY,
      width: crop.width,
      height: crop.height
    },
    naturalWidth,
    naturalHeight,
    ratio,
    zoom
  );
}

export function resizeVisibleCropFromEdgeWithRatio(
  initial: CropDraft,
  edge: ResizeEdge,
  point: Point,
  naturalWidth: number,
  naturalHeight: number,
  ratio: number,
  zoom: number
): CropDraft {
  const safeRatio = Math.max(0.001, ratio);
  const safeZoom = clampNumber(zoom, 1, 4);
  const safeWidth = Math.max(1, naturalWidth);
  const safeHeight = Math.max(1, naturalHeight);
  const maxVisible = createCenteredVisibleCropWithRatio(safeWidth, safeHeight, safeRatio, safeZoom);

  if (edge === "left" || edge === "right") {
    const anchorX = edge === "left" ? initial.x + initial.width : initial.x;
    const centerY = initial.y + initial.height / 2;
    const maxHeightByVertical = (Math.min(centerY, safeHeight - centerY) * 2) / safeZoom;
    const maxWidthByVertical = maxHeightByVertical * safeRatio;
    const maxWidthByNearHorizontal = (2 * (edge === "left" ? anchorX : safeWidth - anchorX)) / (safeZoom + 1);
    const maxWidthByFarHorizontal =
      safeZoom > 1
        ? (2 * (edge === "left" ? safeWidth - anchorX : anchorX)) / (safeZoom - 1)
        : Number.POSITIVE_INFINITY;
    const maxWidth = Math.max(1, Math.min(maxVisible.width, maxWidthByVertical, maxWidthByNearHorizontal, maxWidthByFarHorizontal));

    let width = edge === "left" ? anchorX - point.x : point.x - anchorX;
    width = clampNumber(width, 1, maxWidth);
    const height = width / safeRatio;
    return normalizeVisibleCropToRatio(
      {
        x: edge === "left" ? anchorX - width : anchorX,
        y: centerY - height / 2,
        width,
        height
      },
      safeWidth,
      safeHeight,
      safeRatio,
      safeZoom
    );
  }

  const anchorY = edge === "top" ? initial.y + initial.height : initial.y;
  const centerX = initial.x + initial.width / 2;
  const maxWidthByHorizontal = (Math.min(centerX, safeWidth - centerX) * 2) / safeZoom;
  const maxHeightByHorizontal = maxWidthByHorizontal / safeRatio;
  const maxHeightByNearVertical = (2 * (edge === "top" ? anchorY : safeHeight - anchorY)) / (safeZoom + 1);
  const maxHeightByFarVertical =
    safeZoom > 1
      ? (2 * (edge === "top" ? safeHeight - anchorY : anchorY)) / (safeZoom - 1)
      : Number.POSITIVE_INFINITY;
  const maxHeight = Math.max(1, Math.min(maxVisible.height, maxHeightByHorizontal, maxHeightByNearVertical, maxHeightByFarVertical));

  let height = edge === "top" ? anchorY - point.y : point.y - anchorY;
  height = clampNumber(height, 1, maxHeight);
  const width = height * safeRatio;
  return normalizeVisibleCropToRatio(
    {
      x: centerX - width / 2,
      y: edge === "top" ? anchorY - height : anchorY,
      width,
      height
    },
    safeWidth,
    safeHeight,
    safeRatio,
    safeZoom
  );
}
