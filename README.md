# OpenKoma

> Local-first comic layout editor for skewed panels, non-destructive image crop, and multi-page export.

[English](./README.md) | [简体中文](./README.zh-CN.md)

## Overview

OpenKoma is a pure local editor for comic page layout. It focuses on the parts of production that need to feel reliable every day: panel composition, local image placement, manual crop, speech bubbles, multi-page management, and reversible editing history.

The app runs entirely on the client side. There is no bundled backend, no external image service, and no account or API setup.

## Core Capabilities

- True skewed panels: supports rectangles, parallelograms, and trapezoids instead of only rotated rectangles.
- Non-destructive crop: imported images keep their original data while crop parameters control rendering.
- Crop editor that matches panel geometry: the manual crop overlay follows the edited skewed panel shape.
- Multi-page workflow: create, reorder, duplicate structure through splitting tools, and export in page order.
- Incremental undo/redo: editing history is stored as forward/backward JSON patches.
- Local-first persistence: save to a folder when File System Access is available, or export/import a single `.openkoma.json` file.

## Editor Features

### Layout

- A4, A3, and custom canvas sizes
- Grid split for the full canvas
- Secondary split for the selected panel
- Drag-to-create manual panel mode
- Optional size snapping to multiples of 16

### Panel and Bubble Editing

- Select, move, and resize panels and bubbles on canvas
- Corner-handle skew editing for panel shapes
- Batch style tools for border radius and border width
- Speech bubble creation and text editing

### Image Workflow

- Import images from your computer only
- Manual crop editor for panel images
- Cover-style display without stretch
- Original image remains untouched after crop edits

### Export and Save

- Export current page as PNG
- Export all pages as a PDF
- Save/load through a chosen local directory
- Fallback project exchange via `.openkoma.json`

## Getting Started

### Requirements

- Node.js 18+
- npm 9+

### Development

```bash
npm install
npm run dev
```

Default URL: `http://localhost:5173`

### Production Build

```bash
npm run build
```

## Local Project Format

When directory access is available, OpenKoma writes project data into the folder you choose:

- `project.json`: layout and editor state
- `history.log`: undo/redo history and notices
- `images/*`: imported local assets copied into the project folder

When directory access is not available, OpenKoma falls back to a single exported `.openkoma.json` file and embeds image data when possible.

Remote image URLs are not part of the supported workflow anymore. If an old project still contains external image links, OpenKoma may warn that those assets cannot be materialized during save.

## Typical Workflow

1. Set the page size and create panels with grid split or manual drawing.
2. Refine panel shapes by dragging skew handles into parallelograms or trapezoids.
3. Import local images for selected panels.
4. Open the manual crop editor and adjust the visible area non-destructively.
5. Add speech bubbles, then save the project or export PNG/PDF.

## Keyboard Shortcuts

- `Cmd/Ctrl + Z`: undo
- `Cmd/Ctrl + Shift + Z` or `Ctrl + Y`: redo
- `Delete` or `Backspace`: delete selected panel or bubble
- `Esc`: close the active toolbar drawer

## Tech Stack

- React + TypeScript
- Zustand
- Konva / React Konva
- Vite
- Radix Themes

## Roadmap

- PSD layered export
- Multi-select and batch alignment tools
- More layout templates and typography controls
- More print-oriented export presets

## License

Apache License 2.0. See [LICENSE](./LICENSE).
