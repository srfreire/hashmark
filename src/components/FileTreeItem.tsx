import { useState, useRef, useEffect } from "react";
import { FileNode } from "../types";

interface Props {
  node: FileNode;
  depth: number;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onContextMenu?: (e: React.MouseEvent, node: FileNode) => void;
  renamingPath?: string | null;
  onRenameSubmit?: (oldPath: string, newName: string) => void;
  onRenameCancel?: () => void;
  modifiedFiles?: Set<string>;
  gitStatuses?: Map<string, string>;
}

function RenameInput({ node, onSubmit, onCancel }: { node: FileNode; onSubmit: (name: string) => void; onCancel: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(node.name);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    // Select name before .md extension for files
    if (!node.isDirectory && node.name.endsWith(".md")) {
      inputRef.current.setSelectionRange(0, node.name.length - 3);
    } else {
      inputRef.current.select();
    }
  }, [node.name, node.isDirectory]);

  function handleCommit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== node.name) {
      onSubmit(trimmed);
    } else {
      onCancel();
    }
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); handleCommit(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        e.stopPropagation();
      }}
      onBlur={handleCommit}
      className="tree-rename-input"
    />
  );
}

export default function FileTreeItem({ node, depth, activeFile, onFileSelect, onContextMenu, renamingPath, onRenameSubmit, onRenameCancel, modifiedFiles, gitStatuses }: Props) {
  const [expanded, setExpanded] = useState(true);
  const isActive = node.path === activeFile;
  const isModified = modifiedFiles?.has(node.path) ?? false;
  const gitStatus = gitStatuses?.get(node.path);
  const indent = 8 + depth * 16;
  const isRenaming = renamingPath === node.path;

  if (node.isDirectory) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, node); }}
          className="tree-dir"
          style={{ paddingLeft: indent }}
        >
          <span className="tree-dir-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
          {isRenaming ? (
            <RenameInput node={node} onSubmit={(name) => onRenameSubmit?.(node.path, name)} onCancel={() => onRenameCancel?.()} />
          ) : (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {node.name}
            </span>
          )}
        </button>
        {expanded && node.children?.map((child) => (
          <FileTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            activeFile={activeFile}
            onFileSelect={onFileSelect}
            onContextMenu={onContextMenu}
            renamingPath={renamingPath}
            onRenameSubmit={onRenameSubmit}
            onRenameCancel={onRenameCancel}
            modifiedFiles={modifiedFiles}
            gitStatuses={gitStatuses}
          />
        ))}
      </div>
    );
  }

  const gitClass = isModified
    ? " modified"
    : gitStatus === "modified" || gitStatus === "added" || gitStatus === "deleted"
      ? " git-modified"
      : gitStatus === "untracked"
        ? " git-untracked"
        : "";

  return (
    <button
      onClick={() => onFileSelect(node.path)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, node); }}
      className={`tree-file${isActive ? " active" : ""}${gitClass}`}
      style={{ paddingLeft: indent + 20 }}
    >
      <span className="tree-file-dot" />
      {isRenaming ? (
        <RenameInput node={node} onSubmit={(name) => onRenameSubmit?.(node.path, name)} onCancel={() => onRenameCancel?.()} />
      ) : (
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.name.replace(/\.md$/, "")}
        </span>
      )}
    </button>
  );
}
