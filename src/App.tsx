import { useState, useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import Sidebar from "./components/Sidebar";
import Editor from "./components/Editor";
import ThemeToggle from "./components/ThemeToggle";
import { FileNode } from "./types";
import { loadFileTree, selectFolder } from "./services/filesystem";

function App() {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [dark, setDark] = useState(true);
  const [showNewFile, setShowNewFile] = useState(false);
  const [sidebarView, setSidebarView] = useState<"files" | "search">("files");
  const [pendingSearchTerm, setPendingSearchTerm] = useState<string | undefined>(undefined);
  const editorScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const refreshTree = useCallback(async (path: string) => {
    const tree = await loadFileTree(path);
    setFiles(tree);
  }, []);

  const handleFolderSelect = useCallback(async (path: string) => {
    setRootPath(path);
    setActiveFile(null);
    await refreshTree(path);
  }, [refreshTree]);

  const handleOpenFolder = useCallback(async () => {
    const path = await selectFolder();
    if (path) handleFolderSelect(path);
  }, [handleFolderSelect]);

  function handleFileSelect(path: string) {
    setActiveFile(path);
    setSaveStatus("saved");
    setPendingSearchTerm(undefined);
    editorScrollRef.current?.scrollTo(0, 0);
  }

  function handleFileCreated() {
    if (rootPath) refreshTree(rootPath);
  }

  const handleOpenFileAtMatch = useCallback((filePath: string, searchTerm: string) => {
    setActiveFile(filePath);
    setPendingSearchTerm(searchTerm);
    setSaveStatus("saved");
    editorScrollRef.current?.scrollTo(0, 0);
  }, []);

  // Cmd+Shift+F global keyboard listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setSidebarView("search");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Listen for native menu events
  useEffect(() => {
    const unlisten: (() => void)[] = [];

    listen("menu-open-folder", () => {
      handleOpenFolder();
    }).then((fn) => unlisten.push(fn));

    listen("menu-new-file", () => {
      setShowNewFile(true);
    }).then((fn) => unlisten.push(fn));

    listen("menu-save", () => {
      // Cmd+S is handled by the Editor component directly
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true }));
    }).then((fn) => unlisten.push(fn));

    listen("menu-find", () => {
      // Cmd+F: open in-editor find bar (dispatched as keyboard event)
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true }));
    }).then((fn) => unlisten.push(fn));

    listen("menu-find-in-files", () => {
      setSidebarView("search");
    }).then((fn) => unlisten.push(fn));

    return () => {
      unlisten.forEach((fn) => fn());
    };
  }, [handleOpenFolder]);

  const fileName = activeFile?.split("/").pop()?.replace(/\.md$/, "") ?? "";

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div className="drag-region" />

      <Sidebar
        files={files}
        activeFile={activeFile}
        rootPath={rootPath}
        onFileSelect={handleFileSelect}
        onFileCreated={handleFileCreated}
        showNewFile={showNewFile}
        onShowNewFileChange={setShowNewFile}
        sidebarView={sidebarView}
        onSidebarViewChange={setSidebarView}
        onOpenFileAtMatch={handleOpenFileAtMatch}
      />
      <div className="editor-area">
        {activeFile ? (
          <div className="editor-topbar">
            <span className="editor-filename">{fileName}</span>
            <div className="editor-topbar-right drag-region-interactive">
              <span className={`save-status ${saveStatus}`}>
                {saveStatus === "saved" ? "Saved" :
                 saveStatus === "saving" ? "Saving..." :
                 "Unsaved"}
              </span>
              <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
            </div>
          </div>
        ) : (
          <div className="editor-topbar" style={{ justifyContent: "flex-end" }}>
            <div className="editor-topbar-right drag-region-interactive">
              <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
            </div>
          </div>
        )}
        <div className="editor-scroll" ref={editorScrollRef}>
          {activeFile ? (
            <Editor
              key={activeFile}
              filePath={activeFile}
              onSaveStatusChange={setSaveStatus}
              searchTerm={pendingSearchTerm}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <span className="empty-state-text">Select a file to start editing</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
