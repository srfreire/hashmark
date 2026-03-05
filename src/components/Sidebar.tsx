import { useState, useEffect, useCallback } from "react";
import { FileNode } from "../types";
import { createFile, createFolder } from "../services/filesystem";
import FileTreeItem from "./FileTreeItem";
import GlobalSearch from "./GlobalSearch";
import OutlineView from "./OutlineView";
import ContextMenu, { ContextMenuEntry } from "./ContextMenu";

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
  onRenameItem?: (oldPath: string, newPath: string) => void;
  onDeleteItem?: (path: string, isDirectory: boolean) => void;
  onRevealItem?: (path: string) => void;
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
  onRenameItem,
  onDeleteItem,
  onRevealItem,
  modifiedFiles,
  gitStatuses,
  headings,
  onHeadingClick,
}: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [newItemInFolder, setNewItemInFolder] = useState<{ parentPath: string; type: "file" | "folder" } | null>(null);
  const [newItemName, setNewItemName] = useState("");

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

  async function handleNewItemInFolder() {
    if (!newItemInFolder || !newItemName.trim()) return;
    if (newItemInFolder.type === "file") {
      const path = await createFile(newItemInFolder.parentPath, newItemName.trim());
      onFileCreated();
      onFileSelect(path);
    } else {
      await createFolder(newItemInFolder.parentPath, newItemName.trim());
      onFileCreated();
    }
    setNewItemInFolder(null);
    setNewItemName("");
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleRenameSubmit = useCallback((oldPath: string, newName: string) => {
    const parentDir = oldPath.substring(0, oldPath.lastIndexOf("/"));
    const newPath = `${parentDir}/${newName}`;
    onRenameItem?.(oldPath, newPath);
    setRenamingPath(null);
  }, [onRenameItem]);

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  function buildContextMenuItems(node: FileNode): ContextMenuEntry[] {
    if (node.isDirectory) {
      return [
        {
          label: "New File",
          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>,
          action: () => { setNewItemInFolder({ parentPath: node.path, type: "file" }); setNewItemName(""); },
        },
        {
          label: "New Folder",
          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>,
          action: () => { setNewItemInFolder({ parentPath: node.path, type: "folder" }); setNewItemName(""); },
        },
        "separator",
        {
          label: "Rename",
          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" /></svg>,
          action: () => setRenamingPath(node.path),
        },
        {
          label: "Delete",
          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>,
          action: () => onDeleteItem?.(node.path, true),
          danger: true,
        },
      ];
    }

    return [
      {
        label: "Rename",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" /></svg>,
        action: () => setRenamingPath(node.path),
      },
      {
        label: "Delete",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>,
        action: () => onDeleteItem?.(node.path, false),
        danger: true,
      },
      "separator",
      {
        label: "Reveal in Finder",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
        action: () => onRevealItem?.(node.path),
      },
    ];
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

          {newItemInFolder && (
            <div style={{ padding: "0 8px 8px", display: "flex", gap: 4, alignItems: "center" }}>
              <input
                autoFocus
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNewItemInFolder();
                  if (e.key === "Escape") { setNewItemInFolder(null); setNewItemName(""); }
                }}
                placeholder={newItemInFolder.type === "file" ? "filename.md" : "folder name"}
                className="new-file-input"
              />
              <button
                className="sidebar-btn"
                onClick={() => { setNewItemInFolder(null); setNewItemName(""); }}
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
                onContextMenu={handleContextMenu}
                renamingPath={renamingPath}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={handleRenameCancel}
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems(contextMenu.node)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </aside>
  );
}
