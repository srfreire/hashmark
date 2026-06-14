# LaTeX Side-by-Side Preview — Design

**Date:** 2026-06-14
**Status:** Design approved, ready for implementation plan
**Owner:** SrFreiRe

## Goal

Open `.tex` files in Hashmark with a split view: source editor on the left, live-rendered HTML preview on the right. Comparable in feel to Overleaf's editor pane, but **without compiling to PDF**. The preview is an HTML rendering of the `.tex` source, not a fidelity-perfect typeset output.

## Non-Goals

- Compiling to PDF (out of scope; that's a different product).
- Multi-file LaTeX projects via `\input` / `\include` (v1 treats the open `.tex` as standalone).
- Bibliography rendering from `.bib` (`\cite` / `\bibliography` render as placeholders).
- Editing/refactoring the markdown editor for `.md` files (untouched).

## Scope

What the preview must render in v1:
- Document structure: `\section`, `\subsection`, `\subsubsection`, `\paragraph`, paragraphs.
- Emphasis: `\textbf`, `\textit`, `\emph`, `\underline`, `\texttt`.
- Lists: `itemize`, `enumerate`, nested.
- Math: inline (`$...$`, `\(...\)`), display (`$$...$$`, `\[...\]`), labeled envs (`equation`, `align`, `gather`, etc.) — via KaTeX inside the rendering library.
- Figures: `\includegraphics{path}` resolves paths **relative to the open `.tex`** file and loads local images via Tauri's `convertFileSrc()`.
- Tables: simple `tabular` (multi-column rendering is best-effort).
- Footnotes, `\href`, `\url`.
- Placeholders for things v1 deliberately skips: `\cite{...}` renders as `[?]`, `\bibliography` renders as a small notice; `\input` is shown literally.

## User-Facing Behavior

- Click a `.tex` in the sidebar → tab opens with split view (source left, preview right).
- Click a `.md` afterwards → behaves exactly as today (no regression).
- Type in the source → preview updates after 300ms of inactivity.
- Cmd+S saves; auto-save fires 1s after last edit.
- Drag the vertical divider to change the source/preview ratio; ratio persists across sessions.
- Cmd+F inside the source opens CodeMirror's native search panel.
- Dark mode toggle (existing) themes the preview as well.

## Architecture

### Routing by extension

`App.tsx` already maps each entry in `openFiles` to an `<Editor>` instance. We add a single branch point: pick the component to mount based on the file's extension.

- `.md`, `.markdown` → `<Editor>` (existing Tiptap editor, unchanged).
- `.tex` → `<TexView>` (new).
- Anything else → `<Editor>` (default, current behavior preserved).

The sidebar, tabs, quick-open (Cmd+P), global search, find-in-files — everything else stays identical. The user opens files the same way; only the view inside the tab differs.

### Component tree

```
TexView (split layout + drag handle + auto-save + revision handling)
 ├─ TexSourceEditor   (CodeMirror 6, LaTeX highlighting, Cmd+S, Cmd+F)
 └─ TexPreview        (debounced render, error banner, scroll, theme)
       └─ TexRenderer (abstraction: source + baseDir → { html, error })
              └─ adapter: latex.js (v1)
```

### Files added

```
src/
  components/
    TexView.tsx
    TexSourceEditor.tsx
    TexPreview.tsx
  services/
    tex-renderer.ts            # interface + result types
    tex-renderer-latexjs.ts    # latex.js adapter
scripts/
  tex-spike.ts                 # validation spike (run before UI work)
```

### Files modified

- `src/App.tsx` — single branch in the `openFiles.map(...)` render to route by extension.
- `package.json` — add `latex.js`, `codemirror`, `@codemirror/lang-stex`, `@codemirror/search`, `@codemirror/view`, `@codemirror/state`, `@codemirror/commands`, and dev: `vitest`.
- `src/styles.css` — split layout styles, divider handle, preview container theming.

### No Rust changes

The backend already reads and writes arbitrary files. `.tex` is plain text. `convertFileSrc` is available from `@tauri-apps/api/core`.

## Components

### `TexView.tsx`

Owner of:
- Split ratio state (number 0–1, persisted in `localStorage` under `hashmark-tex-split-ratio`, default 0.5).
- Drag handle logic: `mousedown` on handle → `mousemove` updates ratio → `mouseup` ends. No body text selection during drag.
- Source content state (`source: string`).
- Save status lifecycle (replicates `Editor.tsx`'s `onSaveStatusChange` pattern).
- Auto-save debounce: 1s after last `onChange`.
- Cmd+S handler: immediate save.
- External-change handling via `revision` prop: on bump, if no unsaved edits, reload from disk while preserving CodeMirror scroll position.

Props (mirror `Editor.tsx` for compatibility with `App.tsx`):
- `filePath: string`
- `revision?: number`
- `initialContent?: string`
- `onSaveStatusChange: (s: "saved" | "saving" | "unsaved") => void`
- `onContentChange?: (path: string, content: string) => void`
- `onFileSaved?: (path: string) => void`
- `onWordCountChange?: (count: number) => void` — invoked with an approximate count: strip `\cmd{...}`/`\cmd[...]`, math (`$...$`, `\(...\)`, `\[...\]`), and `%` comments from the source, then count whitespace-separated tokens. Approximate but better than the alternative — the topbar currently reads `wordCounts.get(activeFile) ?? 0` and would otherwise display "0 words" for every `.tex`.
- `onHeadingsChange?: (...)` — accepted but **not invoked** in v1. The sidebar's outline tab will be empty for `.tex` files; populating it from `\section` is out of v1.

### `TexSourceEditor.tsx`

Thin wrapper around CodeMirror 6. Configuration:
- Extensions: `basicSetup`, `StreamLanguage.define(stex)`, `search()`, `keymap` for save.
- Theme: custom theme that pulls from Hashmark's CSS variables (`--bg-editor`, `--text-primary`, `--accent`, etc.). One theme spec for light, one for dark; switched via the `.dark` class on `<html>` (observed with a `MutationObserver` or by re-mounting on theme change).
- Line numbers: off by default (matches Hashmark's minimal aesthetic). Easy to toggle later.
- API: `value`, `onChange(text)`, `onSave()`, `onFocus`.
- Cmd+F: CodeMirror's native `openSearchPanel` command, styled to fit the app.

**Event scoping note:** `Editor.tsx` registers a window-level `keydown` listener for Cmd+F that opens its FindBar. With multiple tabs open, those listeners stay live in hidden Editor instances. To prevent CodeMirror's Cmd+F (in a `.tex` tab) from also triggering FindBars in hidden markdown tabs, the CodeMirror keymap entry for Cmd+F calls `event.stopPropagation()` after handling. Confirmed approach: register Cmd+F via `Prec.high(keymap.of([...]))` with a handler that runs `openSearchPanel(view)` and returns `true`, plus a low-level `EditorView.domEventHandlers({ keydown })` that stops propagation when the key matches.

### `TexPreview.tsx`

Receives `source` and `baseDir` as props. Internal state: `{ html: string | null, error: string | null, lastGoodHtml: string | null }`.

Behavior:
- On `source` change, start a 300ms debounce timer.
- On timer fire, call `texRenderer.render(source, { baseDir })`.
- On success: set `html = result.html`, `lastGoodHtml = result.html`, `error = null`.
- On failure: keep `html = lastGoodHtml`, set `error = result.error`. Show a small amber banner at the top of the preview with the error message (truncated, with a tooltip for the full text).
- If `lastGoodHtml === null` and there's an error, show an empty state instead of the banner ("No se pudo renderizar — corrige el LaTeX para ver el preview").
- HTML is injected via `dangerouslySetInnerHTML` into a container `<div className="tex-preview">`. **No Shadow DOM.**
- Container is scrollable independently of the source editor.
- Theming: all preview styles use Hashmark's CSS variables so dark mode works.

### `services/tex-renderer.ts`

Interface and types only — no implementation here.

```ts
export interface TexRenderResult {
  html: string | null;
  error: string | null;
}

export interface TexRendererOptions {
  baseDir: string;
}

export interface TexRenderer {
  render(source: string, opts: TexRendererOptions): Promise<TexRenderResult>;
}
```

A factory `getTexRenderer(): Promise<TexRenderer>` returns the active adapter (latex.js in v1) via dynamic `import()` so the LaTeX dependency is lazy-loaded.

### `services/tex-renderer-latexjs.ts`

Implements `TexRenderer` using latex.js. Responsibilities:
- Lazily import `latex.js`.
- Configure the `Generator` to emit plain HTML (no Shadow DOM). If the `Generator` API enforces Shadow DOM, fall back to extracting `innerHTML` from the generated fragment.
- Wrap `parse()` in try/catch, returning `{ html: null, error: e.message }` instead of throwing.
- Post-process the generated HTML to rewrite `<img src>`:
  - Absolute URLs → unchanged.
  - Absolute filesystem paths → `convertFileSrc(path)`.
  - Relative paths → resolve against `baseDir`, then `convertFileSrc`.
- Return `{ html: rewrittenHtml, error: null }` on success.

## Data Flow

### Opening a `.tex`

1. User clicks `foo.tex` in sidebar.
2. `App.tsx` appends to `openFiles`, sets `activeFile`.
3. Render branch sees `.tex` extension, mounts `<TexView filePath="…/foo.tex" />`.
4. `TexView` checks `initialContent` (i.e. `modifiedFiles.get(filePath)` from `App.tsx`).
   - If present → use as initial source (resumes unsaved edit).
   - Else → `readFile(filePath)` and use the contents.
5. CodeMirror mounts with the source. Initial render scheduled via `requestIdleCallback` to avoid blocking the mount.

### Typing

1. CodeMirror fires `onChange(text)`.
2. `TexView` updates `source` state and calls `onContentChange(filePath, text)` → `App.tsx` stores in `modifiedFiles`.
3. `TexView` calls `onSaveStatusChange("unsaved")`.
4. Two independent debounce timers (re-)start:
   - **Render (300ms):** at expiry, `TexPreview` calls `texRenderer.render(source, { baseDir })`.
   - **Auto-save (1s):** at expiry, `TexView` calls `writeFile(filePath, source)` → on success, `onFileSaved(filePath)` → `App.tsx` clears `modifiedFiles` entry, `onSaveStatusChange("saved")`.

Timers are independent: preview stays live regardless of save state; saves don't force a re-render.

### Explicit save (Cmd+S)

CodeMirror's keymap calls the wrapper's `onSave()` → same `writeFile` path as auto-save, but immediate. The auto-save timer is cancelled.

### External file change

`App.tsx` already polls `mtime` and bumps `revision`. `TexView` reacts in a `useEffect`:
- If `modifiedFiles.has(filePath)` → ignore (don't overwrite in-progress edits; matches `Editor.tsx`).
- Else → `readFile()`, capture CodeMirror scroll, `dispatch` a full-document replacement, restore scroll on the next animation frame.

### Image resolution

`baseDir = dirname(filePath)`, recomputed when `filePath` changes (renames are handled by `App.tsx`'s `handleRenameItem`).

In the adapter's HTML post-processing pass: for each `<img>`:
- `src` starts with `http://`, `https://`, `data:`, `asset:` → unchanged.
- `src` is an absolute path → `convertFileSrc(src)`.
- `src` is relative → `convertFileSrc(resolve(baseDir, src))`.
- Missing files: left as broken `<img>` so the browser shows alt text. No global error.

### Tab switching

Same pattern as `Editor.tsx`: each `<TexView>` is wrapped in a `<div style={{ display: path === activeFile ? undefined : "none" }}>`. CodeMirror state, scroll, and undo history are preserved across switches.

### Tab close

`App.tsx` removes from `openFiles` → React unmounts `<TexView>` → CodeMirror destroyed via the `useEffect` cleanup. Debounced timers cleared in the same cleanup.

## Error Handling

### Parser errors (most frequent)

Mid-typing, latex.js will frequently fail on incomplete input (`\begin{equ` not yet closed, dangling `$`). Handling:
- `TexPreview` keeps `lastGoodHtml`.
- On a failed render, the preview continues showing `lastGoodHtml`. A small amber pill banner appears at the top of the preview pane: truncated error text (~80 chars), full text on hover.
- On the next successful render, banner clears and `lastGoodHtml` updates.
- If `lastGoodHtml === null` (file opened in a broken state with no prior success), show an empty state: "No se pudo renderizar — corrige el LaTeX para ver el preview".

### File read failure

`readFile()` may fail (file deleted between sidebar click and mount). `TexView` shows "No se pudo abrir el archivo" and logs to console. Matches `Editor.tsx`'s current minimal handling; not adding modals in v1.

### File write failure

If `writeFile()` rejects (auto-save or Cmd+S), the save status stays `unsaved`. Matches current markdown behavior. Not surfacing detailed errors in v1.

### Render performance

latex.js parses synchronously on the main thread. Expected to be <50ms for short documents, potentially several hundred ms for long ones.
- 300ms debounce already filters intermediate states.
- If real-world testing shows jank, wrap the render call in `requestIdleCallback` before invoking.
- Web Workers are deferred — latex.js touches DOM internally, so worker support is non-trivial. If needed later, it's isolated to the adapter.

### Missing images

Already covered in data flow: broken `<img>` with alt fallback. No retry, no global error.

### latex.js init failure

Lazy `import()` may fail (extremely rare; bundling issue). `TexPreview` shows "LaTeX renderer no disponible". The source editor on the left keeps working — typing and saving still function.

### baseDir changes (rename/move)

`App.tsx`'s `handleRenameItem` already updates `openFiles` and `activeFile`. `TexView` reacts to the new `filePath` and recomputes `baseDir`. If a `.tex` is moved to a different directory, relative `\includegraphics` paths may break — expected and correct (relative paths are relative to the `.tex`).

## Layout & Styling

### Split layout

`TexView` is a flexbox row:
- Left pane: width = `ratio * 100%`.
- Divider: 4px wide draggable handle, hover state shows accent color.
- Right pane: width = `(1 - ratio) * 100%`.
- Both panes have `overflow: hidden`; their children handle their own scroll.

### Divider drag

- `onMouseDown` on handle: captures `clientX` start, adds `document`-level `mousemove` and `mouseup` listeners, sets `body { user-select: none; cursor: col-resize }`.
- `mousemove`: computes new ratio from delta vs. container width, clamps to `[0.15, 0.85]`.
- `mouseup`: removes listeners, persists ratio to `localStorage`.

### Preview styling

Defined in `styles.css` under `.tex-preview`. Uses Hashmark's CSS variables (`--text-primary`, `--bg-editor`, etc.) so dark mode works automatically. Typography matches the editor body (Source Serif 4) for visual consistency with the markdown editor.

KaTeX's CSS is imported globally (`katex/dist/katex.min.css`) — required for math rendering regardless of theme.

### CodeMirror theme

Two `EditorView.theme` specs (light, dark), built in `TexSourceEditor.tsx`, swapped based on the `.dark` class on `<html>`. Both use Hashmark CSS variables — defined in JS via `getComputedStyle(document.documentElement).getPropertyValue('--bg-editor')` etc., re-read when theme changes.

## Testing

Hashmark has no existing test infrastructure. Plan is pragmatic, not exhaustive.

### Spike validation (blocking, before any UI work)

`scripts/tex-spike.ts`:
- Loads latex.js.
- Parses 2–3 real `.tex` documents: one the user supplies (paper / exam / notes), one synthetic with common math environments, lists, and `\includegraphics`.
- Prints rendered HTML length and render time.
- Verifies: parses without throwing, HTML is non-empty, math output contains KaTeX markup, image refs are present as `<img>`.

**Gate:** if latex.js fails on common LaTeX the user actually writes, switch to plan B (KaTeX + custom mini-transpiler) before building UI.

### Unit tests (Vitest)

Add Vitest as a dev dependency (single dep, integrates with Vite without ceremony). Cover only pure logic in `tex-renderer-latexjs.ts`:

1. **Image src rewriting:** input HTML with relative / absolute / URL paths → output has correct `convertFileSrc`-ified absolutes, URLs unchanged.
2. **Error wrapping:** invalid LaTeX input returns `{ html: null, error: string }`, does not throw.
3. **Success passthrough:** valid LaTeX returns `{ html: string, error: null }`.

No React component tests in v1 (no testing-library setup, low ROI for a solo dev).

### Manual verification checklist

Run `npm run tauri dev`, then:

- [ ] Open a `.tex` from sidebar → split view appears.
- [ ] Open a `.md` after → markdown editor appears (regression check).
- [ ] Type `\section{Test}`, `$x^2$`, `\begin{itemize}\item A\item B\end{itemize}` → preview updates after ~300ms.
- [ ] Break syntax mid-typing → amber banner appears, last good preview remains visible.
- [ ] Fix syntax → banner clears, preview updates.
- [ ] Cmd+S saves immediately; auto-save fires 1s after last edit.
- [ ] Cmd+F inside `.tex` opens CodeMirror's search panel.
- [ ] Drag the divider → ratio changes; reopen the app → ratio is restored.
- [ ] Edit `.tex` in an external app while Hashmark has it open → CodeMirror reloads without losing scroll position (only when there are no unsaved local changes).
- [ ] Toggle dark mode → preview re-themes correctly.
- [ ] Close tab via Cmd+W, reopen via Cmd+P → state restored.
- [ ] `\includegraphics{foo.png}` with `foo.png` next to the `.tex` → image renders.
- [ ] `\cite{bar}` → renders as `[?]` placeholder.

## Dependencies

Production:
- `latex.js` — LaTeX → HTML renderer (includes KaTeX).
- `codemirror` (meta) plus `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/search`, `@codemirror/language`, `@codemirror/legacy-modes` (for `stex`).

Dev:
- `vitest` — for the three unit tests in the adapter.

## Risks & Open Questions

1. **latex.js maintenance.** Slow upstream development is a known risk. Mitigated by the `TexRenderer` abstraction — swapping to a custom transpiler (plan B) is a single-file change.
2. **Shadow DOM coupling.** latex.js historically used Shadow DOM by default. If the `Generator` API doesn't allow opting out cleanly, fall back to extracting `innerHTML` from the produced fragment and dropping it into our container. Confirm during the spike.
3. **KaTeX CSS bundle.** `katex.min.css` is ~25 KB gzipped. Acceptable.
4. **CodeMirror bundle.** ~120 KB gzipped. Acceptable for desktop.
5. **First-render delay on first `.tex` open.** Because of lazy `import()`, first preview may take an extra ~50–100ms while the chunk loads. Show a brief "Loading renderer…" inside the preview pane if it exceeds 200ms.

## Out of v1 (Possible Future Work)

- Multi-file projects (`\input`, `\include`).
- `.bib` parsing and real citation rendering.
- Synchronized scroll between source and preview.
- Outline (sidebar's outline view) populated from `\section` structure.
- Word count for `.tex` (the topbar word count is empty for `.tex` in v1).
- Web Worker for the parser if performance becomes an issue on large files.
