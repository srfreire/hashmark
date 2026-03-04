import { useState } from "react";

interface Props {
  openFiles: string[];
  activeFile: string | null;
  modifiedFiles: Set<string>;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onReorderTabs: (openFiles: string[]) => void;
}

export default function TabBar({ openFiles, activeFile, modifiedFiles, onSelectTab, onCloseTab, onReorderTabs }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  if (openFiles.length === 0) return null;

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newOrder = [...openFiles];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(index, 0, moved);
    onReorderTabs(newOrder);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  return (
    <div className="editor-tabs">
      {openFiles.map((path, i) => {
        const name = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
        const isActive = path === activeFile;
        const isModified = modifiedFiles.has(path);
        const isDragging = dragIndex === i;
        const isDragOver = dragOverIndex === i && dragIndex !== i;

        return (
          <button
            key={path}
            className={`editor-tab${isActive ? " active" : ""}${isDragging ? " dragging" : ""}${isDragOver ? " drag-over" : ""}`}
            onClick={() => onSelectTab(path)}
            title={path}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
          >
            <span className="editor-tab-name">{name}</span>
            {isModified && <span className="editor-tab-dot" />}
            <span
              className="editor-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(path);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 3L9 9M9 3L3 9" />
              </svg>
            </span>
          </button>
        );
      })}
    </div>
  );
}
