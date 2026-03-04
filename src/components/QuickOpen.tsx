import { useState, useEffect, useRef, useMemo } from "react";
import { FileNode } from "../types";
import { collectFiles } from "../services/filesystem";

interface Props {
  files: FileNode[];
  rootPath: string | null;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export default function QuickOpen({ files, rootPath, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allFiles = useMemo(() => collectFiles(files), [files]);

  const filtered = useMemo(() => {
    if (!query) return allFiles;
    const lower = query.toLowerCase();
    return allFiles.filter((p) => {
      const name = p.split("/").pop() ?? "";
      return name.toLowerCase().includes(lower);
    });
  }, [allFiles, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex]);
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  function displayPath(fullPath: string) {
    if (rootPath && fullPath.startsWith(rootPath)) {
      return fullPath.slice(rootPath.length + 1);
    }
    return fullPath;
  }

  return (
    <div className="quick-open-overlay" onMouseDown={onClose}>
      <div className="quick-open" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="quick-open-input"
          type="text"
          placeholder="Search files..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="quick-open-results" ref={listRef}>
          {filtered.map((path, i) => {
            const name = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
            const rel = displayPath(path);
            return (
              <button
                key={path}
                className={`quick-open-item${i === selectedIndex ? " selected" : ""}`}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => { onSelect(path); onClose(); }}
              >
                <span className="quick-open-item-name">{name}</span>
                <span className="quick-open-item-path">{rel}</span>
              </button>
            );
          })}
          {filtered.length === 0 && query && (
            <div className="quick-open-empty">No files found</div>
          )}
        </div>
      </div>
    </div>
  );
}
