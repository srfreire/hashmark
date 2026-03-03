import { useState, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import Editor from "./components/Editor";
import { FileNode } from "./types";
import { loadFileTree } from "./services/filesystem";

function App() {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");

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
    setSaveStatus("saved");
  }

  function handleFileCreated() {
    if (rootPath) refreshTree(rootPath);
  }

  const fileName = activeFile?.split("/").pop()?.replace(/\.md$/, "") ?? "";

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
      <div className="flex-1 flex flex-col">
        {activeFile && (
          <header className="h-12 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
            <h2 className="text-sm font-medium text-gray-700">{fileName}</h2>
            <span className={`text-xs ${
              saveStatus === "saved" ? "text-gray-400" :
              saveStatus === "saving" ? "text-blue-500" :
              "text-orange-500"
            }`}>
              {saveStatus === "saved" ? "Saved" :
               saveStatus === "saving" ? "Saving..." :
               "Unsaved changes"}
            </span>
          </header>
        )}
        <main className="flex-1 overflow-y-auto">
          {activeFile ? (
            <Editor
              key={activeFile}
              filePath={activeFile}
              onSaveStatusChange={setSaveStatus}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <p>Select a file to start editing</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
