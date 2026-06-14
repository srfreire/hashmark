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
    return Number.isFinite(parsed)
      ? Math.min(RATIO_MAX, Math.max(RATIO_MIN, parsed))
      : 0.5;
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
    return () => {
      cancelled = true;
    };
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
      .catch(() => {
        /* ignore */
      });
  }, [revision]);

  const performSave = useCallback(
    async (text: string) => {
      onSaveStatusChange("saving");
      try {
        await writeFile(filePathRef.current, text);
        onSaveStatusChange("saved");
        onFileSaved?.(filePathRef.current);
      } catch {
        onSaveStatusChange("unsaved");
      }
    },
    [onSaveStatusChange, onFileSaved],
  );

  const handleChange = useCallback(
    (text: string) => {
      setSource(text);
      onContentChange?.(filePathRef.current, text);
      onSaveStatusChange("unsaved");
      onWordCountChange?.(approxWordCount(text));
      if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = window.setTimeout(() => {
        performSave(text);
      }, AUTO_SAVE_MS);
    },
    [onContentChange, onSaveStatusChange, onWordCountChange, performSave],
  );

  const handleSave = useCallback(() => {
    if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
    performSave(sourceRef.current);
  }, [performSave]);

  useEffect(
    () => () => {
      if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
    },
    [],
  );

  const dragStartXRef = useRef(0);
  const dragStartRatioRef = useRef(0);
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartXRef.current = e.clientX;
      dragStartRatioRef.current = ratio;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      function onMove(ev: MouseEvent) {
        const width = containerRef.current?.getBoundingClientRect().width ?? 1;
        const delta = (ev.clientX - dragStartXRef.current) / width;
        const next = Math.min(
          RATIO_MAX,
          Math.max(RATIO_MIN, dragStartRatioRef.current + delta),
        );
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
    },
    [ratio],
  );

  if (loadError) {
    return (
      <div className="tex-view-error">
        No se pudo abrir el archivo: {loadError}
      </div>
    );
  }
  if (!loaded) {
    return <div className="tex-view-loading">Cargando…</div>;
  }

  return (
    <div className="tex-view" ref={containerRef}>
      <div
        className="tex-view-pane tex-view-source"
        style={{ width: `calc(${ratio * 100}% - 2px)` }}
      >
        <TexSourceEditor value={source} onChange={handleChange} onSave={handleSave} />
      </div>
      <div className="tex-view-divider" onMouseDown={handleDragStart} />
      <div
        className="tex-view-pane tex-view-preview-wrap"
        style={{ width: `calc(${(1 - ratio) * 100}% - 2px)` }}
      >
        <TexPreview source={source} baseDir={baseDir} />
      </div>
    </div>
  );
}
