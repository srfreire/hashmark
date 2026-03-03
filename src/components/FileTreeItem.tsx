import { useState } from "react";
import { FileNode } from "../types";

interface Props {
  node: FileNode;
  depth: number;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
}

export default function FileTreeItem({ node, depth, activeFile, onFileSelect }: Props) {
  const [expanded, setExpanded] = useState(true);
  const isActive = node.path === activeFile;
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
            {expanded ? "▾" : "▸"}
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
          />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileSelect(node.path)}
      className={`tree-file ${isActive ? "active" : ""}`}
      style={{ paddingLeft: indent + 20 }}
    >
      <span className="tree-file-dot" />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {node.name.replace(/\.md$/, "")}
      </span>
    </button>
  );
}
