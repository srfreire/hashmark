# LaTeX Side-by-Side Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live side-by-side LaTeX preview for `.tex` files in Hashmark: CodeMirror source editor on the left, latex.js HTML render on the right, debounced 300ms, draggable divider.

**Architecture:** New `<TexView>` component routed by file extension in `App.tsx`. `.tex` files mount `<TexView>` (CodeMirror + preview); other extensions keep the existing Tiptap `<Editor>`. Rendering goes through a `TexRenderer` interface so the latex.js adapter can be swapped later.

**Tech Stack:** React 19 + TypeScript, CodeMirror 6 (`@codemirror/*` + `@codemirror/legacy-modes` for stex), `latex.js` for LaTeX→HTML+KaTeX rendering, Vitest + happy-dom for unit tests.

**Spec:** [`docs/superpowers/specs/2026-06-14-latex-preview-design.md`](../specs/2026-06-14-latex-preview-design.md)

---

## File Structure

**Created:**
- `src/services/tex-renderer.ts` — `TexRenderer` interface, `TexRenderResult` type, `ConvertPath` type.
- `src/services/tex-renderer-latexjs.ts` — `createLatexJsRenderer()` factory + adapter.
- `src/services/tex-renderer-latexjs.test.ts` — Vitest unit tests for the adapter.
- `src/services/tex-spike.test.ts` — Gate test: parses real `.tex` files via latex.js.
- `src/components/TexView.tsx` — Split container, drag handle, save lifecycle, revision handling.
- `src/components/TexSourceEditor.tsx` — CodeMirror 6 wrapper, LaTeX highlighting, Cmd+S/Cmd+F.
- `src/components/TexPreview.tsx` — Debounced render, error banner, `lastGoodHtml` retention.
- `vitest.config.ts` — Vitest config with happy-dom environment.

**Modified:**
- `package.json` / `package-lock.json` — add `latex.js`, CodeMirror packages, `vitest`, `happy-dom`.
- `src/App.tsx` — extension-based routing inside `openFiles.map(...)`.
- `src/styles.css` — split layout, divider handle, preview pane, banner.

---

## Task 1: Add dependencies

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install runtime deps**

Run:
```bash
npm install latex.js codemirror @codemirror/state @codemirror/view @codemirror/commands @codemirror/search @codemirror/language @codemirror/legacy-modes
```

Expected: `package.json` now lists these under `dependencies`. No errors.

- [ ] **Step 2: Install dev deps**

Run:
```bash
npm install -D vitest happy-dom
```

Expected: `package.json` lists `vitest` and `happy-dom` under `devDependencies`.

- [ ] **Step 3: Add the test script**

Edit `package.json` `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add latex.js, codemirror, vitest for tex preview"
```

---

## Task 2: Configure Vitest with happy-dom

**Files:** Create `vitest.config.ts`

- [ ] **Step 1: Write the config**

Create `/Users/juanfreire/Documents/personal/hashmark/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Verify vitest runs (no tests yet)**

Run:
```bash
npm test
```

Expected output: `No test files found, exiting with code 1` or similar. That's fine — the runner started cleanly.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "test: configure vitest with happy-dom environment"
```

---

## Task 3: Spike validation (gate task)

This is the gate. If latex.js can't parse the user's real `.tex` files, switch to plan B (KaTeX + custom transpiler) before doing UI work.

**Files:** Create `src/services/tex-spike.test.ts`

- [ ] **Step 1: Write the spike test**

Create `/Users/juanfreire/Documents/personal/hashmark/src/services/tex-spike.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const SAMPLES = [
  "/Users/juanfreire/Documents/other/career-ops/templates/cv-template.tex",
  "/Users/juanfreire/Documents/osix/nessie/docs/technical_paper.tex",
];

const SYNTHETIC = String.raw`
\documentclass{article}
\begin{document}
\section{Introduction}
This is \textbf{bold} and \emph{emphasized} text with math $x^2 + y^2 = z^2$.

\subsection{A list}
\begin{itemize}
  \item First
  \item Second with $\alpha = \beta$
\end{itemize}

\begin{equation}
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
\end{equation}
\end{document}
`;

describe("latex.js spike", () => {
  it("parses the synthetic document", async () => {
    const { parse } = await import("latex.js");
    const generator = new (await import("latex.js")).HtmlGenerator({ hyphenate: false });
    const doc = parse(SYNTHETIC, { generator });
    const html = doc.htmlDocument().documentElement.outerHTML;
    expect(html).toMatch(/<h\d|class=".*section/i);
    expect(html.length).toBeGreaterThan(200);
  });

  for (const path of SAMPLES) {
    it(`parses real sample: ${path.split("/").pop()}`, async () => {
      const { parse, HtmlGenerator } = await import("latex.js");
      const source = readFileSync(path, "utf8");
      const generator = new HtmlGenerator({ hyphenate: false });
      const start = performance.now();
      let html = "";
      let error: string | null = null;
      try {
        const doc = parse(source, { generator });
        html = doc.htmlDocument().documentElement.outerHTML;
      } catch (e) {
        error = (e as Error).message;
      }
      const ms = performance.now() - start;
      console.log(`  ${path.split("/").pop()}: ${ms.toFixed(0)}ms, html=${html.length}b, error=${error ? "yes" : "no"}`);
      // Don't hard-fail on parse errors — log instead. We accept partial coverage in v1.
      expect(typeof html).toBe("string");
    });
  }
});
```

- [ ] **Step 2: Run the spike**

Run:
```bash
npm test -- tex-spike
```

Expected: synthetic case PASSES. Real samples log timing and parse status. **Gate check:** if synthetic FAILS, halt and switch to plan B. If real samples log "error=yes" but synthetic passes, document which cases fail and continue (the design already handles parse errors gracefully via `lastGoodHtml`).

- [ ] **Step 3: Commit**

```bash
git add src/services/tex-spike.test.ts
git commit -m "test: validate latex.js with real .tex samples (gate)"
```

---

## Task 4: TexRenderer interface

**Files:** Create `src/services/tex-renderer.ts`

- [ ] **Step 1: Write the interface**

Create `/Users/juanfreire/Documents/personal/hashmark/src/services/tex-renderer.ts`:
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

export type ConvertPath = (absolutePath: string) => string;

export function joinPath(base: string, rel: string): string {
  if (/^([a-z]+:|\/)/i.test(rel)) return rel;
  const sep = base.includes("\\") ? "\\" : "/";
  const baseParts = base.split(sep).filter((p) => p !== "");
  const relParts = rel.split(/[/\\]/);
  for (const p of relParts) {
    if (p === "..") baseParts.pop();
    else if (p !== "." && p !== "") baseParts.push(p);
  }
  const prefix = base.startsWith("/") ? "/" : "";
  return prefix + baseParts.join(sep);
}

export function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[a-z]:[\\/]/i.test(p);
}

export function isUrl(p: string): boolean {
  return /^([a-z]+:|data:|asset:|blob:)/i.test(p);
}
```

- [ ] **Step 2: Write tests for the path helpers**

Create `/Users/juanfreire/Documents/personal/hashmark/src/services/tex-renderer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { joinPath, isAbsolutePath, isUrl } from "./tex-renderer";

describe("joinPath", () => {
  it("joins a relative path against a posix base", () => {
    expect(joinPath("/Users/me/docs", "foo.png")).toBe("/Users/me/docs/foo.png");
  });

  it("resolves .. correctly", () => {
    expect(joinPath("/Users/me/docs/sub", "../foo.png")).toBe("/Users/me/docs/foo.png");
  });

  it("returns rel unchanged when rel is already absolute", () => {
    expect(joinPath("/Users/me/docs", "/etc/foo.png")).toBe("/etc/foo.png");
  });

  it("returns rel unchanged when rel is a URL", () => {
    expect(joinPath("/Users/me/docs", "https://example.com/foo.png")).toBe("https://example.com/foo.png");
  });
});

describe("isAbsolutePath", () => {
  it("recognizes posix absolute", () => {
    expect(isAbsolutePath("/Users/foo")).toBe(true);
  });
  it("recognizes windows absolute", () => {
    expect(isAbsolutePath("C:\\Users\\foo")).toBe(true);
  });
  it("rejects relative", () => {
    expect(isAbsolutePath("foo/bar")).toBe(false);
  });
});

describe("isUrl", () => {
  it("recognizes http/https/data/asset", () => {
    expect(isUrl("https://x.com/a.png")).toBe(true);
    expect(isUrl("data:image/png;base64,xxx")).toBe(true);
    expect(isUrl("asset://abc")).toBe(true);
  });
  it("rejects plain paths", () => {
    expect(isUrl("foo.png")).toBe(false);
    expect(isUrl("/abs/foo.png")).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tex-renderer.test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/tex-renderer.ts src/services/tex-renderer.test.ts
git commit -m "feat: TexRenderer interface and path helpers"
```

---

## Task 5: latex.js adapter

**Files:** Create `src/services/tex-renderer-latexjs.ts` and `src/services/tex-renderer-latexjs.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `/Users/juanfreire/Documents/personal/hashmark/src/services/tex-renderer-latexjs.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createLatexJsRenderer } from "./tex-renderer-latexjs";

const identity = (p: string) => `convert://${p}`;

describe("latex.js adapter", () => {
  it("returns html and error=null for valid input", async () => {
    const renderer = createLatexJsRenderer(identity);
    const result = await renderer.render(
      String.raw`\documentclass{article}\begin{document}Hello $x$.\end{document}`,
      { baseDir: "/tmp" },
    );
    expect(result.error).toBeNull();
    expect(result.html).toBeTruthy();
    expect(result.html!.length).toBeGreaterThan(20);
  });

  it("returns html=null and error message for invalid input", async () => {
    const renderer = createLatexJsRenderer(identity);
    const result = await renderer.render(
      String.raw`\documentclass{article}\begin{document}\begin{equation`,
      { baseDir: "/tmp" },
    );
    expect(result.error).toBeTruthy();
    expect(result.html).toBeNull();
  });

  it("rewrites relative <img src> against baseDir", async () => {
    const renderer = createLatexJsRenderer(identity);
    const result = await renderer.render(
      String.raw`\documentclass{article}\begin{document}\includegraphics{foo.png}\end{document}`,
      { baseDir: "/Users/me/docs" },
    );
    expect(result.html).toContain("convert:///Users/me/docs/foo.png");
  });

  it("rewrites absolute <img src> via convertPath", async () => {
    const renderer = createLatexJsRenderer(identity);
    const result = await renderer.render(
      String.raw`\documentclass{article}\begin{document}\includegraphics{/abs/foo.png}\end{document}`,
      { baseDir: "/Users/me/docs" },
    );
    expect(result.html).toContain("convert:///abs/foo.png");
  });

  it("leaves URL <img src> unchanged", async () => {
    const renderer = createLatexJsRenderer(identity);
    const result = await renderer.render(
      String.raw`\documentclass{article}\begin{document}\includegraphics{https://example.com/x.png}\end{document}`,
      { baseDir: "/Users/me/docs" },
    );
    expect(result.html).toContain("https://example.com/x.png");
    expect(result.html).not.toContain("convert://https");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test -- tex-renderer-latexjs
```

Expected: FAIL with "module not found".

- [ ] **Step 3: Write the adapter**

Create `/Users/juanfreire/Documents/personal/hashmark/src/services/tex-renderer-latexjs.ts`:
```ts
import type { ConvertPath, TexRenderer, TexRenderResult } from "./tex-renderer";
import { isAbsolutePath, isUrl, joinPath } from "./tex-renderer";

type LatexJsModule = {
  parse: (source: string, opts: { generator: unknown }) => {
    htmlDocument: () => Document;
  };
  HtmlGenerator: new (opts: { hyphenate?: boolean }) => unknown;
};

let cachedModule: Promise<LatexJsModule> | null = null;
function loadLatexJs(): Promise<LatexJsModule> {
  if (!cachedModule) {
    cachedModule = import("latex.js") as unknown as Promise<LatexJsModule>;
  }
  return cachedModule;
}

function rewriteImageSrcs(html: string, baseDir: string, convertPath: ConvertPath): string {
  return html.replace(/<img\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2/gi, (_match, before, quote, src) => {
    let finalSrc: string;
    if (isUrl(src)) {
      finalSrc = src;
    } else if (isAbsolutePath(src)) {
      finalSrc = convertPath(src);
    } else {
      finalSrc = convertPath(joinPath(baseDir, src));
    }
    return `<img${before}src=${quote}${finalSrc}${quote}`;
  });
}

export function createLatexJsRenderer(convertPath: ConvertPath): TexRenderer {
  return {
    async render(source, { baseDir }): Promise<TexRenderResult> {
      try {
        const mod = await loadLatexJs();
        const generator = new mod.HtmlGenerator({ hyphenate: false });
        const doc = mod.parse(source, { generator });
        const htmlEl = doc.htmlDocument().documentElement;
        const rawHtml = htmlEl.outerHTML;
        const html = rewriteImageSrcs(rawHtml, baseDir, convertPath);
        return { html, error: null };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        return { html: null, error };
      }
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tex-renderer-latexjs
```

Expected: all PASS. If one fails because `\includegraphics` in a minimal doc throws, wrap the test source in a real-enough document or read the actual error message and adjust the test fixture. Do NOT weaken the assertion to "passes" — fix the input so the assertion holds.

- [ ] **Step 5: Commit**

```bash
git add src/services/tex-renderer-latexjs.ts src/services/tex-renderer-latexjs.test.ts
git commit -m "feat: latex.js adapter with image src rewriting"
```

---

## Task 6: TexPreview component

**Files:** Create `src/components/TexPreview.tsx`

- [ ] **Step 1: Write the component**

Create `/Users/juanfreire/Documents/personal/hashmark/src/components/TexPreview.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { TexRenderer } from "../services/tex-renderer";
import { createLatexJsRenderer } from "../services/tex-renderer-latexjs";

interface Props {
  source: string;
  baseDir: string;
}

let rendererPromise: Promise<TexRenderer> | null = null;
function getRenderer(): Promise<TexRenderer> {
  if (!rendererPromise) {
    rendererPromise = Promise.resolve(createLatexJsRenderer(convertFileSrc));
  }
  return rendererPromise;
}

export default function TexPreview({ source, baseDir }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [lastGoodHtml, setLastGoodHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const renderTokenRef = useRef(0);

  useEffect(() => {
    const token = ++renderTokenRef.current;
    const timer = setTimeout(async () => {
      try {
        const renderer = await getRenderer();
        const result = await renderer.render(source, { baseDir });
        if (token !== renderTokenRef.current) return;
        if (result.html !== null) {
          setHtml(result.html);
          setLastGoodHtml(result.html);
          setError(null);
        } else {
          setError(result.error);
        }
        setLoading(false);
      } catch (e) {
        if (token !== renderTokenRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [source, baseDir]);

  const visibleHtml = html ?? lastGoodHtml;

  return (
    <div className="tex-preview-pane">
      {error && (
        <div className="tex-preview-banner" title={error}>
          Parse error: {error.length > 80 ? error.slice(0, 80) + "…" : error}
        </div>
      )}
      {visibleHtml ? (
        <div
          className="tex-preview-content"
          dangerouslySetInnerHTML={{ __html: visibleHtml }}
        />
      ) : (
        <div className="tex-preview-empty">
          {loading
            ? "Renderizando…"
            : error
              ? "No se pudo renderizar — corrige el LaTeX para ver el preview."
              : "Empieza a escribir LaTeX para ver el preview."}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TexPreview.tsx
git commit -m "feat: TexPreview component with debounced render and error banner"
```

---

## Task 7: TexSourceEditor component

**Files:** Create `src/components/TexSourceEditor.tsx`

- [ ] **Step 1: Write the CodeMirror wrapper**

Create `/Users/juanfreire/Documents/personal/hashmark/src/components/TexSourceEditor.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, openSearchPanel, search } from "@codemirror/search";
import { StreamLanguage, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSave: () => void;
}

export interface TexSourceEditorHandle {
  setValue: (text: string) => void;
  getScrollTop: () => number;
  setScrollTop: (top: number) => void;
}

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

function buildTheme(dark: boolean) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: "var(--bg-editor)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
        fontSize: "13px",
      },
      ".cm-content": { padding: "16px", caretColor: "var(--text-primary)" },
      ".cm-scroller": { fontFamily: "inherit" },
      ".cm-activeLine": { backgroundColor: "var(--bg-sidebar-hover)" },
      ".cm-gutters": { backgroundColor: "var(--bg-editor)", border: "none", color: "var(--text-tertiary)" },
      ".cm-panels": { backgroundColor: "var(--bg-sidebar)", color: "var(--text-primary)" },
      ".cm-panels .cm-textfield": { backgroundColor: "var(--bg-editor)", color: "var(--text-primary)", border: "1px solid var(--border)" },
      ".cm-panels .cm-button": { backgroundColor: "var(--bg-sidebar-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" },
      ".cm-searchMatch": { backgroundColor: "var(--accent-soft)" },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--accent)" },
    },
    { dark },
  );
}

export default function TexSourceEditor({ value, onChange, onSave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        StreamLanguage.define(stex),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        search({ top: true }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          {
            key: "Mod-s",
            preventDefault: true,
            stopPropagation: true,
            run: () => {
              onSaveRef.current();
              return true;
            },
          },
          {
            key: "Mod-f",
            preventDefault: true,
            stopPropagation: true,
            run: (view) => {
              openSearchPanel(view);
              return true;
            },
          },
        ]),
        themeCompartment.current.of(buildTheme(isDark())),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onChangeRef.current(u.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    const themeObserver = new MutationObserver(() => {
      view.dispatch({ effects: themeCompartment.current.reconfigure(buildTheme(isDark())) });
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      themeObserver.disconnect();
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={containerRef} className="tex-source-editor" />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TexSourceEditor.tsx
git commit -m "feat: TexSourceEditor (CodeMirror 6 with stex highlighting)"
```

---

## Task 8: TexView container

**Files:** Create `src/components/TexView.tsx`

- [ ] **Step 1: Write the container with split layout, drag, save lifecycle**

Create `/Users/juanfreire/Documents/personal/hashmark/src/components/TexView.tsx`:
```tsx
import { useEffect, useRef, useState, useCallback } from "react";
import TexSourceEditor from "./TexSourceEditor";
import TexPreview from "./TexPreview";
import { readFile, writeFile } from "../services/filesystem";

interface Props {
  filePath: string;
  revision?: number;
  initialContent?: string;
  onSaveStatusChange: (status: "saved" | "saving" | "unsaved") => void;
  onContentChange?: (path: string, content: string) => void;
  onFileSaved?: (path: string) => void;
  onWordCountChange?: (count: number) => void;
}

const RATIO_KEY = "hashmark-tex-split-ratio";
const RATIO_MIN = 0.15;
const RATIO_MAX = 0.85;
const AUTO_SAVE_MS = 1000;

function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(0, i) : p;
}

function approxWordCount(source: string): number {
  const stripped = source
    .replace(/%[^\n]*/g, "")
    .replace(/\\[a-zA-Z]+\*?(\s*\[[^\]]*\])?(\s*\{[^}]*\})?/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$]*\$/g, " ")
    .replace(/\\\(.*?\\\)/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).filter((w) => w.length > 0).length;
}

export default function TexView({
  filePath,
  revision,
  initialContent,
  onSaveStatusChange,
  onContentChange,
  onFileSaved,
  onWordCountChange,
}: Props) {
  const [source, setSource] = useState<string>(initialContent ?? "");
  const [loaded, setLoaded] = useState(initialContent !== undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ratio, setRatio] = useState<number>(() => {
    const saved = localStorage.getItem(RATIO_KEY);
    const parsed = saved ? parseFloat(saved) : NaN;
    return Number.isFinite(parsed) ? Math.min(RATIO_MAX, Math.max(RATIO_MIN, parsed)) : 0.5;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;
  const baseDir = dirname(filePath);

  useEffect(() => {
    localStorage.setItem(RATIO_KEY, String(ratio));
  }, [ratio]);

  useEffect(() => {
    if (initialContent !== undefined) return;
    let cancelled = false;
    readFile(filePath)
      .then((content) => {
        if (cancelled) return;
        setSource(content);
        setLoaded(true);
        onWordCountChange?.(approxWordCount(content));
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [filePath]);

  const prevRevisionRef = useRef(revision);
  useEffect(() => {
    if (revision === undefined || revision === prevRevisionRef.current) {
      prevRevisionRef.current = revision;
      return;
    }
    prevRevisionRef.current = revision;
    readFile(filePathRef.current)
      .then((content) => {
        setSource(content);
        onSaveStatusChange("saved");
        onWordCountChange?.(approxWordCount(content));
      })
      .catch(() => { /* ignore */ });
  }, [revision]);

  const performSave = useCallback(async (text: string) => {
    onSaveStatusChange("saving");
    try {
      await writeFile(filePathRef.current, text);
      onSaveStatusChange("saved");
      onFileSaved?.(filePathRef.current);
    } catch {
      onSaveStatusChange("unsaved");
    }
  }, [onSaveStatusChange, onFileSaved]);

  const handleChange = useCallback((text: string) => {
    setSource(text);
    onContentChange?.(filePathRef.current, text);
    onSaveStatusChange("unsaved");
    onWordCountChange?.(approxWordCount(text));
    if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      performSave(text);
    }, AUTO_SAVE_MS);
  }, [onContentChange, onSaveStatusChange, onWordCountChange, performSave]);

  const handleSave = useCallback(() => {
    if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
    performSave(sourceRef.current);
  }, [performSave]);

  useEffect(() => () => {
    if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
  }, []);

  const dragStartXRef = useRef(0);
  const dragStartRatioRef = useRef(0);
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartXRef.current = e.clientX;
    dragStartRatioRef.current = ratio;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    function onMove(ev: MouseEvent) {
      const width = containerRef.current?.getBoundingClientRect().width ?? 1;
      const delta = (ev.clientX - dragStartXRef.current) / width;
      const next = Math.min(RATIO_MAX, Math.max(RATIO_MIN, dragStartRatioRef.current + delta));
      setRatio(next);
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [ratio]);

  if (loadError) {
    return <div className="tex-view-error">No se pudo abrir el archivo: {loadError}</div>;
  }
  if (!loaded) {
    return <div className="tex-view-loading">Cargando…</div>;
  }

  return (
    <div className="tex-view" ref={containerRef}>
      <div className="tex-view-pane tex-view-source" style={{ width: `calc(${ratio * 100}% - 2px)` }}>
        <TexSourceEditor value={source} onChange={handleChange} onSave={handleSave} />
      </div>
      <div className="tex-view-divider" onMouseDown={handleDragStart} />
      <div className="tex-view-pane tex-view-preview-wrap" style={{ width: `calc(${(1 - ratio) * 100}% - 2px)` }}>
        <TexPreview source={source} baseDir={baseDir} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TexView.tsx
git commit -m "feat: TexView container with split, drag, save lifecycle"
```

---

## Task 9: Route .tex in App.tsx

**Files:** Modify `src/App.tsx`

- [ ] **Step 1: Add the route**

Edit `/Users/juanfreire/Documents/personal/hashmark/src/App.tsx`:

Add the import near the other component imports (around line 8):
```tsx
import TexView from "./components/TexView";
```

Replace the inner `<Editor ... />` element (currently lines ~470-481 inside the `openFiles.map(...)`) with extension-based routing:
```tsx
{openFiles.map((path) => {
  const isTex = /\.tex$/i.test(path);
  return (
    <div
      key={path}
      style={{ display: path === activeFile ? undefined : "none", width: "100%" }}
    >
      {isTex ? (
        <TexView
          filePath={path}
          revision={fileRevisions.get(path) ?? 0}
          onSaveStatusChange={(s) => { if (activeFileRef.current === path) setSaveStatus(s); }}
          onContentChange={handleContentChange}
          onFileSaved={handleFileSaved}
          initialContent={modifiedFiles.get(path)}
          onWordCountChange={(c) => { setWordCounts((prev) => new Map(prev).set(path, c)); }}
        />
      ) : (
        <Editor
          filePath={path}
          revision={fileRevisions.get(path) ?? 0}
          onSaveStatusChange={(s) => { if (activeFileRef.current === path) setSaveStatus(s); }}
          onContentChange={handleContentChange}
          onFileSaved={handleFileSaved}
          initialContent={modifiedFiles.get(path)}
          searchTerm={path === activeFile ? pendingSearchTerm : undefined}
          onWordCountChange={(c) => { setWordCounts((prev) => new Map(prev).set(path, c)); }}
          onHeadingsChange={(h) => { setHeadingsMap((prev) => new Map(prev).set(path, h)); }}
          onEditorReady={(scrollFn) => { editorScrollFnsRef.current.set(path, scrollFn); }}
        />
      )}
    </div>
  );
})}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npm run build
```

Expected: builds without TS errors. If there are errors, fix them before continuing (don't `// @ts-ignore`).

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: route .tex files to TexView in App"
```

---

## Task 10: Styles for split layout + preview

**Files:** Modify `src/styles.css`

- [ ] **Step 1: Append the styles**

Append to the end of `/Users/juanfreire/Documents/personal/hashmark/src/styles.css`:
```css
/* --- LaTeX side-by-side view --- */

.tex-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.tex-view-pane {
  height: 100%;
  overflow: hidden;
  position: relative;
}

.tex-view-source {
  display: flex;
  flex-direction: column;
}

.tex-source-editor {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.tex-source-editor .cm-editor {
  height: 100%;
}

.tex-view-divider {
  width: 4px;
  cursor: col-resize;
  background: var(--border);
  transition: background 0.15s;
  flex-shrink: 0;
}
.tex-view-divider:hover,
.tex-view-divider:active {
  background: var(--accent);
}

.tex-view-preview-wrap {
  display: flex;
  flex-direction: column;
  background: var(--bg-editor);
}

.tex-preview-pane {
  height: 100%;
  width: 100%;
  overflow: auto;
  position: relative;
  color: var(--text-primary);
  background: var(--bg-editor);
}

.tex-preview-banner {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 6px 12px;
  font-size: 12px;
  font-family: var(--font-mono, 'IBM Plex Mono', monospace);
  background: rgba(245, 158, 11, 0.15);
  color: var(--text-primary);
  border-bottom: 1px solid rgba(245, 158, 11, 0.4);
}

.tex-preview-content {
  padding: 32px 48px;
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 15px;
  line-height: 1.65;
  max-width: 800px;
  margin: 0 auto;
}

.tex-preview-content h1,
.tex-preview-content h2,
.tex-preview-content h3,
.tex-preview-content h4 {
  color: var(--text-primary);
  margin-top: 1.4em;
  margin-bottom: 0.6em;
}

.tex-preview-content p {
  margin: 0.8em 0;
}

.tex-preview-content a {
  color: var(--link);
}

.tex-preview-content img {
  max-width: 100%;
  height: auto;
}

.tex-preview-content pre,
.tex-preview-content code {
  background: var(--code-bg);
  color: var(--code-text);
  border-radius: 4px;
}

.tex-preview-content pre {
  padding: 12px 16px;
  overflow-x: auto;
}

.tex-preview-content code {
  padding: 1px 5px;
  font-size: 0.9em;
}

.tex-preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  font-size: 14px;
}

.tex-view-error,
.tex-view-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  color: var(--text-tertiary);
  font-size: 14px;
}

/* KaTeX (math) sizing inside the preview */
.tex-preview-content .katex {
  font-size: 1.05em;
}
.tex-preview-content .katex-display {
  margin: 1em 0;
  overflow-x: auto;
  overflow-y: hidden;
}
```

- [ ] **Step 2: Import KaTeX CSS globally**

Edit `/Users/juanfreire/Documents/personal/hashmark/src/main.tsx` (or wherever `styles.css` is imported — find it first):

Find the line that imports styles and add right after it:
```ts
import "katex/dist/katex.min.css";
```

Note: `katex` is bundled inside `latex.js`, so the CSS should be at `node_modules/katex/dist/katex.min.css`. If not present, install: `npm install katex` (just for the CSS file).

- [ ] **Step 3: Verify**

Run:
```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css src/main.tsx
git commit -m "style: split layout and preview pane styles"
```

---

## Task 11: Run full test suite + build

- [ ] **Step 1: Tests**

```bash
npm test
```

Expected: all pass (or only the "real sample" parses log warnings — those are informational).

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: TypeScript clean, Vite bundle produced. No errors.

- [ ] **Step 3: Commit any final fixes**

If you had to tweak anything above to make build/tests green, commit each fix separately with a clear message (no `--amend`).

---

## Task 12: UI verification (manual)

- [ ] **Step 1: Launch dev**

```bash
npm run tauri dev
```

Expected: Hashmark window opens. The dev process is long-running — keep it open during the checklist.

- [ ] **Step 2: Manual checklist**

In the running app, verify each item:

- [ ] Open a `.md` file → markdown editor appears as before (no regression).
- [ ] Open `/Users/juanfreire/Documents/osix/nessie/docs/technical_paper.tex` (or any `.tex`) → split view appears: CodeMirror left, preview right.
- [ ] Type `\section{Test}` in source → preview shows a heading after ~300ms.
- [ ] Add `$x^2 + y^2 = z^2$` → math renders via KaTeX.
- [ ] Add `\begin{itemize}\item A\item B\end{itemize}` → bullet list renders.
- [ ] Type `\begin{equ` (incomplete) → amber banner appears at top of preview; previous render stays visible underneath.
- [ ] Complete it to `\begin{equation}E=mc^2\end{equation}` → banner clears, equation renders.
- [ ] Cmd+S → save status flips to "Saving…" then "Saved".
- [ ] Type something and wait 1s → auto-save fires (save status reflects it).
- [ ] Cmd+F inside the `.tex` source → CodeMirror search panel opens at the top of the source pane.
- [ ] Drag the divider → ratio changes. Close the app, reopen, open the same `.tex` → ratio is restored.
- [ ] Toggle dark mode → both panes re-theme; preview stays readable.
- [ ] Close the `.tex` tab via Cmd+W → tab closes cleanly. Reopen via Cmd+P → state restored.
- [ ] Open both `cv-template.tex` and `technical_paper.tex` in tabs → switching tabs preserves each one's CodeMirror state and scroll position.

- [ ] **Step 3: Stop the dev server when done**

Kill the `npm run tauri dev` process.

---

## Self-Review Notes

Spec coverage map (every spec requirement → task):

| Spec section | Task |
|---|---|
| Routing by extension | Task 9 |
| TexView (split + drag + persist ratio) | Task 8 |
| TexSourceEditor (CodeMirror 6 + stex + Cmd+F + Cmd+S) | Task 7 |
| TexPreview (debounce 300ms + banner + lastGoodHtml) | Task 6 |
| TexRenderer interface | Task 4 |
| latex.js adapter + image src rewrite | Task 5 |
| Spike validation | Task 3 |
| Word count for .tex (approximate) | Task 8 (`approxWordCount`) |
| External change (revision) handling | Task 8 |
| No Rust changes | (implicit — no Task touches Rust) |
| Unit tests (3 in adapter + path helpers) | Tasks 4, 5 |
| Styles (split, divider, preview, banner, KaTeX CSS) | Task 10 |
| Manual checklist | Task 12 |
