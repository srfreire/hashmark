import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import mermaid from "mermaid";

const pluginKey = new PluginKey("mermaidPreview");

// SVG cache keyed by source text
const svgCache = new Map<string, string>();
const errorCache = new Map<string, string>();

let mermaidInitialized = false;
let currentTheme: "default" | "dark" = "default";

function initMermaid(dark: boolean) {
  const theme = dark ? "dark" : "default";
  if (mermaidInitialized && theme === currentTheme) return;
  currentTheme = theme;
  mermaidInitialized = true;
  svgCache.clear();
  errorCache.clear();
  mermaid.initialize({
    startOnLoad: false,
    theme,
    fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
  });
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// Persistent DOM containers keyed by source hash — survives decoration rebuilds
const containerCache = new Map<number, HTMLDivElement>();

function getOrCreateContainer(source: string): HTMLDivElement {
  const hash = simpleHash(source);

  const existing = containerCache.get(hash);
  if (existing) return existing;

  const container = document.createElement("div");
  container.className = "mermaid-preview";

  if (svgCache.has(source)) {
    container.innerHTML = svgCache.get(source)!;
  } else if (errorCache.has(source)) {
    container.innerHTML = `<span class="mermaid-error">${errorCache.get(source)}</span>`;
  } else {
    container.innerHTML =
      '<span class="mermaid-loading">Rendering diagram\u2026</span>';
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    mermaid
      .render(id, source)
      .then(({ svg }) => {
        svgCache.set(source, svg);
        container.innerHTML = svg;
      })
      .catch((err) => {
        const msg = err?.message || "Invalid diagram";
        errorCache.set(source, msg);
        container.innerHTML = `<span class="mermaid-error">${msg}</span>`;
      });
  }

  containerCache.set(hash, container);
  return container;
}

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];
  const activeSources = new Set<number>();

  state.doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock" && node.attrs.language === "mermaid") {
      const source = node.textContent.trim();
      if (!source) return;

      const hash = simpleHash(source);
      activeSources.add(hash);
      const endPos = pos + node.nodeSize;

      const widget = Decoration.widget(
        endPos,
        () => getOrCreateContainer(source),
        { side: 1, key: `mermaid-${hash}` },
      );

      decorations.push(widget);
    }
  });

  // Clean up containers for removed mermaid blocks
  for (const key of containerCache.keys()) {
    if (!activeSources.has(key)) {
      containerCache.delete(key);
    }
  }

  return DecorationSet.create(state.doc, decorations);
}

export const MermaidPreview = Extension.create({
  name: "mermaidPreview",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init(_: unknown, state: EditorState) {
            initMermaid(document.documentElement.classList.contains("dark"));
            return buildDecorations(state);
          },
          apply(tr: Transaction, old: DecorationSet, _oldState: EditorState, newState: EditorState) {
            initMermaid(document.documentElement.classList.contains("dark"));
            if (!tr.docChanged) return old.map(tr.mapping, tr.doc);
            return buildDecorations(newState);
          },
        },
        props: {
          decorations(state: EditorState) {
            return pluginKey.getState(state) as DecorationSet;
          },
        },
      }),
    ];
  },
});
