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
  const paddingLeft = 12 + depth * 16;

  if (node.isDirectory) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left flex items-center gap-1.5 py-1 px-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
          style={{ paddingLeft }}
        >
          <span className="text-xs text-gray-400 w-4 flex-shrink-0">
            {expanded ? "▼" : "▶"}
          </span>
          <span className="truncate">{node.name}</span>
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
      className={`w-full text-left flex items-center gap-1.5 py-1 px-2 text-sm rounded transition-colors ${
        isActive
          ? "bg-blue-50 text-blue-700 font-medium"
          : "text-gray-700 hover:bg-gray-100"
      }`}
      style={{ paddingLeft: paddingLeft + 16 }}
    >
      <span className="text-gray-400 flex-shrink-0">📄</span>
      <span className="truncate">{node.name.replace(/\.md$/, "")}</span>
    </button>
  );
}
