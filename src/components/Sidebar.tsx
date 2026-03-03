import { useState, useEffect } from "react";
import { FileNode } from "../types";
import { selectFolder, createFile } from "../services/filesystem";
import FileTreeItem from "./FileTreeItem";

interface Props {
  files: FileNode[];
  activeFile: string | null;
  rootPath: string | null;
  onFolderSelect: (path: string) => void;
  onFileSelect: (path: string) => void;
  onFileCreated: () => void;
  showNewFile?: boolean;
  onShowNewFileChange?: (show: boolean) => void;
}

export default function Sidebar({ files, activeFile, rootPath, onFolderSelect, onFileSelect, onFileCreated, showNewFile, onShowNewFileChange }: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");

  useEffect(() => {
    if (showNewFile && rootPath) {
      setIsCreating(true);
      onShowNewFileChange?.(false);
    }
  }, [showNewFile, rootPath, onShowNewFileChange]);

  async function handleOpenFolder() {
    const path = await selectFolder();
    if (path) onFolderSelect(path);
  }

  async function handleCreateFile() {
    if (!rootPath || !newFileName.trim()) return;
    await createFile(rootPath, newFileName.trim());
    setNewFileName("");
    setIsCreating(false);
    onFileCreated();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>NoteMD</h1>
        <div className="sidebar-actions">
          {rootPath && (
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="sidebar-btn"
              title="New file"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="7" y1="3" x2="7" y2="11" />
                <line x1="3" y1="7" x2="11" y2="7" />
              </svg>
            </button>
          )}
          <button
            onClick={handleOpenFolder}
            className="sidebar-btn"
            title="Open folder"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 3.5v7a1 1 0 001 1h9a1 1 0 001-1v-5a1 1 0 00-1-1H7L5.5 2.5H2.5a1 1 0 00-1 1z" />
            </svg>
          </button>
        </div>
      </div>

      {isCreating && (
        <div style={{ padding: "8px" }}>
          <input
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFile();
              if (e.key === "Escape") setIsCreating(false);
            }}
            placeholder="filename.md"
            className="new-file-input"
          />
        </div>
      )}

      <nav className="sidebar-nav">
        {!rootPath && (
          <p className="sidebar-empty">
            Open a folder to start editing your Markdown files
          </p>
        )}
        {files.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            activeFile={activeFile}
            onFileSelect={onFileSelect}
          />
        ))}
      </nav>
    </aside>
  );
}
