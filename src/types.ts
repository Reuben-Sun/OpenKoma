export type CanvasPreset = "A4" | "A3" | "custom";

export type CanvasConfig = {
  width: number;
  height: number;
  preset?: CanvasPreset;
  dpi?: number;
};

export type CropConfig = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export type PanelImage = {
  original: string;
  crop?: CropConfig;
  naturalWidth?: number;
  naturalHeight?: number;
};

export type PanelShape = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

export type Panel = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  shape: PanelShape;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  gap: number;
  image?: PanelImage;
  prompt?: string;
  negativePrompt?: string;
  parentId?: string;
};

export type BubbleType = "rect" | "rounded" | "circle";

export type BubbleDirection = "horizontal" | "vertical";

export type Bubble = {
  id: string;
  type: BubbleType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  direction: BubbleDirection;
  fontSize: number;
  fontFamily: string;
  background: string;
  borderColor: string;
};

export type ProjectPage = {
  id: string;
  name: string;
  canvas: CanvasConfig;
  panels: Panel[];
  bubbles: Bubble[];
};

export type Project = {
  id: string;
  name: string;
  pages: ProjectPage[];
  activePageId: string;
};

export type AiServiceConfig = {
  baseUrl: string;
  authorization: string;
};

export type Selection =
  | {
      kind: "panel";
      id: string;
    }
  | {
      kind: "bubble";
      id: string;
    };

export type GeneratePayload = {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
};
