import { useState, useEffect } from "react";
import { FileNode } from "../types";
import { createFile } from "../services/filesystem";
import FileTreeItem from "./FileTreeItem";
import GlobalSearch from "./GlobalSearch";
import OutlineView from "./OutlineView";

interface Props {
  files: FileNode[];
  activeFile: string | null;
  rootPath: string | null;
  collapsed: boolean;
  onCollapse: () => void;
  onOpenFolder: () => void;
  onFileSelect: (path: string) => void;
  onFileCreated: () => void;
  showNewFile?: boolean;
  onShowNewFileChange?: (show: boolean) => void;
  sidebarView: "files" | "search" | "outline";
  onSidebarViewChange: (view: "files" | "search" | "outline") => void;
  onOpenFileAtMatch: (filePath: string, searchTerm: string) => void;
  modifiedFiles?: Set<string>;
  gitStatuses?: Map<string, string>;
  headings?: Array<{ level: number; text: string; pos: number }>;
  onHeadingClick?: (pos: number) => void;
}

export default function Sidebar({
  files,
  activeFile,
  rootPath,
  collapsed,
  onCollapse,
  onOpenFolder,
  onFileSelect,
  onFileCreated,
  showNewFile,
  onShowNewFileChange,
  sidebarView,
  onSidebarViewChange,
  onOpenFileAtMatch,
  modifiedFiles,
  gitStatuses,
  headings,
  onHeadingClick,
}: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");

  useEffect(() => {
    if (showNewFile && rootPath) {
      setIsCreating(true);
      onShowNewFileChange?.(false);
    }
  }, [showNewFile, rootPath, onShowNewFileChange]);

  async function handleCreateFile() {
    if (!rootPath || !newFileName.trim()) return;
    await createFile(rootPath, newFileName.trim());
    setNewFileName("");
    setIsCreating(false);
    onFileCreated();
  }

  return (
    <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}>
      <div className="sidebar-header" data-tauri-drag-region>
        <h1>Hashmark</h1>
        <div className="sidebar-actions">
          <button
            onClick={() => onSidebarViewChange("files")}
            className={`sidebar-btn${sidebarView === "files" ? " sidebar-btn-active" : ""}`}
            title="Files"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 3.5v7a1 1 0 001 1h9a1 1 0 001-1v-5a1 1 0 00-1-1H7L5.5 2.5H2.5a1 1 0 00-1 1z" />
            </svg>
          </button>
          <button
            onClick={() => onSidebarViewChange("search")}
            className={`sidebar-btn${sidebarView === "search" ? " sidebar-btn-active" : ""}`}
            title="Search (⌘⇧F)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="6" cy="6" r="4" />
              <line x1="9" y1="9" x2="12" y2="12" />
            </svg>
          </button>
          <button
            onClick={() => onSidebarViewChange("outline")}
            className={`sidebar-btn${sidebarView === "outline" ? " sidebar-btn-active" : ""}`}
            title="Outline"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="21" y1="10" x2="7" y2="10" />
              <line x1="21" y1="6" x2="3" y2="6" />
              <line x1="21" y1="14" x2="3" y2="14" />
              <line x1="21" y1="18" x2="7" y2="18" />
            </svg>
          </button>
          <button
            onClick={onCollapse}
            className="sidebar-btn"
            title="Collapse Sidebar (⌘B)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>
      </div>

      {sidebarView === "files" && (
        <>
          <div className="sidebar-file-actions">
            <button
              onClick={onOpenFolder}
              className="sidebar-btn"
              title="Open folder"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
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
          </div>

          {isCreating && (
            <div style={{ padding: "0 8px 8px", display: "flex", gap: 4, alignItems: "center" }}>
              <input
                autoFocus
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFile();
                  if (e.key === "Escape") { setIsCreating(false); setNewFileName(""); }
                }}
                placeholder="filename.md"
                className="new-file-input"
              />
              <button
                className="sidebar-btn"
                onClick={() => { setIsCreating(false); setNewFileName(""); }}
                title="Cancel"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" /></svg>
              </button>
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
                modifiedFiles={modifiedFiles}
                gitStatuses={gitStatuses}
              />
            ))}
          </nav>
        </>
      )}

      {sidebarView === "outline" && (
        <OutlineView
          headings={headings ?? []}
          onHeadingClick={(pos) => onHeadingClick?.(pos)}
        />
      )}

      {sidebarView === "search" && (
        rootPath ? (
          <GlobalSearch
            rootPath={rootPath}
            onOpenFileAtMatch={onOpenFileAtMatch}
            onClose={() => onSidebarViewChange("files")}
          />
        ) : (
          <div className="sidebar-nav">
            <p className="sidebar-empty">
              Open a folder to search across files
            </p>
          </div>
        )
      )}
    </aside>
  );
}
