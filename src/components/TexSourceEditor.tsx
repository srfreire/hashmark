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
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "13px",
      },
      ".cm-content": { padding: "16px", caretColor: "var(--text-primary)" },
      ".cm-scroller": { fontFamily: "inherit" },
      ".cm-activeLine": { backgroundColor: "var(--bg-sidebar-hover)" },
      ".cm-gutters": {
        backgroundColor: "var(--bg-editor)",
        border: "none",
        color: "var(--text-tertiary)",
      },
      ".cm-activeLineGutter": { backgroundColor: "var(--bg-sidebar-hover)" },
      ".cm-panels": { backgroundColor: "var(--bg-sidebar)", color: "var(--text-primary)" },
      ".cm-panels .cm-textfield": {
        backgroundColor: "var(--bg-editor)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
      },
      ".cm-panels .cm-button": {
        backgroundColor: "var(--bg-sidebar-hover)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
      },
      ".cm-searchMatch": { backgroundColor: "var(--accent-soft)" },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--accent)" },
      ".cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft) !important" },
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
          ...searchKeymap,
          ...defaultKeymap,
          ...historyKeymap,
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
      view.dispatch({
        effects: themeCompartment.current.reconfigure(buildTheme(isDark())),
      });
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

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
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="tex-source-editor" />;
}
