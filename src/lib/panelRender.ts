import { CropConfig, Panel } from "../types";
import { drawRoundedPolygonPath, getInsetPanelLocalPoints, getPolygonBounds } from "./panelGeometry";

export type PathDrawingContext = Pick<CanvasRenderingContext2D, "moveTo" | "lineTo" | "quadraticCurveTo">;

type ImageSize = {
  width: number;
  height: number;
};

type CropRect = Pick<CropConfig, "x" | "y" | "width" | "height">;

export function drawPanelPath(
  context: PathDrawingContext,
  panel: Pick<Panel, "width" | "height" | "shape" | "borderRadius">,
  inset = 0
) {
  const points = getInsetPanelLocalPoints(panel, inset);
  drawRoundedPolygonPath(context, points, Math.max(0, panel.borderRadius - inset));
}

export function getPanelImageLayout(panel: Panel, imageSize: ImageSize) {
  if (!panel.image) {
    return null;
  }

  const clipPoints = getInsetPanelLocalPoints(panel, panel.gap);
  const clipBounds = getPolygonBounds(clipPoints);
  const innerWidth = clipBounds.width;
  const innerHeight = clipBounds.height;

  const crop = panel.image.crop;
  const sourceWidth = crop?.width ?? panel.image.naturalWidth ?? imageSize.width;
  const sourceHeight = crop?.height ?? panel.image.naturalHeight ?? imageSize.height;
  const coverScale = Math.max(innerWidth / Math.max(1, sourceWidth), innerHeight / Math.max(1, sourceHeight));
  const drawScale = coverScale * (crop?.scale ?? 1);
  const cropRect: CropRect | undefined = crop
    ? {
        x: crop.x,
        y: crop.y,
        width: crop.width,
        height: crop.height
      }
    : undefined;

  return {
    offsetX: clipBounds.minX + (innerWidth - sourceWidth * drawScale) / 2,
    offsetY: clipBounds.minY + (innerHeight - sourceHeight * drawScale) / 2,
    drawWidth: sourceWidth * drawScale,
    drawHeight: sourceHeight * drawScale,
    cropRect
  };
}
