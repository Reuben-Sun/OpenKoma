import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { applyPatch, compare, type Operation } from "fast-json-patch";
import { uploadLocalImage } from "./api";
import {
  clamp,
  createBubble as createBubbleFactory,
  createCanvasFromPreset,
  createEmptyProject,
  createPanel,
  createProjectPage,
  splitGridPanels
} from "./project";
import { getPanelCenter, getPanelImageClipBounds, normalizePanelRotation, normalizePanelShape, rotatePointAround } from "./panelGeometry";
import { Bubble, BubbleType, CanvasPreset, CropConfig, Panel, PanelShape, Project, ProjectPage, Selection } from "../types";

type HistoryEntry = {
  forward: Operation[];
  backward: Operation[];
  message: string;
};

export type NoticeEntry = {
  id: string;
  text: string;
  time: string;
  timestamp: number;
};

export type ThemeMode = "dark" | "light";

type EditorStore = {
  project: Project;
  projectDirectoryHandle?: FileSystemDirectoryHandle;
  projectDirectoryName?: string;
  assetRefMap: Record<string, string>;
  transientObjectUrls: string[];
  themeMode: ThemeMode;
  selection?: Selection;
  manualPanelMode: boolean;
  snapSizeTo16: boolean;
  historyPast: HistoryEntry[];
  historyFuture: HistoryEntry[];
  noticeHistory: NoticeEntry[];
  busy: {
    uploadingPanelId?: string;
    loadingProject: boolean;
    savingProject: boolean;
  };
  notice?: string;

  setNotice: (notice?: string) => void;
  setThemeMode: (mode: ThemeMode) => void;

  undo: () => void;
  redo: () => void;

  setProjectName: (name: string) => void;
  setCanvasPreset: (preset: CanvasPreset) => void;
  setCanvasSize: (width: number, height: number) => void;
  setAllPanelsStyle: (style: { borderRadius?: number; borderWidth?: number }) => void;

  setActivePage: (id: string) => void;
  addPage: () => void;
  deletePage: (id: string) => void;
  movePage: (id: string, direction: "up" | "down") => void;

  splitGrid: (rows: number, cols: number) => void;
  splitSelectedPanel: (rows: number, cols: number) => void;
  createPanelFromRect: (x: number, y: number, width: number, height: number) => void;

  selectPanel: (id: string) => void;
  selectBubble: (id: string) => void;
  clearSelection: () => void;
  deleteSelection: () => void;

  updatePanel: (id: string, patch: Partial<Panel>) => void;
  updateBubble: (id: string, patch: Partial<Bubble>) => void;

  addBubble: (type: BubbleType) => void;

  toggleManualPanelMode: (enabled?: boolean) => void;
  toggleSnapSizeTo16: (enabled?: boolean) => void;

  setPanelCrop: (id: string, crop: CropConfig) => void;
  resetPanelCrop: (id: string) => void;
  uploadLocalImageForPanel: (id: string, file: File) => Promise<void>;

  saveProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;
  loadProject: () => Promise<void>;
};

type LegacyProject = {
  id?: string;
  name?: string;
  canvas?: ProjectPage["canvas"];
  panels?: Panel[];
  bubbles?: Bubble[];
  pages?: ProjectPage[];
  activePageId?: string;
};

type StoredHistoryPayload = {
  past?: unknown;
  future?: unknown;
};

type StoredProjectDocument = {
  format?: string;
  version?: number;
  savedAt?: string;
  layout?: LegacyProject;
  history?: StoredHistoryPayload;
  memories?: unknown;
  project?: LegacyProject;
  historyPast?: unknown;
  historyFuture?: unknown;
  noticeHistory?: unknown;
};

type StoredHistoryLogDocument = {
  format?: string;
  version?: number;
  savedAt?: string;
  history?: StoredHistoryPayload;
  memories?: unknown;
  historyPast?: unknown;
  historyFuture?: unknown;
  noticeHistory?: unknown;
};

type NormalizedLoadedState = {
  project: Project;
  historyPast: HistoryEntry[];
  historyFuture: HistoryEntry[];
  noticeHistory: NoticeEntry[];
  source: "legacy" | "v2";
};

type PersistedProjectDocumentV2 = {
  format: "openkoma-project";
  version: number;
  savedAt: string;
  layout: Project;
  history: {
    past: HistoryEntry[];
    future: HistoryEntry[];
  };
  memories: NoticeEntry[];
};

type PersistedProjectLayoutDocument = {
  format: "openkoma-project";
  version: number;
  savedAt: string;
  layout: Project;
};

type PersistedHistoryLogDocument = {
  format: "openkoma-history-log";
  version: number;
  savedAt: string;
  history: {
    past: HistoryEntry[];
    future: HistoryEntry[];
  };
  memories: NoticeEntry[];
};

const HISTORY_LIMIT = 80;
const NOTICE_HISTORY_LIMIT = 300;
const PROJECT_FILE_FORMAT = "openkoma-project";
const PROJECT_FILE_VERSION = 5;
const HISTORY_LOG_FORMAT = "openkoma-history-log";
const HISTORY_LOG_VERSION = 1;
const PROJECT_JSON_FILENAME = "project.json";
const HISTORY_LOG_FILENAME = "history.log";
const PROJECT_JSON_EXPORT_SUFFIX = ".openkoma.json";
const THEME_STORAGE_KEY = "openkoma-theme-mode";

type ProjectDirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

function cloneProject(project: Project): Project {
  return structuredClone(project);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function hasDirectoryPicker(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const picker = (window as ProjectDirectoryPickerWindow).showDirectoryPicker;
  return typeof picker === "function";
}

function normalizeThemeMode(value: unknown): ThemeMode | undefined {
  if (value === "dark" || value === "light") {
    return value;
  }
  return undefined;
}

function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    const stored = normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
    if (stored) {
      return stored;
    }
  } catch {
    // ignored
  }

  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
}

function persistThemeMode(mode: ThemeMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // ignored
  }
}

async function pickProjectDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!hasDirectoryPicker()) {
    return null;
  }

  const picker = (window as ProjectDirectoryPickerWindow).showDirectoryPicker;
  if (!picker) {
    return null;
  }

  try {
    return await picker.call(window);
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }
    throw error;
  }
}

function sanitizeDownloadFilename(value: string): string {
  const sanitized = sanitizeFilenameSegment(value);
  return sanitized || "openkoma-project";
}

function createProjectDownloadFilename(projectName: string): string {
  return `${sanitizeDownloadFilename(projectName)}${PROJECT_JSON_EXPORT_SUFFIX}`;
}

function triggerJsonDownload(filename: string, payload: unknown): void {
  if (typeof document === "undefined") {
    throw new Error("当前环境不支持下载项目文件");
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 0);
}

function pickProjectJsonFile(): Promise<File | null> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    document.body.appendChild(input);

    const cleanup = () => {
      input.removeEventListener("change", handleChange);
      window.removeEventListener("focus", handleWindowFocus);
      input.remove();
    };

    const handleChange = () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    };

    const handleWindowFocus = () => {
      window.setTimeout(() => {
        if (input.files?.length) {
          return;
        }
        cleanup();
        resolve(null);
      }, 240);
    };

    input.addEventListener("change", handleChange, { once: true });
    window.addEventListener("focus", handleWindowFocus, { once: true });
    input.click();
  });
}

async function readJsonFromDirectory(directory: FileSystemDirectoryHandle, fileName: string): Promise<unknown> {
  const fileHandle = await directory.getFileHandle(fileName, { create: false });
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text) as unknown;
}

async function tryReadJsonFromDirectory(directory: FileSystemDirectoryHandle, fileName: string): Promise<unknown | null> {
  try {
    return await readJsonFromDirectory(directory, fileName);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return null;
    }
    throw error;
  }
}

async function writeJsonToDirectory(directory: FileSystemDirectoryHandle, fileName: string, payload: unknown): Promise<void> {
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}

function sanitizePathSegments(relativePath: string): string[] | null {
  const cleaned = relativePath.replace(/\\/g, "/").trim();
  if (!cleaned) {
    return null;
  }
  const segments = cleaned.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.length === 0 || segments.some((segment) => segment === "..")) {
    return null;
  }
  return segments;
}

async function getDirectoryBySegments(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
}

async function readBlobFromDirectoryByPath(
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<Blob | null> {
  const segments = sanitizePathSegments(relativePath);
  if (!segments || segments.length === 0) {
    return null;
  }

  const fileName = segments[segments.length - 1];
  const directories = segments.slice(0, -1);

  try {
    const folder = directories.length > 0 ? await getDirectoryBySegments(root, directories, false) : root;
    const fileHandle = await folder.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();
    return file;
  } catch {
    return null;
  }
}

async function writeBlobToDirectoryByPath(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  blob: Blob
): Promise<void> {
  const segments = sanitizePathSegments(relativePath);
  if (!segments || segments.length === 0) {
    throw new Error("图片路径无效");
  }

  const fileName = segments[segments.length - 1];
  const directories = segments.slice(0, -1);
  const folder = directories.length > 0 ? await getDirectoryBySegments(root, directories, true) : root;
  const fileHandle = await folder.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function normalizeProjectAssetRef(ref: string | undefined): string | null {
  const raw = ref?.trim();
  if (!raw) {
    return null;
  }

  const withoutLeading = raw.replace(/^\.?\//, "");
  if (!withoutLeading.startsWith("images/") && !withoutLeading.startsWith("assets/")) {
    return null;
  }
  const segments = sanitizePathSegments(withoutLeading);
  if (!segments) {
    return null;
  }
  return segments.join("/");
}

function sanitizeFilenameSegment(value: string): string {
  const compact = safeDecodeURIComponent(value).replace(/[^\w.-]+/g, "_");
  return compact.replace(/^_+|_+$/g, "");
}

function splitFilename(value: string): { stem: string; ext: string } {
  const idx = value.lastIndexOf(".");
  if (idx <= 0 || idx === value.length - 1) {
    return { stem: value, ext: "" };
  }
  return {
    stem: value.slice(0, idx),
    ext: value.slice(idx).toLowerCase()
  };
}

function extensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg"
  };
  return map[mimeType.toLowerCase()] ?? ".png";
}

function inferFilenameFromRef(ref: string, blobType: string): string {
  let candidate = "";
  try {
    const url = new URL(ref, "http://localhost");
    const segment = url.pathname.split("/").filter(Boolean).pop() ?? "";
    candidate = segment;
  } catch {
    candidate = "";
  }

  const sanitized = sanitizeFilenameSegment(candidate || "image");
  const split = splitFilename(sanitized);
  const safeStem = split.stem || "image";
  const safeExt = split.ext || extensionFromMimeType(blobType);
  return `${safeStem}${safeExt}`;
}

function ensureUniqueAssetRef(
  preferred: string | undefined,
  ref: string,
  blobType: string,
  used: Set<string>
): string {
  const normalizedPreferred = normalizeProjectAssetRef(preferred);
  if (normalizedPreferred && !used.has(normalizedPreferred)) {
    used.add(normalizedPreferred);
    return normalizedPreferred;
  }

  const rawName = inferFilenameFromRef(ref, blobType);
  const split = splitFilename(rawName);
  const stem = split.stem || "image";
  const ext = split.ext || ".png";

  let index = 0;
  while (true) {
    const suffix = index === 0 ? "" : `_${index}`;
    const next = `images/${stem}${suffix}${ext}`;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
    index += 1;
  }
}

function collectImageOriginalRefs(value: unknown, output: Set<string>, key?: string): void {
  if (typeof value === "string") {
    if (key === "original") {
      const normalized = value.trim();
      if (normalized) {
        output.add(normalized);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectImageOriginalRefs(entry, output);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [entryKey, entryValue] of Object.entries(value)) {
    collectImageOriginalRefs(entryValue, output, entryKey);
  }
}

function mapImageOriginalRefs<T>(value: T, replacement: Map<string, string>, key?: string): T {
  if (typeof value === "string") {
    if (key === "original" && replacement.has(value)) {
      return replacement.get(value) as T;
    }
    return value as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => mapImageOriginalRefs(entry, replacement)) as T;
  }

  if (!isRecord(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    next[entryKey] = mapImageOriginalRefs(entryValue, replacement, entryKey);
  }
  return next as T;
}

async function resolveImageBlobForSave(
  ref: string,
  sourceDirectory: FileSystemDirectoryHandle | undefined
): Promise<Blob | null> {
  const normalizedAssetRef = normalizeProjectAssetRef(ref);
  if (normalizedAssetRef && sourceDirectory) {
    const localBlob = await readBlobFromDirectoryByPath(sourceDirectory, normalizedAssetRef);
    if (localBlob) {
      return localBlob;
    }
  }

  if (!(ref.startsWith("blob:") || ref.startsWith("data:"))) {
    return null;
  }

  try {
    const response = await fetch(ref);
    if (!response.ok) {
      return null;
    }
    return await response.blob();
  } catch {
    return null;
  }
}

function revokeObjectUrls(urls: string[]): void {
  for (const url of urls) {
    if (!url.startsWith("blob:")) {
      continue;
    }
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignored
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeHistoryMessage(message: string | undefined): string {
  const trimmed = message?.trim();
  if (!trimmed) {
    return "已修改项目";
  }
  return trimmed;
}

function createHistoryEntry(previous: Project, next: Project, message?: string): HistoryEntry | null {
  const forward = compare(previous, next);
  if (forward.length === 0) {
    return null;
  }
  const backward = compare(next, previous);
  return {
    forward,
    backward,
    message: normalizeHistoryMessage(message)
  };
}

function applyHistory(project: Project, operations: Operation[]): Project {
  const nextProject = applyPatch(cloneProject(project), operations, false, true).newDocument as Project;
  return normalizeLoadedProject(nextProject);
}

function normalizeNoticeText(notice: string | undefined): string | undefined {
  const trimmed = notice?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

function formatNoticeTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(
    date.getSeconds()
  ).padStart(2, "0")}`;
}

function createNoticeEntry(text: string, timestamp = Date.now()): NoticeEntry {
  const safeTimestamp = Number.isFinite(timestamp) && timestamp > 0 ? Math.round(timestamp) : Date.now();
  return {
    id: `${safeTimestamp}-${Math.random().toString(36).slice(2, 10)}`,
    text,
    time: formatNoticeTime(safeTimestamp),
    timestamp: safeTimestamp
  };
}

function appendNoticeToHistory(noticeHistory: NoticeEntry[], notice: string | undefined): NoticeEntry[] {
  const normalized = normalizeNoticeText(notice);
  if (!normalized) {
    return noticeHistory;
  }
  return [createNoticeEntry(normalized), ...noticeHistory].slice(0, NOTICE_HISTORY_LIMIT);
}

function withNotice(state: Pick<EditorStore, "noticeHistory">, notice: string | undefined) {
  const normalized = normalizeNoticeText(notice);
  return {
    notice: normalized,
    noticeHistory: appendNoticeToHistory(state.noticeHistory, normalized)
  };
}

function sanitizeOperation(operation: unknown): Operation | null {
  if (!isRecord(operation)) {
    return null;
  }
  if (typeof operation.op !== "string" || typeof operation.path !== "string") {
    return null;
  }
  const normalized: Record<string, unknown> = {
    op: operation.op,
    path: operation.path
  };
  if ("value" in operation) {
    normalized.value = operation.value;
  }
  if (typeof operation.from === "string") {
    normalized.from = operation.from;
  }
  return normalized as unknown as Operation;
}

function sanitizeHistoryEntries(entries: unknown): HistoryEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const output: HistoryEntry[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }

    const forward = Array.isArray(entry.forward)
      ? entry.forward.map((operation) => sanitizeOperation(operation)).filter((operation): operation is Operation => Boolean(operation))
      : [];
    const backward = Array.isArray(entry.backward)
      ? entry.backward.map((operation) => sanitizeOperation(operation)).filter((operation): operation is Operation => Boolean(operation))
      : [];
    if (forward.length === 0 || backward.length === 0) {
      continue;
    }

    output.push({
      forward,
      backward,
      message: normalizeHistoryMessage(typeof entry.message === "string" ? entry.message : undefined)
    });
  }

  return output;
}

function sanitizeNoticeHistory(input: unknown): NoticeEntry[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const output: NoticeEntry[] = [];
  for (const entry of input) {
    if (!isRecord(entry)) {
      continue;
    }

    const text = normalizeNoticeText(
      typeof entry.text === "string" ? entry.text : typeof entry.message === "string" ? entry.message : undefined
    );
    if (!text) {
      continue;
    }

    const rawTimestamp =
      typeof entry.timestamp === "number"
        ? entry.timestamp
        : typeof entry.createdAt === "number"
          ? entry.createdAt
          : typeof entry.at === "string"
            ? Date.parse(entry.at)
            : Number.NaN;

    const timestamp = Number.isFinite(rawTimestamp) && rawTimestamp > 0 ? Math.round(rawTimestamp) : Date.now();
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id : `${timestamp}-${output.length}`;
    const time = typeof entry.time === "string" && entry.time.trim() ? entry.time : formatNoticeTime(timestamp);

    output.push({
      id,
      text,
      time,
      timestamp
    });
  }

  return output.slice(0, NOTICE_HISTORY_LIMIT);
}

function normalizeLoadedState(raw: unknown): NormalizedLoadedState | null {
  if (!isRecord(raw)) {
    return null;
  }

  const stored = raw as StoredProjectDocument;
  const hasV2Envelope =
    stored.format === PROJECT_FILE_FORMAT ||
    "layout" in stored ||
    "history" in stored ||
    "memories" in stored ||
    "historyPast" in stored ||
    "historyFuture" in stored;

  if (!hasV2Envelope) {
    return {
      project: normalizeLoadedProject(stored as LegacyProject),
      historyPast: [],
      historyFuture: [],
      noticeHistory: [],
      source: "legacy"
    };
  }

  const layoutCandidate = (isRecord(stored.layout) ? stored.layout : isRecord(stored.project) ? stored.project : stored) as LegacyProject;
  const historyContainer = isRecord(stored.history) ? stored.history : undefined;
  const historyPast = sanitizeHistoryEntries(historyContainer?.past ?? stored.historyPast).slice(-HISTORY_LIMIT);
  const historyFuture = sanitizeHistoryEntries(historyContainer?.future ?? stored.historyFuture).slice(0, HISTORY_LIMIT);
  const memories = sanitizeNoticeHistory(stored.memories ?? stored.noticeHistory);

  return {
    project: normalizeLoadedProject(layoutCandidate),
    historyPast,
    historyFuture,
    noticeHistory: memories,
    source: "v2"
  };
}

function mergeProjectAndHistoryDocuments(layoutRaw: unknown, historyRaw: unknown | null): unknown {
  if (!isRecord(layoutRaw) || !isRecord(historyRaw)) {
    return layoutRaw;
  }

  const historyLog = historyRaw as StoredHistoryLogDocument;
  const merged: StoredProjectDocument = {
    ...(layoutRaw as StoredProjectDocument)
  };

  const hasHistoryPayload = "history" in historyLog || "historyPast" in historyLog || "historyFuture" in historyLog;
  if (hasHistoryPayload) {
    const historyContainer = isRecord(historyLog.history) ? historyLog.history : undefined;
    if (historyContainer) {
      merged.history = historyContainer;
    } else {
      delete merged.history;
    }
    merged.historyPast = historyLog.historyPast;
    merged.historyFuture = historyLog.historyFuture;
  }

  const hasNoticePayload = "memories" in historyLog || "noticeHistory" in historyLog;
  if (hasNoticePayload) {
    merged.memories = historyLog.memories ?? historyLog.noticeHistory;
  }

  return merged;
}

function createPersistedProjectDocument(state: Pick<EditorStore, "project" | "historyPast" | "historyFuture" | "noticeHistory">): PersistedProjectDocumentV2 {
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    layout: cloneProject(state.project),
    history: {
      past: structuredClone(state.historyPast),
      future: structuredClone(state.historyFuture)
    },
    memories: structuredClone(state.noticeHistory)
  };
}

function createPersistedProjectLayoutDocument(document: PersistedProjectDocumentV2): PersistedProjectLayoutDocument {
  return {
    format: document.format,
    version: document.version,
    savedAt: document.savedAt,
    layout: document.layout
  };
}

function createPersistedHistoryLogDocument(document: PersistedProjectDocumentV2): PersistedHistoryLogDocument {
  return {
    format: HISTORY_LOG_FORMAT,
    version: HISTORY_LOG_VERSION,
    savedAt: document.savedAt,
    history: document.history,
    memories: document.memories
  };
}

type MaterializedSaveResult = {
  document: PersistedProjectDocumentV2;
  runtimeAssetRefMap: Record<string, string>;
  unresolvedRefs: string[];
};

type MaterializedFileExportResult = {
  document: PersistedProjectDocumentV2;
  unresolvedRefs: string[];
};

async function materializeProjectAssetsForSave(
  baseDocument: PersistedProjectDocumentV2,
  destinationDirectory: FileSystemDirectoryHandle,
  sourceDirectory: FileSystemDirectoryHandle | undefined,
  existingMap: Record<string, string>
): Promise<MaterializedSaveResult> {
  const refs = new Set<string>();
  collectImageOriginalRefs(baseDocument.layout, refs);
  collectImageOriginalRefs(baseDocument.history, refs);

  const usedAssetRefs = new Set<string>();
  const replacement = new Map<string, string>();
  const runtimeAssetRefMap: Record<string, string> = {};
  const unresolvedRefs: string[] = [];

  for (const ref of refs) {
    const blob = await resolveImageBlobForSave(ref, sourceDirectory);
    if (!blob) {
      unresolvedRefs.push(ref);
      continue;
    }

    const preferred = existingMap[ref] ?? normalizeProjectAssetRef(ref) ?? undefined;
    const assetRef = ensureUniqueAssetRef(preferred, ref, blob.type, usedAssetRefs);
    await writeBlobToDirectoryByPath(destinationDirectory, assetRef, blob);
    replacement.set(ref, assetRef);
    runtimeAssetRefMap[ref] = assetRef;
  }

  return {
    document: {
      ...baseDocument,
      layout: mapImageOriginalRefs(baseDocument.layout, replacement),
      history: mapImageOriginalRefs(baseDocument.history, replacement)
    },
    runtimeAssetRefMap,
    unresolvedRefs
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result) {
        resolve(reader.result);
        return;
      }
      reject(new Error("无法导出图片数据"));
    };
    reader.onerror = () => reject(new Error("读取图片数据失败"));
    reader.readAsDataURL(blob);
  });
}

async function materializeProjectAssetsForFileExport(
  baseDocument: PersistedProjectDocumentV2,
  sourceDirectory: FileSystemDirectoryHandle | undefined
): Promise<MaterializedFileExportResult> {
  const refs = new Set<string>();
  collectImageOriginalRefs(baseDocument.layout, refs);
  collectImageOriginalRefs(baseDocument.history, refs);

  const replacement = new Map<string, string>();
  const unresolvedRefs: string[] = [];

  for (const ref of refs) {
    const blob = await resolveImageBlobForSave(ref, sourceDirectory);
    if (!blob) {
      unresolvedRefs.push(ref);
      continue;
    }

    replacement.set(ref, await blobToDataUrl(blob));
  }

  return {
    document: {
      ...baseDocument,
      layout: mapImageOriginalRefs(baseDocument.layout, replacement),
      history: mapImageOriginalRefs(baseDocument.history, replacement)
    },
    unresolvedRefs
  };
}

function appendTransientObjectUrl(urls: string[], url: string): string[] {
  if (!url.startsWith("blob:") || urls.includes(url)) {
    return urls;
  }
  return [...urls, url];
}


type MaterializedLoadResult = {
  project: Project;
  historyPast: HistoryEntry[];
  historyFuture: HistoryEntry[];
  runtimeAssetRefMap: Record<string, string>;
  objectUrls: string[];
  missingAssetRefs: string[];
};

async function materializeProjectAssetsForLoad(
  loaded: Pick<NormalizedLoadedState, "project" | "historyPast" | "historyFuture">,
  directory: FileSystemDirectoryHandle
): Promise<MaterializedLoadResult> {
  const refs = new Set<string>();
  collectImageOriginalRefs(loaded.project, refs);
  collectImageOriginalRefs(loaded.historyPast, refs);
  collectImageOriginalRefs(loaded.historyFuture, refs);

  const replacement = new Map<string, string>();
  const runtimeAssetRefMap: Record<string, string> = {};
  const objectUrls: string[] = [];
  const missingAssetRefs: string[] = [];

  for (const ref of refs) {
    const normalizedRef = normalizeProjectAssetRef(ref);
    if (!normalizedRef) {
      continue;
    }

    const blob = await readBlobFromDirectoryByPath(directory, normalizedRef);
    if (!blob) {
      missingAssetRefs.push(normalizedRef);
      continue;
    }

    const objectUrl = URL.createObjectURL(blob);
    replacement.set(ref, objectUrl);
    runtimeAssetRefMap[objectUrl] = normalizedRef;
    objectUrls.push(objectUrl);
  }

  return {
    project: mapImageOriginalRefs(loaded.project, replacement),
    historyPast: mapImageOriginalRefs(loaded.historyPast, replacement),
    historyFuture: mapImageOriginalRefs(loaded.historyFuture, replacement),
    runtimeAssetRefMap,
    objectUrls,
    missingAssetRefs
  };
}

type ReboundRuntimeAssetResult = {
  project: Project;
  historyPast: HistoryEntry[];
  historyFuture: HistoryEntry[];
  runtimeAssetRefMap: Record<string, string>;
  objectUrls: string[];
  missingAssetRefs: string[];
};

async function rebindRuntimeAssetRefsFromDirectory(
  runtime: Pick<EditorStore, "project" | "historyPast" | "historyFuture">,
  directory: FileSystemDirectoryHandle,
  runtimeToAssetRefMap: Record<string, string>
): Promise<ReboundRuntimeAssetResult> {
  const replacement = new Map<string, string>();
  const runtimeAssetRefMap: Record<string, string> = {};
  const objectUrls: string[] = [];
  const missingAssetRefs: string[] = [];

  for (const [runtimeRef, rawAssetRef] of Object.entries(runtimeToAssetRefMap)) {
    const normalizedAssetRef = normalizeProjectAssetRef(rawAssetRef) ?? sanitizePathSegments(rawAssetRef)?.join("/");
    if (!normalizedAssetRef) {
      missingAssetRefs.push(rawAssetRef);
      continue;
    }

    const blob = await readBlobFromDirectoryByPath(directory, normalizedAssetRef);
    if (!blob) {
      missingAssetRefs.push(normalizedAssetRef);
      continue;
    }

    const objectUrl = URL.createObjectURL(blob);
    replacement.set(runtimeRef, objectUrl);
    runtimeAssetRefMap[objectUrl] = normalizedAssetRef;
    objectUrls.push(objectUrl);
  }

  return {
    project: mapImageOriginalRefs(runtime.project, replacement),
    historyPast: mapImageOriginalRefs(runtime.historyPast, replacement),
    historyFuture: mapImageOriginalRefs(runtime.historyFuture, replacement),
    runtimeAssetRefMap,
    objectUrls,
    missingAssetRefs
  };
}

function withHistory(
  state: Pick<EditorStore, "project" | "historyPast" | "noticeHistory">,
  nextProject: Project,
  message?: string
) {
  const entry = createHistoryEntry(state.project, nextProject, message);
  if (!entry) {
    return null;
  }

  const nextPast = [...state.historyPast, entry];
  if (nextPast.length > HISTORY_LIMIT) {
    nextPast.shift();
  }

  return {
    project: nextProject,
    historyPast: nextPast,
    historyFuture: [] as HistoryEntry[],
    ...withNotice(state, entry.message)
  };
}

function describePanelPatch(patch: Partial<Panel>): string {
  if ("shape" in patch && !("x" in patch || "y" in patch || "width" in patch || "height" in patch || "rotation" in patch)) {
    return "已调整分镜斜切";
  }

  if ("rotation" in patch && !("x" in patch || "y" in patch || "width" in patch || "height" in patch)) {
    return "已调整分镜倾斜角度";
  }

  if ("x" in patch || "y" in patch || "width" in patch || "height" in patch || "rotation" in patch || "shape" in patch) {
    return "已调整分镜位置、尺寸或倾斜";
  }

  if ("borderWidth" in patch || "borderRadius" in patch || "borderColor" in patch || "gap" in patch) {
    return "已修改分镜样式";
  }

  if ("image" in patch) {
    return "已更新分镜图像";
  }

  return "已更新分镜";
}

function describeBubblePatch(patch: Partial<Bubble>): string {
  if ("text" in patch) {
    return "已编辑气泡文本";
  }

  if ("x" in patch || "y" in patch || "width" in patch || "height" in patch) {
    return "已调整气泡位置或尺寸";
  }

  if (
    "type" in patch ||
    "direction" in patch ||
    "fontSize" in patch ||
    "fontFamily" in patch ||
    "background" in patch ||
    "borderColor" in patch
  ) {
    return "已修改气泡样式";
  }

  return "已更新气泡";
}

function bubbleTypeLabel(type: BubbleType): string {
  if (type === "rect") {
    return "矩形";
  }
  if (type === "rounded") {
    return "圆角";
  }
  return "圆形";
}

function isLocalImageRef(ref: string | undefined): ref is string {
  const normalized = ref?.trim();
  if (!normalized) {
    return false;
  }

  return normalized.startsWith("blob:") || normalized.startsWith("data:") || normalizeProjectAssetRef(normalized) !== null;
}

function sanitizePanelImage(image: Panel["image"]): Panel["image"] {
  if (!image || !isLocalImageRef(image.original)) {
    return undefined;
  }

  const naturalWidth = Number(image.naturalWidth);
  const naturalHeight = Number(image.naturalHeight);
  const crop = image.crop;

  return {
    original: image.original.trim(),
    naturalWidth: Number.isFinite(naturalWidth) && naturalWidth > 0 ? Math.round(naturalWidth) : undefined,
    naturalHeight: Number.isFinite(naturalHeight) && naturalHeight > 0 ? Math.round(naturalHeight) : undefined,
    crop:
      crop &&
      Number.isFinite(crop.x) &&
      Number.isFinite(crop.y) &&
      Number.isFinite(crop.width) &&
      Number.isFinite(crop.height) &&
      Number.isFinite(crop.scale)
        ? {
            x: crop.x,
            y: crop.y,
            width: crop.width,
            height: crop.height,
            scale: clamp(crop.scale, 0.1, 4)
          }
        : undefined
  };
}

function sanitizePanel(panel: Panel): Panel {
  return createPanel({
    id: panel.id,
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: panel.height,
    rotation: panel.rotation,
    shape: panel.shape,
    borderColor: panel.borderColor,
    borderRadius: Math.max(0, panel.borderRadius),
    borderWidth: Math.max(0, panel.borderWidth),
    gap: Math.max(0, panel.gap),
    image: sanitizePanelImage(panel.image),
    parentId: panel.parentId
  });
}

function sanitizeCanvas(canvas: Partial<ProjectPage["canvas"]> | undefined): ProjectPage["canvas"] {
  const fallback = createCanvasFromPreset("A4");
  const width = Number(canvas?.width ?? fallback.width);
  const height = Number(canvas?.height ?? fallback.height);
  const dpi = Number(canvas?.dpi ?? fallback.dpi);
  const preset = canvas?.preset;

  return {
    width: Math.max(240, Math.round(Number.isFinite(width) ? width : fallback.width)),
    height: Math.max(240, Math.round(Number.isFinite(height) ? height : fallback.height)),
    dpi: Math.max(72, Math.round(Number.isFinite(dpi) ? dpi : fallback.dpi ?? 300)),
    preset: preset === "A3" || preset === "A4" || preset === "custom" ? preset : "custom"
  };
}

function sanitizePage(page: Partial<ProjectPage> | undefined, index: number): ProjectPage {
  const fallbackName = `第 ${index + 1} 页`;
  const safePanels = Array.isArray(page?.panels) ? page.panels.map((entry) => sanitizePanel(entry)) : [];
  const safeBubbles = Array.isArray(page?.bubbles) ? page.bubbles : [];

  return {
    id: page?.id || uuidv4(),
    name: (typeof page?.name === "string" && page.name.trim()) || fallbackName,
    canvas: sanitizeCanvas(page?.canvas),
    panels: safePanels,
    bubbles: safeBubbles
  };
}

function normalizeLoadedProject(loaded: LegacyProject): Project {
  if (Array.isArray(loaded.pages) && loaded.pages.length > 0) {
    const pages = loaded.pages.map((page, index) => sanitizePage(page, index));
    const activePageId =
      loaded.activePageId && pages.some((page) => page.id === loaded.activePageId) ? loaded.activePageId : pages[0].id;
    return {
      id: loaded.id || uuidv4(),
      name: (typeof loaded.name === "string" && loaded.name.trim()) || "未命名项目",
      pages,
      activePageId
    };
  }

  const fallbackPage = sanitizePage(
    {
      id: uuidv4(),
      name: "第 1 页",
      canvas: loaded.canvas,
      panels: loaded.panels,
      bubbles: loaded.bubbles
    },
    0
  );

  if (fallbackPage.panels.length === 0) {
    fallbackPage.panels = [
      createPanel({
        x: 40,
        y: 40,
        width: fallbackPage.canvas.width - 80,
        height: fallbackPage.canvas.height - 80
      })
    ];
  }

  return {
    id: loaded.id || uuidv4(),
    name: (typeof loaded.name === "string" && loaded.name.trim()) || "未命名项目",
    pages: [fallbackPage],
    activePageId: fallbackPage.id
  };
}

function getActivePageIndex(project: Project): number {
  if (project.pages.length === 0) {
    return -1;
  }
  const found = project.pages.findIndex((page) => page.id === project.activePageId);
  return found >= 0 ? found : 0;
}

export function getActivePage(project: Project): ProjectPage {
  const index = getActivePageIndex(project);
  if (index >= 0) {
    return project.pages[index];
  }
  return createProjectPage({ name: "第 1 页" });
}

function updatePageAt(project: Project, index: number, updater: (page: ProjectPage) => ProjectPage): Project {
  if (index < 0 || index >= project.pages.length) {
    return project;
  }

  const nextPages = project.pages.map((page, pageIndex) => {
    if (pageIndex !== index) {
      return page;
    }
    return updater(page);
  });

  return {
    ...project,
    pages: nextPages,
    activePageId: nextPages[index].id
  };
}

function updateActivePage(project: Project, updater: (page: ProjectPage) => ProjectPage): Project {
  return updatePageAt(project, getActivePageIndex(project), updater);
}

function updateProjectPanelById(project: Project, id: string, updater: (panel: Panel) => Panel): Project | null {
  let touched = false;

  const nextPages = project.pages.map((page) => {
    let pageTouched = false;
    const nextPanels = page.panels.map((panel) => {
      if (panel.id !== id) {
        return panel;
      }
      touched = true;
      pageTouched = true;
      return updater(panel);
    });

    if (!pageTouched) {
      return page;
    }

    return {
      ...page,
      panels: nextPanels
    };
  });

  if (!touched) {
    return null;
  }

  return {
    ...project,
    pages: nextPages
  };
}

function findPanel(project: Project, id: string): Panel | undefined {
  for (const page of project.pages) {
    const panel = page.panels.find((entry) => entry.id === id);
    if (panel) {
      return panel;
    }
  }
  return undefined;
}

function getPanelFrameRatio(panel: Pick<Panel, "width" | "height" | "gap" | "shape">): number {
  const clipBounds = getPanelImageClipBounds(panel);
  return clipBounds.width / clipBounds.height;
}

function normalizeCropToRatio(
  crop: CropConfig,
  naturalWidth: number,
  naturalHeight: number,
  ratio: number
): CropConfig {
  const safeRatio = Math.max(0.001, ratio);
  let width = clamp(crop.width, 1, naturalWidth);
  let height = clamp(crop.height, 1, naturalHeight);
  const centerX = crop.x + width / 2;
  const centerY = crop.y + height / 2;

  if (width / Math.max(height, 0.001) >= safeRatio) {
    height = width / safeRatio;
  } else {
    width = height * safeRatio;
  }

  const fitScale = Math.min(1, naturalWidth / Math.max(width, 1), naturalHeight / Math.max(height, 1));
  width = Math.max(1, width * fitScale);
  height = Math.max(1, height * fitScale);

  return {
    x: clamp(centerX - width / 2, 0, Math.max(0, naturalWidth - width)),
    y: clamp(centerY - height / 2, 0, Math.max(0, naturalHeight - height)),
    width,
    height,
    scale: clamp(crop.scale, 0.1, 4)
  };
}

function replacePanel(panels: Panel[], id: string, patch: Partial<Panel>): Panel[] {
  return panels.map((panel) => {
    if (panel.id !== id) {
      return panel;
    }

    const nextPanel = sanitizePanel({
      ...panel,
      ...patch,
      image: patch.image === undefined ? panel.image : patch.image
    });

    if (!nextPanel.image?.crop) {
      return nextPanel;
    }

    const previousRatio = getPanelFrameRatio(panel);
    const nextRatio = getPanelFrameRatio(nextPanel);
    if (Math.abs(previousRatio - nextRatio) < 0.000001) {
      return nextPanel;
    }

    const naturalWidth = Math.max(1, nextPanel.image.naturalWidth ?? nextPanel.width);
    const naturalHeight = Math.max(1, nextPanel.image.naturalHeight ?? nextPanel.height);
    return {
      ...nextPanel,
      image: {
        ...nextPanel.image,
        crop: normalizeCropToRatio(nextPanel.image.crop, naturalWidth, naturalHeight, nextRatio)
      }
    };
  });
}

type SplitPanelGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: PanelShape;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function splitPanelIntoGridGeometry(target: Panel, rows: number, cols: number, innerGap: number): SplitPanelGeometry[] {
  const safeRows = Math.max(1, Math.floor(rows));
  const safeCols = Math.max(1, Math.floor(cols));
  const safeGap = Math.max(0, innerGap);
  const availableHeight = target.height - safeGap * (safeRows - 1);
  const rowHeight = Math.max(24, Math.floor(availableHeight / safeRows));
  const shape = normalizePanelShape(target.shape, target.width);
  const topLeftX = shape.topLeft * target.width;
  const topRightX = shape.topRight * target.width;
  const bottomLeftX = shape.bottomLeft * target.width;
  const bottomRightX = shape.bottomRight * target.width;
  const referenceHeight = Math.max(1, target.height);
  const output: SplitPanelGeometry[] = [];

  for (let row = 0; row < safeRows; row += 1) {
    const rowY = row * (rowHeight + safeGap);
    const rowBottomY = rowY + rowHeight;
    const topRatio = clamp(rowY / referenceHeight, 0, 1);
    const bottomRatio = clamp(rowBottomY / referenceHeight, 0, 1);
    const rowLeftTop = lerp(topLeftX, bottomLeftX, topRatio);
    const rowRightTop = lerp(topRightX, bottomRightX, topRatio);
    const rowLeftBottom = lerp(topLeftX, bottomLeftX, bottomRatio);
    const rowRightBottom = lerp(topRightX, bottomRightX, bottomRatio);
    const availableTopWidth = rowRightTop - rowLeftTop - safeGap * (safeCols - 1);
    const availableBottomWidth = rowRightBottom - rowLeftBottom - safeGap * (safeCols - 1);
    const topCellWidth = Math.max(24, Math.floor(availableTopWidth / safeCols));
    const bottomCellWidth = Math.max(24, Math.floor(availableBottomWidth / safeCols));

    for (let col = 0; col < safeCols; col += 1) {
      const topStart = rowLeftTop + col * (topCellWidth + safeGap);
      const topEnd = topStart + topCellWidth;
      const bottomStart = rowLeftBottom + col * (bottomCellWidth + safeGap);
      const bottomEnd = bottomStart + bottomCellWidth;
      const minX = Math.min(topStart, bottomStart);
      const maxX = Math.max(topEnd, bottomEnd);
      const width = Math.max(24, maxX - minX);

      output.push({
        x: minX,
        y: rowY,
        width,
        height: rowHeight,
        shape: normalizePanelShape(
          {
            topLeft: (topStart - minX) / width,
            topRight: (topEnd - minX) / width,
            bottomRight: (bottomEnd - minX) / width,
            bottomLeft: (bottomStart - minX) / width
          },
          width
        )
      });
    }
  }

  return output;
}

function createNewPageName(project: Project): string {
  return `第 ${project.pages.length + 1} 页`;
}

async function runSaveProjectFlow(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore,
  options?: {
    forcePickDirectory?: boolean;
  }
): Promise<void> {
  const forcePickDirectory = options?.forcePickDirectory ?? false;
  set((state) => ({
    busy: {
      ...state.busy,
      savingProject: true
    },
    ...withNotice(state, forcePickDirectory ? "正在另存为项目..." : "正在保存项目...")
  }));

  try {
    if (!hasDirectoryPicker()) {
      const state = get();
      const materialized = await materializeProjectAssetsForFileExport(
        createPersistedProjectDocument(state),
        state.projectDirectoryHandle
      );
      const downloadFilename = createProjectDownloadFilename(state.project.name);
      triggerJsonDownload(downloadFilename, materialized.document);
      get().setNotice(
        materialized.unresolvedRefs.length > 0
          ? `当前环境不支持目录保存，已下载 ${downloadFilename}，但有 ${materialized.unresolvedRefs.length} 张图片未能内嵌`
          : `当前环境不支持目录保存，已下载 ${downloadFilename}（已内嵌图片和历史）`
      );
      return;
    }

    const beforeSaveState = get();
    const sourceWasUnsaved = !beforeSaveState.projectDirectoryHandle;

    let targetDirectory = forcePickDirectory ? undefined : beforeSaveState.projectDirectoryHandle;
    if (!targetDirectory) {
      const pickedDirectory = await pickProjectDirectory();
      if (!pickedDirectory) {
        get().setNotice(forcePickDirectory ? "已取消另存为" : "已取消保存");
        return;
      }
      targetDirectory = pickedDirectory;
    }

    const state = get();
    const baseDocument = createPersistedProjectDocument(state);
    const materialized = await materializeProjectAssetsForSave(
      baseDocument,
      targetDirectory,
      state.projectDirectoryHandle ?? targetDirectory,
      state.assetRefMap
    );

    const layoutDocument = createPersistedProjectLayoutDocument(materialized.document);
    const historyLogDocument = createPersistedHistoryLogDocument(materialized.document);
    await Promise.all([
      writeJsonToDirectory(targetDirectory, PROJECT_JSON_FILENAME, layoutDocument),
      writeJsonToDirectory(targetDirectory, HISTORY_LOG_FILENAME, historyLogDocument)
    ]);

    let nextProject = state.project;
    let nextHistoryPast = state.historyPast;
    let nextHistoryFuture = state.historyFuture;
    let nextAssetRefMap = materialized.runtimeAssetRefMap;
    let nextTransientObjectUrls = state.transientObjectUrls;
    let reboundToDirectoryAssets = false;

    if (sourceWasUnsaved && materialized.unresolvedRefs.length === 0) {
      const rebound = await rebindRuntimeAssetRefsFromDirectory(
        {
          project: state.project,
          historyPast: state.historyPast,
          historyFuture: state.historyFuture
        },
        targetDirectory,
        materialized.runtimeAssetRefMap
      );

      if (rebound.missingAssetRefs.length === 0) {
        revokeObjectUrls(state.transientObjectUrls);
        nextProject = rebound.project;
        nextHistoryPast = rebound.historyPast;
        nextHistoryFuture = rebound.historyFuture;
        nextAssetRefMap = rebound.runtimeAssetRefMap;
        nextTransientObjectUrls = rebound.objectUrls;
        reboundToDirectoryAssets = true;
      } else {
        revokeObjectUrls(rebound.objectUrls);
      }
    }

    set({
      project: nextProject,
      historyPast: nextHistoryPast,
      historyFuture: nextHistoryFuture,
      projectDirectoryHandle: targetDirectory,
      projectDirectoryName: targetDirectory.name,
      assetRefMap: nextAssetRefMap,
      transientObjectUrls: nextTransientObjectUrls
    });

    if (materialized.unresolvedRefs.length > 0) {
      get().setNotice(
        `项目已保存到 ${targetDirectory.name}/${PROJECT_JSON_FILENAME}（历史在 ${HISTORY_LOG_FILENAME}），但有 ${materialized.unresolvedRefs.length} 张图片未能写入`
      );
    } else {
      get().setNotice(
        forcePickDirectory
          ? `项目已另存为 ${targetDirectory.name}/${PROJECT_JSON_FILENAME}（历史在 ${HISTORY_LOG_FILENAME}）`
          : reboundToDirectoryAssets
            ? `项目已保存到 ${targetDirectory.name}/${PROJECT_JSON_FILENAME}（历史在 ${HISTORY_LOG_FILENAME}），图片已转存到目录资源`
            : `项目已保存到 ${targetDirectory.name}/${PROJECT_JSON_FILENAME}（历史在 ${HISTORY_LOG_FILENAME}）`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    get().setNotice(message);
  } finally {
    set((state) => ({
      busy: {
        ...state.busy,
        savingProject: false
      }
    }));
  }
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  project: createEmptyProject(),
  projectDirectoryHandle: undefined,
  projectDirectoryName: undefined,
  assetRefMap: {},
  transientObjectUrls: [],
  themeMode: getInitialThemeMode(),
  selection: undefined,
  manualPanelMode: false,
  snapSizeTo16: false,
  historyPast: [],
  historyFuture: [],
  noticeHistory: [],
  busy: {
    uploadingPanelId: undefined,
    loadingProject: false,
    savingProject: false
  },
  notice: undefined,

  setNotice: (notice) => {
    set((state) => ({
      ...withNotice(state, notice)
    }));
  },

  setThemeMode: (mode) => {
    set((state) => {
      if (state.themeMode === mode) {
        return state;
      }

      persistThemeMode(mode);
      return {
        themeMode: mode,
        ...withNotice(state, mode === "dark" ? "已切换为黑暗模式" : "已切换为明亮模式")
      };
    });
  },

  undo: () => {
    set((state) => {
      if (state.historyPast.length === 0) {
        return {
          ...withNotice(state, "没有可撤销操作")
        };
      }

      const entry = state.historyPast[state.historyPast.length - 1];
      const nextPast = state.historyPast.slice(0, -1);
      const nextFuture = [entry, ...state.historyFuture].slice(0, HISTORY_LIMIT);

      return {
        project: applyHistory(state.project, entry.backward),
        historyPast: nextPast,
        historyFuture: nextFuture,
        selection: undefined,
        ...withNotice(state, `已撤销：${entry.message}`)
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.historyFuture.length === 0) {
        return {
          ...withNotice(state, "没有可重做操作")
        };
      }

      const entry = state.historyFuture[0];
      const nextFuture = state.historyFuture.slice(1);
      const nextPast = [...state.historyPast, entry].slice(-HISTORY_LIMIT);

      return {
        project: applyHistory(state.project, entry.forward),
        historyPast: nextPast,
        historyFuture: nextFuture,
        selection: undefined,
        ...withNotice(state, `已重做：${entry.message}`)
      };
    });
  },

  setProjectName: (name) => {
    set((state) => {
      if (state.project.name === name) {
        return state;
      }

      const nextProject: Project = {
        ...state.project,
        name
      };

      const safeName = name.trim() || "未命名项目";
      const historyState = withHistory(state, nextProject, `项目名称已改为 ${safeName}`);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  setCanvasPreset: (preset) => {
    const picked = createCanvasFromPreset(preset);
    set((state) => {
      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        canvas: {
          width: picked.width,
          height: picked.height,
          dpi: picked.dpi,
          preset
        }
      }));

      const historyState = withHistory(state, nextProject, `画布已切换为 ${preset}`);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  setCanvasSize: (width, height) => {
    set((state) => {
      const nextWidth = Math.max(240, Math.round(width));
      const nextHeight = Math.max(240, Math.round(height));
      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        canvas: {
          ...page.canvas,
          width: nextWidth,
          height: nextHeight,
          preset: "custom"
        }
      }));

      const historyState = withHistory(state, nextProject, `画布尺寸已调整为 ${nextWidth} x ${nextHeight}`);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  setAllPanelsStyle: (style) => {
    set((state) => {
      const activePage = getActivePage(state.project);
      if (activePage.panels.length === 0) {
        return {
          ...withNotice(state, "当前没有分镜")
        };
      }

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: page.panels.map((panel) =>
          sanitizePanel({
            ...panel,
            borderRadius: style.borderRadius === undefined ? panel.borderRadius : style.borderRadius,
            borderWidth: style.borderWidth === undefined ? panel.borderWidth : style.borderWidth
          })
        )
      }));

      const historyState = withHistory(state, nextProject, "已应用分镜样式到当前页");
      if (!historyState) {
        return {
          ...withNotice(state, "所有分镜样式未变化")
        };
      }

      return {
        ...historyState
      };
    });
  },

  setActivePage: (id) => {
    set((state) => {
      if (state.project.activePageId === id || !state.project.pages.some((page) => page.id === id)) {
        return state;
      }
      return {
        project: {
          ...state.project,
          activePageId: id
        },
        selection: undefined
      };
    });
  },

  addPage: () => {
    set((state) => {
      const activePage = getActivePage(state.project);
      const newPage = createProjectPage({
        name: createNewPageName(state.project),
        canvas: {
          ...activePage.canvas
        }
      });

      const nextProject: Project = {
        ...state.project,
        pages: [...state.project.pages, newPage],
        activePageId: newPage.id
      };

      const historyState = withHistory(state, nextProject, `已新增页面：${newPage.name}`);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: undefined
      };
    });
  },

  deletePage: (id) => {
    set((state) => {
      if (state.project.pages.length <= 1) {
        return {
          ...withNotice(state, "至少保留 1 页")
        };
      }

      const index = state.project.pages.findIndex((page) => page.id === id);
      if (index < 0) {
        return state;
      }

      const nextPages = state.project.pages.filter((page) => page.id !== id);
      const nextActive =
        state.project.activePageId === id
          ? nextPages[Math.min(index, nextPages.length - 1)].id
          : state.project.activePageId;

      const nextProject: Project = {
        ...state.project,
        pages: nextPages,
        activePageId: nextActive
      };

      const pageName = state.project.pages[index].name;
      const historyState = withHistory(state, nextProject, `已删除页面：${pageName}`);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: undefined
      };
    });
  },

  movePage: (id, direction) => {
    set((state) => {
      const index = state.project.pages.findIndex((page) => page.id === id);
      if (index < 0) {
        return state;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= state.project.pages.length) {
        return state;
      }

      const nextPages = [...state.project.pages];
      const temp = nextPages[index];
      nextPages[index] = nextPages[targetIndex];
      nextPages[targetIndex] = temp;

      const nextProject: Project = {
        ...state.project,
        pages: nextPages
      };

      const pageName = nextPages[targetIndex].name;
      const historyState = withHistory(state, nextProject, direction === "up" ? `页面已上移：${pageName}` : `页面已下移：${pageName}`);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  splitGrid: (rows, cols) => {
    const safeRows = Math.max(1, Math.floor(rows));
    const safeCols = Math.max(1, Math.floor(cols));

    set((state) => {
      const activePage = getActivePage(state.project);
      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: splitGridPanels(activePage.canvas.width, activePage.canvas.height, safeRows, safeCols)
      }));

      const historyState = withHistory(state, nextProject, `已按 ${safeRows} x ${safeCols} 网格切割`);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: undefined
      };
    });
  },

  splitSelectedPanel: (rows, cols) => {
    const selected = get().selection;
    if (!selected || selected.kind !== "panel") {
      get().setNotice("请先选择一个分镜");
      return;
    }

    const safeRows = Math.max(1, Math.floor(rows));
    const safeCols = Math.max(1, Math.floor(cols));

    set((state) => {
      const activePage = getActivePage(state.project);
      const target = activePage.panels.find((panel) => panel.id === selected.id);
      if (!target) {
        return state;
      }

      const innerGap = Math.max(4, target.gap);
      const targetCenter = getPanelCenter(target);
      const targetRotation = normalizePanelRotation(target.rotation);
      const childGeometry = splitPanelIntoGridGeometry(target, safeRows, safeCols, innerGap);

      const children: Panel[] = [];
      childGeometry.forEach((geometry) => {
        const localCenter = {
          x: target.x + geometry.x + geometry.width / 2,
          y: target.y + geometry.y + geometry.height / 2
        };
        const rotatedCenter = rotatePointAround(localCenter, targetCenter, targetRotation);

        children.push(
          createPanel({
            x: rotatedCenter.x - geometry.width / 2,
            y: rotatedCenter.y - geometry.height / 2,
            width: geometry.width,
            height: geometry.height,
            rotation: targetRotation,
            shape: geometry.shape,
            borderColor: target.borderColor,
            borderRadius: target.borderRadius,
            borderWidth: target.borderWidth,
            gap: target.gap,
            parentId: target.id
          })
        );
      });

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: [...page.panels.filter((panel) => panel.id !== target.id), ...children]
      }));

      const historyState = withHistory(state, nextProject, `已将分镜切割为 ${safeRows} x ${safeCols}`);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: {
          kind: "panel",
          id: children[0]?.id ?? target.id
        }
      };
    });
  },

  createPanelFromRect: (x, y, width, height) => {
    const normalizedX = width >= 0 ? x : x + width;
    const normalizedY = height >= 0 ? y : y + height;
    const absWidth = Math.abs(width);
    const absHeight = Math.abs(height);

    if (absWidth < 24 || absHeight < 24) {
      return;
    }

    const panel = createPanel({
      x: Math.max(0, normalizedX),
      y: Math.max(0, normalizedY),
      width: absWidth,
      height: absHeight
    });

    set((state) => {
      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: [...page.panels, panel]
      }));

      const historyState = withHistory(state, nextProject, "已创建分镜");
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: {
          kind: "panel",
          id: panel.id
        }
      };
    });
  },

  selectPanel: (id) => {
    set({
      selection: {
        kind: "panel",
        id
      }
    });
  },

  selectBubble: (id) => {
    set({
      selection: {
        kind: "bubble",
        id
      }
    });
  },

  clearSelection: () => {
    set({ selection: undefined });
  },

  deleteSelection: () => {
    set((state) => {
      if (!state.selection) {
        return state;
      }

      const activePage = getActivePage(state.project);
      if (state.selection.kind === "panel") {
        if (!activePage.panels.some((panel) => panel.id === state.selection?.id)) {
          return {
            selection: undefined
          };
        }

        const nextProject = updateActivePage(state.project, (page) => ({
          ...page,
          panels: page.panels.filter((panel) => panel.id !== state.selection?.id)
        }));

        const historyState = withHistory(state, nextProject, "已删除分镜");
        if (!historyState) {
          return state;
        }

        return {
          ...historyState,
          selection: undefined
        };
      }

      if (!activePage.bubbles.some((bubble) => bubble.id === state.selection?.id)) {
        return {
          selection: undefined
        };
      }

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        bubbles: page.bubbles.filter((bubble) => bubble.id !== state.selection?.id)
      }));

      const historyState = withHistory(state, nextProject, "已删除气泡");
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: undefined
      };
    });
  },

  updatePanel: (id, patch) => {
    set((state) => {
      const activePage = getActivePage(state.project);
      if (!activePage.panels.some((panel) => panel.id === id)) {
        return state;
      }

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: replacePanel(page.panels, id, patch)
      }));

      const historyState = withHistory(state, nextProject, describePanelPatch(patch));
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  updateBubble: (id, patch) => {
    set((state) => {
      const activePage = getActivePage(state.project);
      if (!activePage.bubbles.some((bubble) => bubble.id === id)) {
        return state;
      }

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        bubbles: page.bubbles.map((bubble) => {
          if (bubble.id !== id) {
            return bubble;
          }

          return {
            ...bubble,
            ...patch,
            x: patch.x === undefined ? bubble.x : patch.x,
            y: patch.y === undefined ? bubble.y : patch.y,
            width: patch.width === undefined ? bubble.width : Math.max(30, patch.width),
            height: patch.height === undefined ? bubble.height : Math.max(30, patch.height),
            fontSize: patch.fontSize === undefined ? bubble.fontSize : Math.max(8, patch.fontSize)
          };
        })
      }));

      const historyState = withHistory(state, nextProject, describeBubblePatch(patch));
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  addBubble: (type) => {
    const bubble = createBubbleFactory(type);
    set((state) => {
      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        bubbles: [...page.bubbles, bubble]
      }));

      const historyState = withHistory(state, nextProject, `已创建${bubbleTypeLabel(type)}气泡`);
      if (!historyState) {
        return state;
      }

      return {
        ...historyState,
        selection: {
          kind: "bubble",
          id: bubble.id
        }
      };
    });
  },

  toggleManualPanelMode: (enabled) => {
    set((state) => {
      const nextEnabled = enabled ?? !state.manualPanelMode;
      return {
        manualPanelMode: nextEnabled,
        ...withNotice(state, nextEnabled ? "手绘分镜模式已开启" : "手绘分镜模式已关闭")
      };
    });
  },

  toggleSnapSizeTo16: (enabled) => {
    set((state) => {
      const nextEnabled = enabled ?? !state.snapSizeTo16;
      return {
        snapSizeTo16: nextEnabled,
        ...withNotice(state, nextEnabled ? "已开启 16 倍数尺寸吸附" : "已关闭 16 倍数尺寸吸附")
      };
    });
  },

  setPanelCrop: (id, crop) => {
    set((state) => {
      const activePage = getActivePage(state.project);
      const panel = activePage.panels.find((entry) => entry.id === id);
      if (!panel?.image?.original) {
        return state;
      }

      const naturalWidth = Math.max(1, panel.image.naturalWidth ?? panel.width);
      const naturalHeight = Math.max(1, panel.image.naturalHeight ?? panel.height);
      const width = clamp(crop.width, 1, naturalWidth);
      const height = clamp(crop.height, 1, naturalHeight);

      const nextCrop: CropConfig = {
        x: clamp(crop.x, 0, Math.max(0, naturalWidth - width)),
        y: clamp(crop.y, 0, Math.max(0, naturalHeight - height)),
        width,
        height,
        scale: clamp(crop.scale, 0.1, 4)
      };

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: page.panels.map((entry) => {
          if (entry.id !== id || !entry.image) {
            return entry;
          }
          return {
            ...entry,
            image: {
              ...entry.image,
              crop: nextCrop
            }
          };
        })
      }));

      const historyState = withHistory(state, nextProject, "已更新图片裁剪");
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  resetPanelCrop: (id) => {
    set((state) => {
      const activePage = getActivePage(state.project);
      const target = activePage.panels.find((panel) => panel.id === id);
      if (!target?.image?.crop) {
        return state;
      }

      const nextProject = updateActivePage(state.project, (page) => ({
        ...page,
        panels: page.panels.map((panel) => {
          if (panel.id !== id || !panel.image) {
            return panel;
          }
          return {
            ...panel,
            image: {
              ...panel.image,
              crop: undefined
            }
          };
        })
      }));

      const historyState = withHistory(state, nextProject, "已重置图片裁剪");
      if (!historyState) {
        return state;
      }

      return {
        ...historyState
      };
    });
  },

  uploadLocalImageForPanel: async (id, file) => {
    if (!findPanel(get().project, id)) {
      get().setNotice("找不到分镜");
      return;
    }

    set((state) => ({
      busy: {
        ...state.busy,
        uploadingPanelId: id
      },
      ...withNotice(state, "正在导入本地图像...")
    }));

    try {
      const result = await uploadLocalImage(file);
      set((state) => {
        const nextProject = updateProjectPanelById(state.project, id, (entry) => ({
          ...entry,
          image: {
            original: result.url,
            naturalWidth: result.naturalWidth,
            naturalHeight: result.naturalHeight,
            crop: undefined
          }
        }));

        if (!nextProject) {
          revokeObjectUrls([result.url]);
          return {
            ...withNotice(state, "分镜已不存在")
          };
        }

        const historyState = withHistory(state, nextProject, "已导入本地图像");
        if (!historyState) {
          return state;
        }

        return {
          ...historyState,
          transientObjectUrls: appendTransientObjectUrl(state.transientObjectUrls, result.url)
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      get().setNotice(message);
    } finally {
      set((state) => ({
        busy: {
          ...state.busy,
          uploadingPanelId: undefined
        }
      }));
    }
  },

  saveProject: async () => {
    await runSaveProjectFlow(set, get, {
      forcePickDirectory: false
    });
  },

  saveProjectAs: async () => {
    await runSaveProjectFlow(set, get, {
      forcePickDirectory: true
    });
  },

  loadProject: async () => {
    set((state) => ({
      busy: {
        ...state.busy,
        loadingProject: true
      },
      ...withNotice(state, "正在加载项目...")
    }));

    try {
      if (!hasDirectoryPicker()) {
        const selectedFile = await pickProjectJsonFile();
        if (!selectedFile) {
          get().setNotice("已取消加载");
          return;
        }

        const loaded = JSON.parse(await selectedFile.text()) as unknown;
        const normalized = normalizeLoadedState(loaded);
        if (!normalized) {
          get().setNotice("项目数据格式无效");
          return;
        }

        revokeObjectUrls(get().transientObjectUrls);

        const loadNotice =
          normalized.source === "v2"
            ? `项目加载完成：已恢复 ${normalized.historyPast.length} 条撤销记录、${normalized.historyFuture.length} 条重做记录、${normalized.noticeHistory.length} 条消息`
            : "项目加载完成：旧版项目不包含可恢复的编辑记忆";

        const nextNoticeHistory = appendNoticeToHistory(normalized.noticeHistory, loadNotice);

        set({
          project: {
            ...normalized.project,
            id: normalized.project.id || uuidv4()
          },
          historyPast: normalized.historyPast,
          historyFuture: normalized.historyFuture,
          noticeHistory: nextNoticeHistory,
          selection: undefined,
          notice: loadNotice,
          projectDirectoryHandle: undefined,
          projectDirectoryName: undefined,
          assetRefMap: {},
          transientObjectUrls: []
        });
        return;
      }

      const selectedDirectory = await pickProjectDirectory();
      if (!selectedDirectory) {
        get().setNotice("已取消加载");
        return;
      }

      const loadedProject = await readJsonFromDirectory(selectedDirectory, PROJECT_JSON_FILENAME);
      const loadedHistoryLog = await tryReadJsonFromDirectory(selectedDirectory, HISTORY_LOG_FILENAME);
      const normalized = normalizeLoadedState(mergeProjectAndHistoryDocuments(loadedProject, loadedHistoryLog));
      if (!normalized) {
        get().setNotice("项目数据格式无效");
        return;
      }

      const materialized = await materializeProjectAssetsForLoad(normalized, selectedDirectory);
      revokeObjectUrls(get().transientObjectUrls);

      const baseNotice =
        normalized.source === "v2"
          ? `项目加载完成：已恢复 ${normalized.historyPast.length} 条撤销记录、${normalized.historyFuture.length} 条重做记录、${normalized.noticeHistory.length} 条消息`
          : "项目加载完成：旧版项目不包含可恢复的编辑记忆";
      const loadNotice =
        materialized.missingAssetRefs.length > 0
          ? `${baseNotice}，有 ${materialized.missingAssetRefs.length} 张图片缺失`
          : baseNotice;

      const nextNoticeHistory = appendNoticeToHistory(normalized.noticeHistory, loadNotice);

      set({
        project: {
          ...materialized.project,
          id: materialized.project.id || uuidv4()
        },
        historyPast: materialized.historyPast,
        historyFuture: materialized.historyFuture,
        noticeHistory: nextNoticeHistory,
        selection: undefined,
        notice: loadNotice,
        projectDirectoryHandle: selectedDirectory,
        projectDirectoryName: selectedDirectory.name,
        assetRefMap: materialized.runtimeAssetRefMap,
        transientObjectUrls: materialized.objectUrls
      });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotFoundError"
          ? `所选目录中未找到 ${PROJECT_JSON_FILENAME}`
          : error instanceof Error
            ? error.message
            : "加载失败";
      get().setNotice(message);
    } finally {
      set((state) => ({
        busy: {
          ...state.busy,
          loadingProject: false
        }
      }));
    }
  }
}));
