<div align="center">

<h1>OpenKoma</h1>

<p><strong>Local-First AI Comic Editor</strong><br/>A production-focused open-source workflow for comic layout, non-destructive image editing, and reversible history.</p>

<p>
  <img alt="license" src="https://img.shields.io/badge/License-Apache%202.0-2ea44f?style=for-the-badge" />
  <img alt="frontend" src="https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61dafb?style=for-the-badge" />
  <img alt="canvas" src="https://img.shields.io/badge/Canvas-Konva-0ea5e9?style=for-the-badge" />
  <img alt="ai" src="https://img.shields.io/badge/AI-Browser%20to%20FastAPI-111827?style=for-the-badge" />
  <img alt="state" src="https://img.shields.io/badge/State-Zustand-f59e0b?style=for-the-badge" />
</p>

<p>
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="28" alt="React" />
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="28" alt="TypeScript" />
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" width="28" alt="Node.js" />
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vitejs/vitejs-original.svg" width="28" alt="Vite" />
</p>

<p>
  <a href="./README.md"><strong>English</strong></a> |
  <a href="./README.zh-CN.md">简体中文</a>
</p>

</div>

## Abstract
OpenKoma is a local-first comic creation environment designed for practical production instead of demo-only workflows. It combines panel composition, bubble editing, local image import with non-destructive crop, multi-page management, incremental undo/redo history, and direct integration with external AI image services.

## Why OpenKoma
- Incremental reversible editing: every mutation records forward/backward JSON patches for robust undo/redo.
- Non-destructive image workflow: original local assets are preserved while crop parameters drive rendering.
- True skewed panels: panels support parallelogram and trapezoid shapes instead of simple rotated rectangles.
- Multi-page production flow: page list with add/delete/reorder, plus ordered multi-page PDF export.
- Browser-direct AI services: configure external FastAPI endpoints for generation, background removal, and upscaling without a built-in backend server.
- Local-first persistence: save directly to a picked folder when File System Access is available, or export/import a single `.openkoma.json` file as fallback.

## Feature Highlights
- Canvas and layout
  - A4/A3 presets + custom dimensions
  - Grid split, draw-to-create panels, secondary split on selected panel
  - Skew editing with corner dragging and numeric presets
- Panel and object editing
  - Drag/resize/select with visual feedback
  - Global one-click style apply (corner radius and border width)
  - Optional 16-multiple size snapping during resize/transform
- Image workflow
  - Local image import per panel
  - Manual crop editor that matches skewed panel shape
  - Background removal and 2x upscaling via external AI endpoints
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

Default app URL:
- Web: `http://localhost:5173`

### Configure External AI
After opening the app, go to the toolbar drawer `AI Service` and fill in:
- generation URL
- background removal URL
- upscale URL
- shared `Authorization` header value

API contract for your FastAPI service:
- `docs/fastapi-api.md`

### Build
```bash
npm run build
```

## Persistence
- With File System Access API support, OpenKoma saves `project.json`, `history.log`, and image assets into the folder you choose.
- Without it, OpenKoma falls back to downloading and loading a single `.openkoma.json` file with images embedded as data URLs when possible.
- The AI service `Authorization` value stays in browser `localStorage` and is never written into exported project files.

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
