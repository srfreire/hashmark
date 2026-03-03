# NoteMD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a desktop Markdown editor with Notion-like WYSIWYG editing, file tree sidebar, and auto-save, using Tauri v2 + React + Tiptap.

**Architecture:** Tauri v2 provides the desktop shell with native filesystem access via `@tauri-apps/plugin-fs`. React frontend renders a sidebar file tree and a Tiptap WYSIWYG editor. Markdown serialization via `tiptap-markdown` converts between `.md` files and editor state. Auto-save with debounce writes changes back to disk.

**Tech Stack:** Tauri v2, React 19, TypeScript, Tiptap v2, tiptap-markdown, Tailwind CSS v4, Vite

---

### Task 1: Scaffold Tauri + React project

**Files:**
- Create: entire project scaffold via `create-tauri-app`
- Modify: `package.json` (add dependencies)
- Modify: `src-tauri/Cargo.toml` (add fs plugin)
- Modify: `src-tauri/capabilities/default.json` (add fs permissions)
- Modify: `src-tauri/src/lib.rs` (register fs plugin)

**Step 1: Create Tauri project**

Run:
```bash
cd /Users/juanfreire/Documents/notemd
npm create tauri-app@latest . -- --template react-ts
```

Select TypeScript when prompted. If it asks about package manager, choose npm.

**Step 2: Install Tailwind CSS v4**

Run:
```bash
cd /Users/juanfreire/Documents/notemd
npm install tailwindcss @tailwindcss/vite
```

Update `vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

Replace `src/styles.css` content with:
```css
@import "tailwindcss";

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
```

**Step 3: Install Tauri FS plugin**

Run:
```bash
cd /Users/juanfreire/Documents/notemd
npm install @tauri-apps/plugin-fs @tauri-apps/plugin-dialog
cd src-tauri && cargo add tauri-plugin-fs tauri-plugin-dialog && cd ..
```

**Step 4: Register plugins in Rust**

Update `src-tauri/src/lib.rs`:
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 5: Add filesystem permissions**

Update `src-tauri/capabilities/default.json` — add to the `permissions` array:
```json
"fs:default",
"fs:allow-read-text-file",
"fs:allow-write-text-file",
"fs:allow-read-dir",
"fs:allow-mkdir",
"fs:allow-exists",
"fs:allow-remove",
"fs:allow-rename",
"dialog:default",
"dialog:allow-open"
```

**Step 6: Install Tiptap and extensions**

Run:
```bash
cd /Users/juanfreire/Documents/notemd
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-code-block-lowlight @tiptap/extension-link @tiptap/extension-underline @tiptap/extension-image tiptap-markdown lowlight
```

**Step 7: Clean up default scaffold**

Remove default scaffold files:
- Delete contents of `src/App.tsx`, `src/App.css`
- Delete `src/assets/` folder if present

Replace `src/App.tsx` with:
```tsx
function App() {
  return <div className="h-screen bg-white">NoteMD</div>;
}

export default App;
```

Replace `src/main.tsx` with:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 8: Verify it runs**

Run:
```bash
cd /Users/juanfreire/Documents/notemd
npm run tauri dev
```

Expected: Tauri window opens showing "NoteMD" text.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Tauri v2 + React + Tiptap + Tailwind project"
```

---

### Task 2: Build the filesystem service layer

**Files:**
- Create: `src/services/filesystem.ts`
- Create: `src/types.ts`

**Step 1: Create types**

Create `src/types.ts`:
```ts
export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}
```

**Step 2: Create filesystem service**

Create `src/services/filesystem.ts`:
```ts
import { readDir, readTextFile, writeTextFile, mkdir, exists, remove, rename, DirEntry } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { FileNode } from "../types";

export async function selectFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return selected as string | null;
}

async function buildTree(dirPath: string): Promise<FileNode[]> {
  const entries: DirEntry[] = await readDir(dirPath);
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (entry.name?.startsWith(".")) continue;

    const fullPath = `${dirPath}/${entry.name}`;

    if (entry.isDirectory) {
      const children = await buildTree(fullPath);
      // Only include directories that contain .md files (directly or nested)
      if (children.length > 0) {
        nodes.push({
          name: entry.name!,
          path: fullPath,
          isDirectory: true,
          children,
        });
      }
    } else if (entry.name?.endsWith(".md")) {
      nodes.push({
        name: entry.name!,
        path: fullPath,
        isDirectory: false,
      });
    }
  }

  return nodes.sort((a, b) => {
    if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
    return a.isDirectory ? -1 : 1;
  });
}

export async function loadFileTree(rootPath: string): Promise<FileNode[]> {
  return buildTree(rootPath);
}

export async function readFile(filePath: string): Promise<string> {
  return readTextFile(filePath);
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await writeTextFile(filePath, content);
}

export async function createFile(dirPath: string, fileName: string): Promise<string> {
  const name = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
  const fullPath = `${dirPath}/${name}`;
  await writeTextFile(fullPath, "");
  return fullPath;
}

export async function createFolder(parentPath: string, folderName: string): Promise<string> {
  const fullPath = `${parentPath}/${folderName}`;
  await mkdir(fullPath);
  return fullPath;
}

export async function deleteItem(itemPath: string): Promise<void> {
  await remove(itemPath, { recursive: true });
}

export async function renameItem(oldPath: string, newPath: string): Promise<void> {
  await rename(oldPath, newPath);
}
```

**Step 3: Commit**

```bash
git add src/services/filesystem.ts src/types.ts
git commit -m "feat: add filesystem service layer for file operations"
```

---

### Task 3: Build the Sidebar component

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/FileTreeItem.tsx`
- Modify: `src/App.tsx`

**Step 1: Create FileTreeItem component**

Create `src/components/FileTreeItem.tsx`:
```tsx
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
```

**Step 2: Create Sidebar component**

Create `src/components/Sidebar.tsx`:
```tsx
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
    <aside className="w-64 h-screen border-r border-gray-200 bg-gray-50 flex flex-col flex-shrink-0">
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-gray-800">NoteMD</h1>
        <div className="flex gap-1">
          {rootPath && (
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded text-sm"
              title="New file"
            >
              +
            </button>
          )}
          <button
            onClick={handleOpenFolder}
            className="p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded text-sm"
            title="Open folder"
          >
            📁
          </button>
        </div>
      </div>

      {isCreating && (
        <div className="p-2 border-b border-gray-200">
          <input
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFile();
              if (e.key === "Escape") setIsCreating(false);
            }}
            placeholder="filename.md"
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400"
          />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2">
        {!rootPath && (
          <p className="text-sm text-gray-400 text-center mt-8 px-4">
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
```

**Step 3: Wire up App with Sidebar**

Update `src/App.tsx`:
```tsx
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
```

**Step 4: Verify sidebar works**

Run:
```bash
cd /Users/juanfreire/Documents/notemd
npm run tauri dev
```

Expected: App opens with sidebar. Click folder icon to open a directory containing `.md` files. Files appear in tree.

**Step 5: Commit**

```bash
git add src/components/ src/App.tsx
git commit -m "feat: add sidebar with file tree navigation"
```

---

### Task 4: Build the Tiptap WYSIWYG editor

**Files:**
- Create: `src/components/Editor.tsx`
- Create: `src/components/BubbleMenu.tsx`
- Create: `src/components/SlashMenu.tsx`
- Create: `src/extensions/slash-command.ts`

**Step 1: Create the BubbleMenu component**

Create `src/components/BubbleMenu.tsx`:
```tsx
import { BubbleMenu as TiptapBubbleMenu, Editor } from "@tiptap/react";

interface Props {
  editor: Editor;
}

const btnClass = (active: boolean) =>
  `px-2 py-1 text-xs rounded transition-colors ${
    active ? "bg-white text-gray-900 shadow-sm" : "text-gray-300 hover:text-white"
  }`;

export default function BubbleMenu({ editor }: Props) {
  return (
    <TiptapBubbleMenu
      editor={editor}
      tippyOptions={{ duration: 150 }}
      className="bg-gray-800 rounded-lg shadow-xl flex items-center gap-0.5 p-1"
    >
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btnClass(editor.isActive("bold"))}
      >
        B
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btnClass(editor.isActive("italic"))}
      >
        I
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btnClass(editor.isActive("underline"))}
      >
        U
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={btnClass(editor.isActive("strike"))}
      >
        S
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={btnClass(editor.isActive("code"))}
      >
        {'</>'}
      </button>
      <div className="w-px h-4 bg-gray-600 mx-1" />
      <button
        onClick={() => {
          const url = window.prompt("URL:");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        className={btnClass(editor.isActive("link"))}
      >
        🔗
      </button>
    </TiptapBubbleMenu>
  );
}
```

**Step 2: Create the SlashMenu extension**

Create `src/extensions/slash-command.ts`:
```ts
import { Extension } from "@tiptap/core";
import Suggestion, { SuggestionOptions } from "@tiptap/suggestion";

export interface SlashMenuItem {
  title: string;
  description: string;
  icon: string;
  command: (props: { editor: any; range: any }) => void;
}

export const slashMenuItems: SlashMenuItem[] = [
  {
    title: "Heading 1",
    description: "Large heading",
    icon: "H1",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium heading",
    icon: "H2",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small heading",
    icon: "H3",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: "•",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    icon: "1.",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Task List",
    description: "Checklist with checkboxes",
    icon: "☑",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Code Block",
    description: "Code with syntax highlighting",
    icon: "{}",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Blockquote",
    description: "Quote block",
    icon: "❝",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: "—",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
];

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({ editor, range, props }: { editor: any; range: any; props: SlashMenuItem }) => {
          props.command({ editor, range });
        },
      } as Partial<SuggestionOptions>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
```

**Step 3: Create SlashMenu React component**

Create `src/components/SlashMenu.tsx`:
```tsx
import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { SlashMenuItem } from "../extensions/slash-command";

interface Props {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
}

export default forwardRef(function SlashMenu({ items, command }: Props, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) command(item);
    },
    [items, command]
  );

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden w-56">
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 p-3">No results</p>
      ) : (
        items.map((item, index) => (
          <button
            key={item.title}
            onClick={() => selectItem(index)}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
              index === selectedIndex ? "bg-gray-100" : "hover:bg-gray-50"
            }`}
          >
            <span className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded text-xs font-mono font-bold text-gray-600">
              {item.icon}
            </span>
            <div>
              <div className="font-medium text-gray-800">{item.title}</div>
              <div className="text-xs text-gray-400">{item.description}</div>
            </div>
          </button>
        ))
      )}
    </div>
  );
});
```

**Step 4: Create the Editor component**

Create `src/components/Editor.tsx`:
```tsx
import { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance } from "tippy.js";
import BubbleMenu from "./BubbleMenu";
import SlashMenu from "./SlashMenu";
import { SlashCommands, slashMenuItems, SlashMenuItem } from "../extensions/slash-command";
import { readFile, writeFile } from "../services/filesystem";

const lowlight = createLowlight(common);

interface Props {
  filePath: string;
  onSaveStatusChange: (status: "saved" | "saving" | "unsaved") => void;
}

export default function Editor({ filePath, onSaveStatusChange }: Props) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPathRef = useRef(filePath);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: "Type '/' for commands...",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Link.configure({ openOnClick: false }),
      Underline,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      SlashCommands.configure({
        suggestion: {
          items: ({ query }: { query: string }) => {
            return slashMenuItems.filter((item) =>
              item.title.toLowerCase().includes(query.toLowerCase())
            );
          },
          render: () => {
            let component: ReactRenderer | null = null;
            let popup: Instance[] | null = null;

            return {
              onStart: (props: any) => {
                component = new ReactRenderer(SlashMenu, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },
              onUpdate(props: any) {
                component?.updateProps(props);
                if (props.clientRect) {
                  popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect });
                }
              },
              onKeyDown(props: any) {
                if (props.event.key === "Escape") {
                  popup?.[0]?.hide();
                  return true;
                }
                return (component?.ref as any)?.onKeyDown(props);
              },
              onExit() {
                popup?.[0]?.destroy();
                component?.destroy();
              },
            };
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: "prose prose-gray max-w-none focus:outline-none min-h-[calc(100vh-4rem)] px-4 py-8",
      },
    },
    onUpdate: ({ editor }) => {
      onSaveStatusChange("unsaved");

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        const markdown = editor.storage.markdown.getMarkdown();
        onSaveStatusChange("saving");
        await writeFile(currentPathRef.current, markdown);
        onSaveStatusChange("saved");
      }, 1000);
    },
  });

  // Load file content when filePath changes
  useEffect(() => {
    currentPathRef.current = filePath;

    async function load() {
      const content = await readFile(filePath);
      if (editor) {
        editor.commands.setContent(content, false, { preserveWhitespace: "full" });
      }
      onSaveStatusChange("saved");
    }

    if (editor) load();
  }, [filePath, editor]);

  // Cleanup save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  if (!editor) return null;

  return (
    <div className="max-w-3xl mx-auto w-full">
      <BubbleMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
```

**Step 5: Install tippy.js for slash menu positioning**

Run:
```bash
cd /Users/juanfreire/Documents/notemd
npm install tippy.js
```

**Step 6: Commit**

```bash
git add src/components/Editor.tsx src/components/BubbleMenu.tsx src/components/SlashMenu.tsx src/extensions/
git commit -m "feat: add Tiptap WYSIWYG editor with bubble menu and slash commands"
```

---

### Task 5: Wire Editor into App with save status

**Files:**
- Modify: `src/App.tsx`

**Step 1: Update App to include Editor and status bar**

Update `src/App.tsx`:
```tsx
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
```

**Step 2: Verify full flow**

Run:
```bash
cd /Users/juanfreire/Documents/notemd
npm run tauri dev
```

Expected: Open a folder → click a `.md` file → editor loads content as WYSIWYG → type `/` to see slash menu → select text to see bubble menu → changes auto-save after 1s.

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire editor with app, add save status bar"
```

---

### Task 6: Add editor styles and typography

**Files:**
- Modify: `src/styles.css`

**Step 1: Add editor and typography styles**

Append to `src/styles.css`:
```css
/* Tiptap editor styles */
.tiptap {
  > * + * {
    margin-top: 0.75em;
  }

  h1 { font-size: 2em; font-weight: 700; line-height: 1.2; }
  h2 { font-size: 1.5em; font-weight: 600; line-height: 1.3; }
  h3 { font-size: 1.25em; font-weight: 600; line-height: 1.4; }

  ul, ol { padding-left: 1.5em; }

  ul[data-type="taskList"] {
    list-style: none;
    padding-left: 0;

    li {
      display: flex;
      align-items: flex-start;
      gap: 0.5em;

      label {
        margin-top: 0.15em;
      }

      > div {
        flex: 1;
      }
    }
  }

  pre {
    background: #1e1e2e;
    color: #cdd6f4;
    border-radius: 0.5em;
    padding: 1em;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    font-size: 0.875em;
    overflow-x: auto;

    code {
      background: none;
      color: inherit;
      padding: 0;
      font-size: inherit;
    }
  }

  code {
    background: #f1f5f9;
    color: #e11d48;
    padding: 0.15em 0.4em;
    border-radius: 0.25em;
    font-size: 0.9em;
  }

  blockquote {
    border-left: 3px solid #e2e8f0;
    padding-left: 1em;
    color: #64748b;
    font-style: italic;
  }

  hr {
    border: none;
    border-top: 2px solid #e2e8f0;
    margin: 2em 0;
  }

  a {
    color: #3b82f6;
    text-decoration: underline;
    cursor: pointer;
  }

  img {
    max-width: 100%;
    border-radius: 0.5em;
  }
}

.tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: #9ca3af;
  pointer-events: none;
  height: 0;
}
```

**Step 2: Verify styles**

Run `npm run tauri dev` and check headings, code blocks, blockquotes, and task lists render correctly.

**Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add editor typography and block styles"
```

---

### Task 7: Add dark mode support

**Files:**
- Modify: `src/App.tsx` (add theme toggle state)
- Create: `src/components/ThemeToggle.tsx`
- Modify: `src/styles.css` (add dark mode variants)

**Step 1: Create ThemeToggle component**

Create `src/components/ThemeToggle.tsx`:
```tsx
interface Props {
  dark: boolean;
  onToggle: () => void;
}

export default function ThemeToggle({ dark, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className="p-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-sm"
      title="Toggle theme"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
```

**Step 2: Add dark mode to App**

In `src/App.tsx`, add theme state and toggle:

Add to imports:
```tsx
import ThemeToggle from "./components/ThemeToggle";
```

Add state:
```tsx
const [dark, setDark] = useState(false);
```

Add effect to toggle class on `<html>`:
```tsx
useEffect(() => {
  document.documentElement.classList.toggle("dark", dark);
}, [dark]);
```

Add ThemeToggle button in the header bar (next to save status).

**Step 3: Add dark mode styles to `src/styles.css`**

Add dark mode variants using Tailwind `dark:` prefix throughout the components and add dark mode overrides for the editor:

```css
.dark .tiptap {
  color: #e2e8f0;

  pre {
    background: #0f172a;
  }

  code {
    background: #1e293b;
    color: #f472b6;
  }

  blockquote {
    border-left-color: #334155;
    color: #94a3b8;
  }

  hr {
    border-top-color: #334155;
  }
}
```

**Step 4: Update Sidebar and App with dark mode Tailwind classes**

Add `dark:bg-gray-900 dark:text-gray-100` etc. to the components' classNames.

**Step 5: Verify dark mode**

Toggle between light/dark. All elements should be readable.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add dark mode with theme toggle"
```

---

### Task 8: Final polish and edge cases

**Files:**
- Modify: `src/components/Editor.tsx` (handle empty files gracefully)
- Modify: `src-tauri/tauri.conf.json` (window title, size)

**Step 1: Configure Tauri window**

In `src-tauri/tauri.conf.json`, update the window config:
```json
{
  "app": {
    "windows": [
      {
        "title": "NoteMD",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600
      }
    ]
  }
}
```

**Step 2: Add Cmd+S manual save shortcut**

In `src/components/Editor.tsx`, add a keyboard shortcut handler:
```tsx
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (editor && saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (editor) {
        const markdown = editor.storage.markdown.getMarkdown();
        onSaveStatusChange("saving");
        writeFile(currentPathRef.current, markdown).then(() => {
          onSaveStatusChange("saved");
        });
      }
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [editor]);
```

**Step 3: Final test**

Run `npm run tauri dev` and verify:
- Open folder, browse files
- Click file, editor loads WYSIWYG content
- Type `/` → slash menu appears with block options
- Select text → bubble menu appears with formatting options
- Edit → auto-saves after 1s
- Cmd+S → instant save
- Dark mode toggle works
- Create new `.md` file via `+` button

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: window config, Cmd+S save, final polish"
```
