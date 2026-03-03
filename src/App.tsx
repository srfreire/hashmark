import { useState, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import { FileNode } from "./types";
import { loadFileTree } from "./services/filesystem";

function App() {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const refreshTree = useCallback(async (path: string) => {
    const tree = await loadFileTree(path);
    setFiles(tree);
  }, []);

  async function handleFolderSelect(path: string) {
    setRootPath(path);
    setActiveFile(null);
    await refreshTree(path);
  }

  function handleFileSelect(path: string) {
    setActiveFile(path);
  }

  function handleFileCreated() {
    if (rootPath) refreshTree(rootPath);
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar
        files={files}
        activeFile={activeFile}
        rootPath={rootPath}
        onFolderSelect={handleFolderSelect}
        onFileSelect={handleFileSelect}
        onFileCreated={handleFileCreated}
      />
      <main className="flex-1 flex items-center justify-center text-gray-400">
        {activeFile ? (
          <p>Editor goes here: {activeFile}</p>
        ) : (
          <p>Select a file to start editing</p>
        )}
      </main>
    </div>
  );
}

export default App;
