import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import Editor from "./components/Editor";
import TabBar from "./components/TabBar";
import ThemeToggle from "./components/ThemeToggle";
import QuickOpen from "./components/QuickOpen";
import CommandPalette from "./components/CommandPalette";
import { FileNode } from "./types";
import { confirm } from "@tauri-apps/plugin-dialog";
import { loadFileTree, selectFolder, writeFile, getGitRoot, getGitStatus, getFileMtime, renameItem, deleteItem, revealInFinder } from "./services/filesystem";

function App() {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("hashmark-dark-mode");
    if (saved !== null) return saved === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [showNewFile, setShowNewFile] = useState(false);
  const [sidebarView, setSidebarView] = useState<"files" | "search" | "outline">(() => {
    const saved = localStorage.getItem("hashmark-sidebar-view");
    return (saved === "files" || saved === "search" || saved === "outline") ? saved : "files";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("hashmark-sidebar-collapsed") === "true";
  });
  const [pendingSearchTerm, setPendingSearchTerm] = useState<string | undefined>(undefined);
  const [modifiedFiles, setModifiedFiles] = useState<Map<string, string>>(new Map());
  const [gitStatuses, setGitStatuses] = useState<Map<string, string>>(new Map());
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [fileRevisions, setFileRevisions] = useState<Map<string, number>>(new Map());
  const [wordCounts, setWordCounts] = useState<Map<string, number>>(new Map());
  const [headingsMap, setHeadingsMap] = useState<Map<string, Array<{ level: number; text: string; pos: number }>>>(new Map());
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const activeFileRef = useRef(activeFile);
  activeFileRef.current = activeFile;
  const lastMtimeRef = useRef<number>(0);
  const modifiedFilesRef = useRef(modifiedFiles);
  modifiedFilesRef.current = modifiedFiles;
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const editorScrollFnsRef = useRef<Map<string, (pos: number) => void>>(new Map());
  const modifiedFilesSet = useMemo(() => new Set(modifiedFiles.keys()), [modifiedFiles]);
  const wordCount = activeFile ? (wordCounts.get(activeFile) ?? 0) : 0;
  const headings = activeFile ? (headingsMap.get(activeFile) ?? []) : [];

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("hashmark-dark-mode", String(dark));
  }, [dark]);

  useEffect(() => {
    localStorage.setItem("hashmark-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem("hashmark-sidebar-view", sidebarView);
  }, [sidebarView]);

  useEffect(() => {
    localStorage.setItem("hashmark-open-files", JSON.stringify(openFiles));
  }, [openFiles]);

  useEffect(() => {
    if (activeFile) localStorage.setItem("hashmark-active-file", activeFile);
    else localStorage.removeItem("hashmark-active-file");
  }, [activeFile]);

  // Open folder from CLI arg, or restore last session
  useEffect(() => {
    invoke<string | null>("get_cli_folder").then((cliFolder) => {
      if (cliFolder) {
        handleFolderSelect(cliFolder);
      } else {
        const saved = localStorage.getItem("hashmark-last-folder");
        if (saved) handleFolderSelect(saved, true);
      }
    }).catch(() => {
      const saved = localStorage.getItem("hashmark-last-folder");
      if (saved) handleFolderSelect(saved, true);
    });
  }, []);

  useEffect(() => {
    if (rootPath) localStorage.setItem("hashmark-last-folder", rootPath);
  }, [rootPath]);

  const refreshTree = useCallback(async (path: string) => {
    const tree = await loadFileTree(path);
    setFiles(tree);
  }, []);

  const refreshGitStatus = useCallback(async (path: string) => {
    try {
      const statuses = await getGitStatus(path);
      setGitStatuses(statuses);
    } catch {
      // Not a git repo or git not available
    }
  }, []);

  const handleFolderSelect = useCallback(async (path: string, restoreSession = false) => {
    setRootPath(path);
    if (!restoreSession) {
      setActiveFile(null);
      setOpenFiles([]);
    }
    // Ensure recursive fs scope for CLI and session restore paths
    try { await invoke("allow_directory", { path }); } catch { /* dialog already set scope */ }
    await refreshTree(path);
    try {
      const root = await getGitRoot(path);
      const gitRepo = root != null;
      setIsGitRepo(gitRepo);
      if (gitRepo) refreshGitStatus(path);
    } catch {
      setIsGitRepo(false);
    }
    if (restoreSession) {
      try {
        const savedFiles: string[] = JSON.parse(localStorage.getItem("hashmark-open-files") ?? "[]");
        const validFiles: string[] = [];
        for (const f of savedFiles) {
          try {
            await getFileMtime(f);
            validFiles.push(f);
          } catch { /* file no longer exists */ }
        }
        setOpenFiles(validFiles);
        const savedActive = localStorage.getItem("hashmark-active-file");
        if (savedActive && validFiles.includes(savedActive)) {
          setActiveFile(savedActive);
        } else if (validFiles.length > 0) {
          setActiveFile(validFiles[0]);
        } else {
          setActiveFile(null);
        }
      } catch {
        setActiveFile(null);
        setOpenFiles([]);
      }
    }
  }, [refreshTree, refreshGitStatus]);

  const handleOpenFolder = useCallback(async () => {
    const path = await selectFolder();
    if (path) handleFolderSelect(path);
  }, [handleFolderSelect]);

  function handleFileSelect(path: string) {
    setActiveFile(path);
    setOpenFiles((prev) => prev.includes(path) ? prev : [...prev, path]);
    setSaveStatus(modifiedFiles.has(path) ? "unsaved" : "saved");
    setPendingSearchTerm(undefined);
  }

  function handleFileCreated() {
    if (rootPath) refreshTree(rootPath);
  }

  const handleHeadingClick = useCallback((pos: number) => {
    if (activeFileRef.current) {
      editorScrollFnsRef.current.get(activeFileRef.current)?.(pos);
    }
  }, []);

  const handleOpenFileAtMatch = useCallback((filePath: string, searchTerm: string) => {
    setActiveFile(filePath);
    setOpenFiles((prev) => prev.includes(filePath) ? prev : [...prev, filePath]);
    setPendingSearchTerm(searchTerm);
    setSaveStatus("saved");
  }, []);

  const handleCloseTab = useCallback((path: string) => {
    editorScrollFnsRef.current.delete(path);
    setWordCounts((prev) => { const next = new Map(prev); next.delete(path); return next; });
    setHeadingsMap((prev) => { const next = new Map(prev); next.delete(path); return next; });
    setOpenFiles((prev) => {
      const next = prev.filter((p) => p !== path);
      setActiveFile((current) => {
        if (current !== path) return current;
        if (next.length === 0) return null;
        const idx = prev.indexOf(path);
        return next[Math.min(idx, next.length - 1)] ?? null;
      });
      return next;
    });
  }, []);

  const handleReorderTabs = useCallback((newOrder: string[]) => {
    setOpenFiles(newOrder);
  }, []);

  const handleSelectTab = useCallback((path: string) => {
    setActiveFile(path);
    setSaveStatus(modifiedFiles.has(path) ? "unsaved" : "saved");
    setPendingSearchTerm(undefined);
  }, [modifiedFiles]);

  const handleContentChange = useCallback((path: string, markdown: string) => {
    setModifiedFiles((prev) => new Map(prev).set(path, markdown));
  }, []);

  const handleFileSaved = useCallback((path: string) => {
    setModifiedFiles((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
    if (isGitRepo && rootPath) refreshGitStatus(rootPath);
  }, [isGitRepo, rootPath, refreshGitStatus]);

  const handleRenameItem = useCallback(async (oldPath: string, newPath: string) => {
    await renameItem(oldPath, newPath);
    if (rootPath) refreshTree(rootPath);
    // Update open tabs if the renamed file was open
    setOpenFiles((prev) => prev.map((p) => {
      if (p === oldPath) return newPath;
      // Handle files inside a renamed folder
      if (p.startsWith(oldPath + "/")) return newPath + p.slice(oldPath.length);
      return p;
    }));
    setActiveFile((prev) => {
      if (prev === oldPath) return newPath;
      if (prev?.startsWith(oldPath + "/")) return newPath + prev.slice(oldPath.length);
      return prev;
    });
    // Move modified file buffers
    setModifiedFiles((prev) => {
      const next = new Map<string, string>();
      for (const [p, content] of prev) {
        if (p === oldPath) next.set(newPath, content);
        else if (p.startsWith(oldPath + "/")) next.set(newPath + p.slice(oldPath.length), content);
        else next.set(p, content);
      }
      return next;
    });
  }, [rootPath, refreshTree]);

  const handleDeleteItem = useCallback(async (path: string, isDirectory: boolean) => {
    const name = path.split("/").pop() ?? path;
    const confirmed = await confirm(
      `Are you sure you want to delete "${name}"${isDirectory ? " and all its contents" : ""}?`,
      { title: "Delete", kind: "warning" },
    );
    if (!confirmed) return;
    await deleteItem(path);
    if (rootPath) refreshTree(rootPath);
    // Close tabs for deleted files
    setOpenFiles((prev) => {
      const next = prev.filter((p) => p !== path && !p.startsWith(path + "/"));
      setActiveFile((current) => {
        if (!current || current === path || current.startsWith(path + "/")) {
          return next.length > 0 ? next[0] : null;
        }
        return current;
      });
      return next;
    });
    setModifiedFiles((prev) => {
      const next = new Map(prev);
      for (const p of next.keys()) {
        if (p === path || p.startsWith(path + "/")) next.delete(p);
      }
      return next;
    });
  }, [rootPath, refreshTree]);

  const handleRevealItem = useCallback(async (path: string) => {
    await revealInFinder(path);
  }, []);

  const saveAllFiles = useCallback(async () => {
    if (modifiedFiles.size === 0) return;
    setSaveStatus("saving");
    const entries = Array.from(modifiedFiles.entries());
    await Promise.all(entries.map(([path, content]) => writeFile(path, content)));
    setModifiedFiles(new Map());
    setSaveStatus("saved");
    if (isGitRepo && rootPath) refreshGitStatus(rootPath);
  }, [modifiedFiles, isGitRepo, rootPath, refreshGitStatus]);

  // File tree + git status polling
  useEffect(() => {
    if (!rootPath) return;
    const interval = setInterval(() => {
      refreshTree(rootPath);
      if (isGitRepo) refreshGitStatus(rootPath);
    }, 2000);
    return () => clearInterval(interval);
  }, [rootPath, isGitRepo, refreshTree, refreshGitStatus]);

  // External file change detection via mtime polling
  useEffect(() => {
    if (!activeFile) return;
    lastMtimeRef.current = 0;
    getFileMtime(activeFile).then((mt) => { lastMtimeRef.current = mt; }).catch(() => {});
    const interval = setInterval(async () => {
      if (!activeFile || modifiedFilesRef.current.has(activeFile)) return;
      try {
        const mt = await getFileMtime(activeFile);
        if (lastMtimeRef.current > 0 && mt !== lastMtimeRef.current) {
          lastMtimeRef.current = mt;
          setFileRevisions((prev) => {
            const next = new Map(prev);
            next.set(activeFile, (prev.get(activeFile) ?? 0) + 1);
            return next;
          });
        }
      } catch { /* file may have been deleted */ }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeFile]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setSidebarCollapsed(false);
        setSidebarView("search");
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "s") {
        e.preventDefault();
        saveAllFiles();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "w") {
        e.preventDefault();
        if (activeFileRef.current) handleCloseTab(activeFileRef.current);
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "t") {
        e.preventDefault();
        setShowNewFile(true);
        setSidebarCollapsed(false);
        setSidebarView("files");
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "p") {
        e.preventDefault();
        setShowQuickOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "p") {
        e.preventDefault();
        setShowCommandPalette(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveAllFiles, handleCloseTab]);

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

    listen("menu-save-all", () => {
      saveAllFiles();
    }).then((fn) => unlisten.push(fn));

    listen("menu-find", () => {
      // Cmd+F: open in-editor find bar (dispatched as keyboard event)
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true }));
    }).then((fn) => unlisten.push(fn));

    listen("menu-find-in-files", () => {
      setSidebarCollapsed(false);
      setSidebarView("search");
    }).then((fn) => unlisten.push(fn));

    listen("menu-toggle-sidebar", () => {
      setSidebarCollapsed((prev) => !prev);
    }).then((fn) => unlisten.push(fn));

    return () => {
      unlisten.forEach((fn) => fn());
    };
  }, [handleOpenFolder, saveAllFiles]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div className="drag-region" data-tauri-drag-region />

      <Sidebar
        files={files}
        activeFile={activeFile}
        rootPath={rootPath}
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onOpenFolder={handleOpenFolder}
        onFileSelect={handleFileSelect}
        onFileCreated={handleFileCreated}
        showNewFile={showNewFile}
        onShowNewFileChange={setShowNewFile}
        sidebarView={sidebarView}
        onSidebarViewChange={setSidebarView}
        onOpenFileAtMatch={handleOpenFileAtMatch}
        onRenameItem={handleRenameItem}
        onDeleteItem={handleDeleteItem}
        onRevealItem={handleRevealItem}
        modifiedFiles={modifiedFilesSet}
        gitStatuses={gitStatuses}
        headings={headings}
        onHeadingClick={handleHeadingClick}
      />
      {sidebarCollapsed && (
        <button
          className="sidebar-expand-btn"
          onClick={() => setSidebarCollapsed(false)}
          title="Expand Sidebar (⌘B)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
      )}
      <div className="editor-area">
        <div className="editor-topbar" data-tauri-drag-region>
          <span />
          <div className="editor-topbar-right drag-region-interactive">
            {activeFile && (
              <>
                <span className="word-count">{wordCount} {wordCount === 1 ? "word" : "words"}</span>
                <span className={`save-status ${saveStatus}`}>
                  {{ saved: "Saved", saving: "Saving...", unsaved: "Unsaved" }[saveStatus]}
                </span>
              </>
            )}
            <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
          </div>
        </div>
        <TabBar
          openFiles={openFiles}
          activeFile={activeFile}
          modifiedFiles={modifiedFilesSet}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onReorderTabs={handleReorderTabs}
        />
        <div id="find-bar-container" />
        <div className="editor-scroll" ref={editorScrollRef}>
          {openFiles.length > 0 ? (
            openFiles.map((path) => (
              <div
                key={path}
                style={{ display: path === activeFile ? undefined : "none", width: "100%" }}
              >
                <Editor
                  filePath={path}
                  revision={fileRevisions.get(path) ?? 0}
                  onSaveStatusChange={(s) => { if (activeFileRef.current === path) setSaveStatus(s); }}
                  onContentChange={handleContentChange}
                  onFileSaved={handleFileSaved}
                  initialContent={modifiedFiles.get(path)}
                  searchTerm={path === activeFile ? pendingSearchTerm : undefined}
                  onWordCountChange={(c) => { setWordCounts((prev) => new Map(prev).set(path, c)); }}
                  onHeadingsChange={(h) => { setHeadingsMap((prev) => new Map(prev).set(path, h)); }}
                  onEditorReady={(scrollFn) => { editorScrollFnsRef.current.set(path, scrollFn); }}
                />
              </div>
            ))
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

      {showQuickOpen && (
        <QuickOpen
          files={files}
          rootPath={rootPath}
          onSelect={handleFileSelect}
          onClose={() => setShowQuickOpen(false)}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          commands={[
            { label: "Toggle Sidebar", shortcut: "⌘B", action: () => setSidebarCollapsed((p) => !p) },
            { label: "Toggle Dark Mode", shortcut: "", action: () => setDark((p) => !p) },
            { label: "Open Folder", shortcut: "⌘O", action: () => handleOpenFolder() },
            { label: "New File", shortcut: "⌘T", action: () => { setShowNewFile(true); setSidebarCollapsed(false); setSidebarView("files"); } },
            { label: "Save All", shortcut: "⌘⇧S", action: () => saveAllFiles() },
            { label: "Find in File", shortcut: "⌘F", action: () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true })) },
            { label: "Find in Files", shortcut: "⌘⇧F", action: () => { setSidebarCollapsed(false); setSidebarView("search"); } },
            { label: "Show Files", shortcut: "", action: () => { setSidebarCollapsed(false); setSidebarView("files"); } },
            { label: "Show Search", shortcut: "", action: () => { setSidebarCollapsed(false); setSidebarView("search"); } },
            { label: "Show Outline", shortcut: "", action: () => { setSidebarCollapsed(false); setSidebarView("outline"); } },
            { label: "Close Tab", shortcut: "⌘W", action: () => { if (activeFileRef.current) handleCloseTab(activeFileRef.current); } },
            { label: "Quick Open", shortcut: "⌘P", action: () => setShowQuickOpen(true) },
          ]}
        />
      )}
    </div>
  );
}

export default App;
