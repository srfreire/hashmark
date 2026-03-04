# Search Feature Design — Hashmark

## Overview

Add Ctrl/Cmd+F in-file search and Cmd+Shift+F global search to Hashmark. Both support find, replace, regex, case-sensitive, and whole-word matching.

## Approach

Tiptap/ProseMirror extension for in-file search (decorations + transactions). React components for UI. Filesystem service for global search across all `.md` files in the workspace.

## In-File Search (Cmd+F)

### Extension: `SearchAndReplace`

Custom Tiptap extension built on ProseMirror plugins:

- **Search plugin:** Maintains search state (query, options) in plugin state. On state update, scans the document's text content and creates `Decoration.inline` decorations for all matches.
- **Decorations:** All matches get a `search-highlight` class (soft yellow). The active/current match gets `search-highlight-active` class (accent orange).
- **Commands exposed:** `setSearchTerm`, `setReplaceTerm`, `nextMatch`, `previousMatch`, `replaceCurrentMatch`, `replaceAllMatches`, `clearSearch`.
- **Options stored in plugin state:** `caseSensitive`, `wholeWord`, `useRegex`.
- Replace operations use editor transactions (compatible with undo/redo).

### Component: `FindBar`

Horizontal bar below the editor topbar:

```
┌──────────────────────────────────────────────────────────┐
│ [search input______] [Aa] [W] [.*]  ◀ ▶  3/12   ✕     │
│ [replace input_____] [Replace] [Replace All]             │
└──────────────────────────────────────────────────────────┘
```

- Row 1: Search input + toggle buttons (case-sensitive, whole-word, regex) + prev/next navigation + match counter + close button
- Row 2: Replace input (toggleable via chevron) + Replace + Replace All buttons
- Escape closes and clears highlights
- Enter = next match, Shift+Enter = previous match
- Auto-focus search input on open

## Global Search (Cmd+Shift+F)

### Sidebar Tabs

The sidebar gains two views toggled by tab icons at the top:

- **Files tab** (default): Current file tree
- **Search tab**: Global search panel

### Component: `GlobalSearch`

```
┌─────────────────────────┐
│ [search input_________] │
│ [Aa] [W] [.*]           │
│ [replace input________] │
│ [Replace All]           │
├─────────────────────────┤
│ ▼ notes/ideas.md (3)    │
│   ...text with **match**│
│   ...another **match**  │
│                         │
│ ▼ journal/today.md (1)  │
│   ...here is a **match**│
└─────────────────────────┘
```

- Results grouped by file (path relative to rootPath)
- Each result shows the matching line with the term highlighted
- Click a result → opens the file and activates FindBar with the same search term
- Replace per occurrence, Replace All per file, Replace All globally (with confirmation dialog)

### Search Engine

- `searchInFiles()` function added to `filesystem.ts`
- Reads all `.md` files using existing `readFile` and `loadFileTree` utilities
- Search in JavaScript with `String.includes` / `RegExp`
- Debounce 300ms on input
- Runs on main thread (sufficient for markdown note workspaces)

### Replace (Global)

- Operates on raw markdown via `writeFile`
- If the replaced file is currently open in the editor, content reloads
- Confirmation dialog for bulk replace: "Replace X occurrences in Y files?"

## Files

### New Files

| File | Purpose |
|------|---------|
| `src/extensions/search-and-replace.ts` | Tiptap extension with ProseMirror search/decoration plugin |
| `src/components/FindBar.tsx` | In-file search/replace bar |
| `src/components/GlobalSearch.tsx` | Global search panel for sidebar |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/Editor.tsx` | Add SearchAndReplace extension, render FindBar, handle Cmd+F |
| `src/components/Sidebar.tsx` | Add tabs (Files/Search), render GlobalSearch |
| `src/App.tsx` | Add searchMode state, Cmd+Shift+F handler, file-open-at-position callback |
| `src/services/filesystem.ts` | Add `searchInFiles()` and `collectAllFiles()` functions |
| `src/styles.css` | Styles for FindBar, GlobalSearch, sidebar tabs, search highlights |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+F` | Open FindBar (in-file search) |
| `Cmd+Shift+F` | Switch sidebar to global search |
| `Escape` | Close FindBar / return to files view |
| `Enter` | Next match |
| `Shift+Enter` | Previous match |

## Highlights

- All matches: `background: var(--accent-soft)` (soft yellow)
- Active match: `background: var(--accent)` with contrasting text
- Global search results: search term in bold/accent color inline
