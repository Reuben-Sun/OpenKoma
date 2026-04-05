<div align="center">

<h1>OpenKoma</h1>

<p><strong>Local-First AI Comic Editor</strong><br/>A production-focused open-source workflow for comic layout, non-destructive image editing, and reversible history.</p>

<p>
  <img alt="license" src="https://img.shields.io/badge/License-Apache%202.0-2ea44f?style=for-the-badge" />
  <img alt="frontend" src="https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61dafb?style=for-the-badge" />
  <img alt="canvas" src="https://img.shields.io/badge/Canvas-Konva-0ea5e9?style=for-the-badge" />
  <img alt="backend" src="https://img.shields.io/badge/Backend-Node%20%2B%20Express-111827?style=for-the-badge" />
  <img alt="state" src="https://img.shields.io/badge/State-Zustand-f59e0b?style=for-the-badge" />
</p>

<p>
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="28" alt="React" />
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="28" alt="TypeScript" />
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" width="28" alt="Node.js" />
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/express/express-original.svg" width="28" alt="Express" />
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vitejs/vitejs-original.svg" width="28" alt="Vite" />
</p>

<p>
  <a href="./README.md"><strong>English</strong></a> |
  <a href="./README.zh-CN.md">简体中文</a>
</p>

</div>

## Abstract
OpenKoma is a local-first comic creation environment designed for practical production instead of demo-only workflows. It combines panel composition, bubble editing, local image import with non-destructive crop, multi-page management, and incremental undo/redo history in one reproducible pipeline.

## Why OpenKoma (Core Selling Points)
- Incremental reversible editing: every mutation records forward/backward JSON patches for robust undo/redo.
- Non-destructive image workflow: original local assets are preserved while crop parameters drive rendering.
- Aspect-safe crop engine: crop box follows panel ratio, supports edge-resize + drag-move, and auto re-crops after panel resize while preserving center priority.
- Multi-page production flow: page list with add/delete/reorder, plus ordered multi-page PDF export.
- Project-level operation memory: user-facing message log tracks every change, and undo/redo references operation intent.
- Local-first persistence: unsaved projects auto-snapshot to temp workspace, with save/load/save-as support.

## Feature Highlights
- Canvas and layout
  - A4/A3 presets + custom dimensions
  - Grid split, draw-to-create panels, secondary split on selected panel
- Panel and object editing
  - Drag/resize/select with visual feedback
  - Global one-click style apply (corner radius and border width)
  - Optional 16-multiple size snapping during resize/transform
- Bubble system
  - Rectangle / rounded / circle bubbles
  - Horizontal and vertical text rendering
- Image workflow
  - Local image import per panel
  - Manual crop editor with edge drag (resize) and inner drag (move)
  - Display without stretch (cover + clip behavior)
- Multi-page and export
  - Left page list with live previews
  - PNG export for current page
  - PDF export for all pages in page order
- UX system
  - Compact top toolbar + category-based expandable tool drawers
  - Bottom fixed message bar with expandable history records
  - Light/dark mode switch via Radix Themes

## Quick Start
### Requirements
- Node.js 18+
- npm 9+

### Run
```bash
npm install
npm run dev
```

Default endpoints:
- Web: `http://localhost:5173`
- API: `http://localhost:3001`

### Build
```bash
npm run build
```

## Keyboard Shortcuts
- `Cmd/Ctrl + Z`: Undo
- `Cmd/Ctrl + Shift + Z` or `Ctrl + Y`: Redo
- `Delete` or `Backspace`: Delete selected panel/bubble

## Roadmap
<details>
  <summary><strong>Planned Milestones (click to expand)</strong></summary>

### Milestone A - Export and Publishing
- [ ] PSD layered export pipeline
- [ ] More print-oriented export presets

### Milestone B - Layout Efficiency
- [ ] Multi-select editing and batch operations
- [ ] Batch align/distribute tools for panels and bubbles

### Milestone C - Template and Typography
- [ ] Advanced comic layout template packs
- [ ] Richer typography and bubble-tail editing system

</details>

## Citation
```bibtex
@software{openkoma2026,
  title = {OpenKoma: A Local-First AI Comic Editor with Incremental Reversible History},
  author = {OpenKoma Authors},
  year = {2026},
  url = {https://github.com/<your-org>/OpenKoma},
  license = {Apache-2.0}
}
```

## License
Apache License 2.0. See [LICENSE](./LICENSE).
