import { useState } from "react";
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
}

export default function Sidebar({ files, activeFile, rootPath, onFolderSelect, onFileSelect, onFileCreated }: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");

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
    <aside className="w-64 h-screen border-r border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 flex flex-col flex-shrink-0">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-200">NoteMD</h1>
        <div className="flex gap-1">
          {rootPath && (
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="p-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-sm"
              title="New file"
            >
              +
            </button>
          )}
          <button
            onClick={handleOpenFolder}
            className="p-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-sm"
            title="Open folder"
          >
            📁
          </button>
        </div>
      </div>

      {isCreating && (
        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
          <input
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFile();
              if (e.key === "Escape") setIsCreating(false);
            }}
            placeholder="filename.md"
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
          />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2">
        {!rootPath && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center mt-8 px-4">
            Open a folder to start editing Markdown files
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
