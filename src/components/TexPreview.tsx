import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { TexRenderer } from "../services/tex-renderer";
import { createTexTranspiler } from "../services/tex-transpiler";

interface Props {
  source: string;
  baseDir: string;
}

let cachedRenderer: TexRenderer | null = null;
function getRenderer(): TexRenderer {
  if (!cachedRenderer) {
    cachedRenderer = createTexTranspiler(convertFileSrc);
  }
  return cachedRenderer;
}

export default function TexPreview({ source, baseDir }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [lastGoodHtml, setLastGoodHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const renderTokenRef = useRef(0);

  useEffect(() => {
    const token = ++renderTokenRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const renderer = getRenderer();
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

    return () => window.clearTimeout(timer);
  }, [source, baseDir]);

  const visibleHtml = html ?? lastGoodHtml;
  const truncatedError = error && error.length > 80 ? error.slice(0, 80) + "…" : error;

  return (
    <div className="tex-preview-pane">
      {error && (
        <div className="tex-preview-banner" title={error}>
          Parse error: {truncatedError}
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
