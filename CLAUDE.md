# Hashmark

A minimal, beautiful Markdown editor built with Tauri 2 + React 19 + Tiptap 3.

## Tech Stack

- **Desktop**: Tauri 2 (Rust backend, JS frontend)
- **Frontend**: React 19 + TypeScript 5.8 + Vite 7
- **Editor**: Tiptap 3.20 (ProseMirror-based rich text editor)
- **Styling**: CSS custom properties (light/dark themes via `.dark` class), Tailwind CSS 4 (imported but mostly raw CSS)
- **Fonts**: Source Serif 4 (editor body), IBM Plex Mono (UI labels/code), system sans-serif (UI chrome)

## Project Structure

```
src/
  App.tsx                    # Root layout: sidebar + editor area + state management
  styles.css                 # All styles (CSS variables, sidebar, editor, bubble menu, find bar, etc.)
  types.ts                   # Shared TypeScript interfaces (FileNode, SearchMatch, FileSearchResult)
  components/
    Sidebar.tsx              # Sidebar with Files/Search tabs, file tree, global search
    Editor.tsx               # Tiptap editor wrapper with auto-save, Cmd+F, FindBar portal
    FindBar.tsx              # In-file find & replace bar (Cmd+F)
    GlobalSearch.tsx          # Cross-file search panel in sidebar
    BubbleMenu.tsx           # Floating format toolbar (bold, italic, etc.)
    SlashMenu.tsx            # Slash command dropdown menu
    FileTreeItem.tsx         # Recursive file/folder tree item
    ThemeToggle.tsx          # Light/dark mode toggle button
  extensions/
    search-and-replace.ts    # Custom Tiptap extension: ProseMirror decorations for search highlights
    slash-command.ts         # Tiptap suggestion extension for "/" commands
  services/
    filesystem.ts            # Tauri filesystem operations (read, write, search, replace, tree)
src-tauri/
  src/lib.rs                 # Tauri app setup: native menus (File, Edit, View) + menu event handlers
```

## Commands

```bash
npm run dev          # Start Vite dev server (port 1420) — UI only, no Tauri APIs
npm run build        # TypeScript check + Vite production build
npm run tauri dev    # Full Tauri development with hot reload
npm run tauri build  # Production build → src-tauri/target/release/bundle/macos/Hashmark.app
```

**Install built app**: `cp -R src-tauri/target/release/bundle/macos/Hashmark.app /Applications/`

## Architecture Notes

### State Flow
- `App.tsx` owns all top-level state (rootPath, activeFile, sidebarView, sidebarCollapsed, saveStatus, dark mode)
- File operations go through `services/filesystem.ts` which wraps Tauri plugin APIs
- Native menu events (Rust → JS) use Tauri's event system: `app.emit("menu-*")` → `listen("menu-*")`

### Editor
- Tiptap editor with markdown roundtrip via `tiptap-markdown` extension
- Auto-save with 1s debounce on content changes
- FindBar renders via `createPortal` into `#find-bar-container` (between topbar and scroll area)
- Search highlights use ProseMirror `Decoration.inline` (`.search-highlight` / `.search-highlight-active`)

### Sidebar
- Collapsible (Cmd+B or button in header). Animated with CSS transition (width + opacity)
- Two tabs: Files (file tree + open folder + new file) and Search (global search)
- Tab toggle buttons + collapse button in sidebar header; file actions (open folder, new file) inside Files tab content
- Global search uses 300ms debounce, results grouped by file with expandable matches, has close (X) button
- New file input has cancel (X) button; also dismisses with Escape
- Cmd+Shift+F / Find in Files auto-expands collapsed sidebar

## Coding Conventions

### Icons
- All icons are inline SVGs, `14x14` with `strokeWidth="1.5"` for custom icons
- Prefer icons from **Lucide** (24x24 viewBox, strokeWidth 2, rendered at 14x14 display)
- Never use Unicode characters for UI controls (use SVG instead)

### Styling
- All styles in `src/styles.css` — no CSS modules, no styled-components
- Use CSS custom properties (`var(--bg-sidebar)`, `var(--text-primary)`, etc.) for all colors
- Dark mode: `.dark` class on `<html>`, all colors must work in both themes
- Never use hardcoded `rgba()` for interactive states — use theme variables instead
- Button pattern: `border: none; background: none; border-radius: 6px; cursor: pointer; transition: all 0.15s`
- Hover states: `background: var(--bg-sidebar-hover)` / Active: `var(--bg-sidebar-active)`

### Components
- Functional components only, no class components
- Props interfaces defined inline above each component
- `useCallback` for handlers passed as props or in dependency arrays
- File naming: PascalCase for components, kebab-case for extensions

### Tauri / Rust
- Menu items defined in `lib.rs` with accelerators, emit events to JS frontend
- Filesystem operations use `@tauri-apps/plugin-fs` and `@tauri-apps/plugin-dialog`
- Browser dev (`npm run dev`) will show console errors for Tauri APIs — that's expected

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+B | Toggle sidebar |
| Cmd+F | In-file find (with selected text pre-filled) |
| Cmd+H | In-file find and replace |
| Cmd+Shift+F | Global search (sidebar) |
| Cmd+S | Save |
| Cmd+N | New file |
| Cmd+O | Open folder |
| Escape | Close FindBar / cancel new file input |

## Theme Variables

Key CSS variables (defined in `:root` and `.dark`):
- `--bg-app`, `--bg-sidebar`, `--bg-sidebar-hover`, `--bg-sidebar-active`, `--bg-editor`
- `--text-primary`, `--text-secondary`, `--text-tertiary`
- `--accent` (amber), `--accent-soft` (subtle highlight)
- `--border`, `--code-bg`, `--code-text`, `--link`
