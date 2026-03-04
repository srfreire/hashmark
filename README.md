<p align="center">
  <br />
  <img src="src-tauri/icons/icon.png" width="80" />
  <br />
</p>

<h1 align="center">Hashmark</h1>

<p align="center">
  A minimal, beautiful Markdown editor for macOS.
  <br />
  <sub>Built with Tauri 2 + React 19 + Tiptap 3</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-d97706" />
  <img src="https://img.shields.io/badge/platform-macOS-000000?logo=apple&logoColor=white" />
  <img src="https://img.shields.io/badge/license-private-444" />
</p>

---

```
  ┌─────────────────────────────────────────────────────────┐
  │ ● ● ●   HASHMARK                    ◐  Saved           │
  ├────────────┬────────────────────────────────────────────┤
  │ 📁 Files   │                                            │
  │            │  # Welcome                                 │
  │  ▾ notes   │                                            │
  │   • hello  │  This is **Hashmark**, a distraction-free  │
  │   ● draft  │  Markdown editor that gets out of your     │
  │   • ideas  │  way and lets you focus on writing.        │
  │            │                                            │
  │  ▾ journal │  > Write. Save. Done.                      │
  │   • today  │                                            │
  │            │  - [x] Rich text editing                   │
  │ 🔍 Search  │  - [x] Dark & light themes                 │
  │            │  - [x] Find & replace                      │
  │            │  - [x] Slash commands                       │
  └────────────┴────────────────────────────────────────────┘
          ● = modified (unsaved)    • = saved
```

## Features

- **Rich Markdown editing** — headings, lists, tasks, code blocks, links, and more
- **Slash commands** — type `/` for quick formatting
- **Bubble menu** — select text to format inline
- **Find & replace** — in-file (`Cmd+F`) and across files (`Cmd+Shift+F`)
- **Manual save** — `Cmd+S` to save, `Cmd+Shift+S` to save all
- **Modified indicators** — orange dots on unsaved files in the sidebar
- **Dark & light themes** — toggle with one click
- **Native macOS app** — fast, lightweight, ~5MB binary

## Shortcuts

| Key | Action |
|-----|--------|
| `Cmd+S` | Save |
| `Cmd+Shift+S` | Save All |
| `Cmd+N` | New file |
| `Cmd+O` | Open folder |
| `Cmd+B` | Toggle sidebar |
| `Cmd+F` | Find in file |
| `Cmd+Shift+F` | Find in all files |
| `/` | Slash commands |

## Stack

| Layer | Tech |
|-------|------|
| Desktop | Tauri 2 (Rust) |
| Frontend | React 19 + TypeScript |
| Editor | Tiptap 3 (ProseMirror) |
| Bundler | Vite 7 |
| Fonts | Source Serif 4, IBM Plex Mono |

## Development

```bash
npm install
npm run tauri dev      # dev with hot reload
npm run tauri build    # production build
```

Build output: `src-tauri/target/release/bundle/macos/Hashmark.app`
