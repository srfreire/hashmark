import { useState } from "react";
import { FileNode } from "../types";

interface Props {
  node: FileNode;
  depth: number;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  modifiedFiles?: Set<string>;
  gitStatuses?: Map<string, string>;
}

export default function FileTreeItem({ node, depth, activeFile, onFileSelect, modifiedFiles, gitStatuses }: Props) {
  const [expanded, setExpanded] = useState(true);
  const isActive = node.path === activeFile;
  const isModified = modifiedFiles?.has(node.path) ?? false;
  const gitStatus = gitStatuses?.get(node.path);
  const indent = 8 + depth * 16;

  if (node.isDirectory) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="tree-dir"
          style={{ paddingLeft: indent }}
        >
          <span className="tree-dir-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
          </span>
        </button>
        {expanded && node.children?.map((child) => (
          <FileTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            activeFile={activeFile}
            onFileSelect={onFileSelect}
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
      className={`tree-file${isActive ? " active" : ""}${gitClass}`}
      style={{ paddingLeft: indent + 20 }}
    >
      <span className="tree-file-dot" />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {node.name.replace(/\.md$/, "")}
      </span>
    </button>
  );
}
