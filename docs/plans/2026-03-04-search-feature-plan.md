# Search Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add in-file search/replace (Cmd+F) and global search/replace (Cmd+Shift+F) to Hashmark.

**Architecture:** Custom Tiptap extension using ProseMirror `Decoration.inline` for in-file highlights. React components for FindBar (in-file) and GlobalSearch (sidebar panel). Filesystem service extended with `searchInFiles()` for global search. Tauri native menu updated with Find/Find in Files items.

**Tech Stack:** Tiptap 3 / ProseMirror (decorations, plugins), React 19, Tauri 2 plugin-fs, TypeScript

---

### Task 1: SearchAndReplace Tiptap Extension

**Files:**
- Create: `src/extensions/search-and-replace.ts`

**Step 1: Create the extension file**

This extension creates a ProseMirror plugin that:
- Stores search state (searchTerm, replaceTerm, caseSensitive, wholeWord, useRegex, activeIndex)
- Scans the document text for matches and creates inline decorations
- Exposes Tiptap commands for all search operations

```typescript
// src/extensions/search-and-replace.ts
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SearchState {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  activeIndex: number;
  totalMatches: number;
}

const searchPluginKey = new PluginKey("searchAndReplace");

function getRegex(state: SearchState): RegExp | null {
  const { searchTerm, caseSensitive, wholeWord, useRegex } = state;
  if (!searchTerm) return null;

  try {
    let pattern = useRegex ? searchTerm : searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (wholeWord) pattern = `\\b${pattern}\\b`;
    return new RegExp(pattern, caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

function findMatches(doc: any, regex: RegExp): { from: number; to: number }[] {
  const matches: { from: number; to: number }[] = [];
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const text = node.text!;
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ from: pos + match.index, to: pos + match.index + match[0].length });
    }
  });
  return matches;
}

function createDecorations(doc: any, state: SearchState): { set: DecorationSet; total: number } {
  const regex = getRegex(state);
  if (!regex) return { set: DecorationSet.empty, total: 0 };

  const matches = findMatches(doc, regex);
  const activeIdx = ((state.activeIndex % matches.length) + matches.length) % matches.length;

  const decorations = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === activeIdx ? "search-highlight search-highlight-active" : "search-highlight",
    })
  );

  return { set: DecorationSet.create(doc, decorations), total: matches.length };
}

export const SearchAndReplace = Extension.create({
  name: "searchAndReplace",

  addStorage() {
    return {
      searchTerm: "",
      replaceTerm: "",
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      activeIndex: 0,
      totalMatches: 0,
      onStateChange: null as ((state: SearchState) => void) | null,
    };
  },

  addCommands() {
    return {
      setSearchTerm:
        (term: string) =>
        ({ editor }) => {
          this.storage.searchTerm = term;
          this.storage.activeIndex = 0;
          dispatchSearchUpdate(editor);
          return true;
        },

      setReplaceTerm:
        (term: string) =>
        () => {
          this.storage.replaceTerm = term;
          return true;
        },

      setSearchOption:
        (option: "caseSensitive" | "wholeWord" | "useRegex", value: boolean) =>
        ({ editor }) => {
          this.storage[option] = value;
          this.storage.activeIndex = 0;
          dispatchSearchUpdate(editor);
          return true;
        },

      nextMatch:
        () =>
        ({ editor }) => {
          this.storage.activeIndex++;
          dispatchSearchUpdate(editor);
          scrollToActiveMatch(editor);
          return true;
        },

      previousMatch:
        () =>
        ({ editor }) => {
          this.storage.activeIndex--;
          dispatchSearchUpdate(editor);
          scrollToActiveMatch(editor);
          return true;
        },

      replaceCurrentMatch:
        () =>
        ({ editor }) => {
          const state = getSearchState(this.storage);
          const regex = getRegex(state);
          if (!regex) return false;

          const matches = findMatches(editor.state.doc, regex);
          if (matches.length === 0) return false;

          const activeIdx = ((state.activeIndex % matches.length) + matches.length) % matches.length;
          const match = matches[activeIdx];

          editor
            .chain()
            .focus()
            .insertContentAt({ from: match.from, to: match.to }, this.storage.replaceTerm)
            .run();

          dispatchSearchUpdate(editor);
          return true;
        },

      replaceAllMatches:
        () =>
        ({ editor }) => {
          const state = getSearchState(this.storage);
          const regex = getRegex(state);
          if (!regex) return false;

          const matches = findMatches(editor.state.doc, regex);
          if (matches.length === 0) return false;

          // Replace in reverse order to maintain positions
          const chain = editor.chain().focus();
          for (let i = matches.length - 1; i >= 0; i--) {
            chain.insertContentAt({ from: matches[i].from, to: matches[i].to }, this.storage.replaceTerm);
          }
          chain.run();

          this.storage.activeIndex = 0;
          dispatchSearchUpdate(editor);
          return true;
        },

      clearSearch:
        () =>
        ({ editor }) => {
          this.storage.searchTerm = "";
          this.storage.replaceTerm = "";
          this.storage.activeIndex = 0;
          dispatchSearchUpdate(editor);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;

    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init(_, { doc }) {
            return { decorations: DecorationSet.empty, total: 0 };
          },
          apply(tr, prev, _, newState) {
            // Check for our custom metadata or doc changes
            if (tr.getMeta(searchPluginKey) || tr.docChanged) {
              const state = getSearchState(storage);
              const { set, total } = createDecorations(newState.doc, state);
              storage.totalMatches = total;
              storage.onStateChange?.(getSearchState(storage));
              return { decorations: set, total };
            }
            // Map decorations through document changes
            if (tr.docChanged) {
              return {
                decorations: prev.decorations.map(tr.mapping, tr.doc),
                total: prev.total,
              };
            }
            return prev;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

function getSearchState(storage: any): SearchState {
  return {
    searchTerm: storage.searchTerm,
    replaceTerm: storage.replaceTerm,
    caseSensitive: storage.caseSensitive,
    wholeWord: storage.wholeWord,
    useRegex: storage.useRegex,
    activeIndex: storage.activeIndex,
    totalMatches: storage.totalMatches,
  };
}

function dispatchSearchUpdate(editor: any) {
  editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, true));
}

function scrollToActiveMatch(editor: any) {
  // Wait for decorations to update, then scroll
  requestAnimationFrame(() => {
    const active = editor.view.dom.querySelector(".search-highlight-active");
    active?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/juanfreire/Documents/notemd && npx tsc --noEmit`
Expected: No errors related to search-and-replace.ts

**Step 3: Commit**

```bash
git add src/extensions/search-and-replace.ts
git commit -m "feat: add SearchAndReplace Tiptap extension with ProseMirror decorations"
```

---

### Task 2: FindBar Component

**Files:**
- Create: `src/components/FindBar.tsx`

**Step 1: Create the FindBar component**

```tsx
// src/components/FindBar.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import type { SearchState } from "../extensions/search-and-replace";

interface Props {
  editor: Editor;
  visible: boolean;
  onClose: () => void;
  initialSearchTerm?: string;
}

export default function FindBar({ editor, visible, onClose, initialSearchTerm }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchInfo, setMatchInfo] = useState({ activeIndex: 0, totalMatches: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync external initialSearchTerm
  useEffect(() => {
    if (initialSearchTerm && visible) {
      setSearchTerm(initialSearchTerm);
      editor.commands.setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm, visible]);

  // Focus search input when FindBar opens
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      editor.commands.clearSearch();
    }
  }, [visible, editor]);

  // Subscribe to search state changes
  useEffect(() => {
    const storage = editor.storage.searchAndReplace;
    storage.onStateChange = (state: SearchState) => {
      setMatchInfo({ activeIndex: state.activeIndex, totalMatches: state.totalMatches });
    };
    return () => {
      storage.onStateChange = null;
    };
  }, [editor]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      editor.commands.setSearchTerm(value);
    },
    [editor]
  );

  const handleReplaceChange = useCallback(
    (value: string) => {
      setReplaceTerm(value);
      editor.commands.setReplaceTerm(value);
    },
    [editor]
  );

  const toggleOption = useCallback(
    (option: "caseSensitive" | "wholeWord" | "useRegex", current: boolean, setter: (v: boolean) => void) => {
      setter(!current);
      editor.commands.setSearchOption(option, !current);
    },
    [editor]
  );

  const handleClose = useCallback(() => {
    editor.commands.clearSearch();
    onClose();
  }, [editor, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        editor.commands.nextMatch();
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        editor.commands.previousMatch();
      }
    },
    [editor, handleClose]
  );

  if (!visible) return null;

  const displayIndex = matchInfo.totalMatches > 0
    ? ((matchInfo.activeIndex % matchInfo.totalMatches + matchInfo.totalMatches) % matchInfo.totalMatches) + 1
    : 0;

  return (
    <div className="find-bar" onKeyDown={handleKeyDown}>
      <div className="find-bar-row">
        <button
          className={`find-bar-toggle ${showReplace ? "expanded" : ""}`}
          onClick={() => setShowReplace(!showReplace)}
          title="Toggle Replace"
        >
          ▸
        </button>

        <input
          ref={searchInputRef}
          className="find-bar-input"
          type="text"
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Find..."
          spellCheck={false}
        />

        <button
          className={`find-bar-option ${caseSensitive ? "active" : ""}`}
          onClick={() => toggleOption("caseSensitive", caseSensitive, setCaseSensitive)}
          title="Case Sensitive"
        >
          Aa
        </button>
        <button
          className={`find-bar-option ${wholeWord ? "active" : ""}`}
          onClick={() => toggleOption("wholeWord", wholeWord, setWholeWord)}
          title="Whole Word"
        >
          W
        </button>
        <button
          className={`find-bar-option ${useRegex ? "active" : ""}`}
          onClick={() => toggleOption("useRegex", useRegex, setUseRegex)}
          title="Regex"
        >
          .*
        </button>

        <span className="find-bar-count">
          {matchInfo.totalMatches > 0 ? `${displayIndex}/${matchInfo.totalMatches}` : "No results"}
        </span>

        <button className="find-bar-nav" onClick={() => editor.commands.previousMatch()} title="Previous (Shift+Enter)">
          ▲
        </button>
        <button className="find-bar-nav" onClick={() => editor.commands.nextMatch()} title="Next (Enter)">
          ▼
        </button>

        <button className="find-bar-close" onClick={handleClose} title="Close (Escape)">
          ✕
        </button>
      </div>

      {showReplace && (
        <div className="find-bar-row find-bar-replace-row">
          <div className="find-bar-toggle-spacer" />
          <input
            className="find-bar-input"
            type="text"
            value={replaceTerm}
            onChange={(e) => handleReplaceChange(e.target.value)}
            placeholder="Replace..."
            spellCheck={false}
          />
          <button className="find-bar-action" onClick={() => editor.commands.replaceCurrentMatch()}>
            Replace
          </button>
          <button className="find-bar-action" onClick={() => editor.commands.replaceAllMatches()}>
            All
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/juanfreire/Documents/notemd && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/FindBar.tsx
git commit -m "feat: add FindBar component for in-file search/replace UI"
```

---

### Task 3: Integrate FindBar into Editor

**Files:**
- Modify: `src/components/Editor.tsx`

**Step 1: Add the SearchAndReplace extension and FindBar to Editor**

Changes to `src/components/Editor.tsx`:

1. Add imports at top (after existing imports):
```typescript
import { SearchAndReplace } from "../extensions/search-and-replace";
import FindBar from "./FindBar";
```

2. Add state for FindBar visibility inside the `Editor` component (after `initialContentRef` on line 28):
```typescript
const [findBarVisible, setFindBarVisible] = useState(false);
const [initialSearchTerm, setInitialSearchTerm] = useState<string | undefined>();
```

3. Add `useState` to the React import on line 1:
```typescript
import { useEffect, useRef, useState } from "react";
```

4. Add `SearchAndReplace` to the extensions array (after `SlashCommands` config, around line 99):
```typescript
SearchAndReplace,
```

5. Add Cmd+F keyboard handler in the existing keydown effect (in the `handleKeyDown` function around line 157, BEFORE the Cmd+S check):
```typescript
if ((e.metaKey || e.ctrlKey) && e.key === "f") {
  e.preventDefault();
  setFindBarVisible(true);
  return;
}
```

6. Add props for external search term control. Change the Props interface:
```typescript
interface Props {
  filePath: string;
  onSaveStatusChange: (status: "saved" | "saving" | "unsaved") => void;
  searchTerm?: string;
  onFindBarVisibilityChange?: (visible: boolean) => void;
}
```

7. Update the component signature and add effect for external searchTerm:
```typescript
export default function Editor({ filePath, onSaveStatusChange, searchTerm, onFindBarVisibilityChange }: Props) {
```

And add an effect (after the Cmd+S effect):
```typescript
useEffect(() => {
  if (searchTerm) {
    setInitialSearchTerm(searchTerm);
    setFindBarVisible(true);
  }
}, [searchTerm]);
```

8. Update the return JSX (replace the existing return starting at line 185):
```tsx
return (
  <div className="editor-container">
    <FindBar
      editor={editor}
      visible={findBarVisible}
      onClose={() => {
        setFindBarVisible(false);
        onFindBarVisibilityChange?.(false);
        editor.commands.focus();
      }}
      initialSearchTerm={initialSearchTerm}
    />
    <BubbleMenu editor={editor} />
    <EditorContent editor={editor} />
  </div>
);
```

**Step 2: Verify it compiles**

Run: `cd /Users/juanfreire/Documents/notemd && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/Editor.tsx
git commit -m "feat: integrate SearchAndReplace extension and FindBar into Editor"
```

---

### Task 4: FindBar and Search Highlight Styles

**Files:**
- Modify: `src/styles.css`

**Step 1: Add CSS at the end of `src/styles.css`**

```css
/* ---- Search Highlights ---- */
.search-highlight {
  background: var(--accent-soft);
  border-radius: 2px;
}

.search-highlight-active {
  background: var(--accent);
  color: #1c1917;
  border-radius: 2px;
}

/* ---- Find Bar ---- */
.find-bar {
  border-bottom: 1px solid var(--border);
  padding: 8px 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  background: var(--bg-editor);
  flex-shrink: 0;
}

.find-bar-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.find-bar-replace-row {
  margin-top: 6px;
}

.find-bar-toggle {
  width: 20px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 10px;
  border-radius: 4px;
  transition: transform 0.15s;
  flex-shrink: 0;
}

.find-bar-toggle:hover {
  color: var(--text-secondary);
}

.find-bar-toggle.expanded {
  transform: rotate(90deg);
}

.find-bar-toggle-spacer {
  width: 20px;
  flex-shrink: 0;
}

.find-bar-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-app);
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
}

.find-bar-input:focus {
  border-color: var(--accent);
}

.find-bar-option {
  width: 26px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: none;
  color: var(--text-tertiary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  font-family: 'IBM Plex Mono', monospace;
  transition: all 0.12s;
  flex-shrink: 0;
}

.find-bar-option:hover {
  color: var(--text-secondary);
  background: var(--bg-sidebar-hover);
}

.find-bar-option.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}

.find-bar-count {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: 'IBM Plex Mono', monospace;
  min-width: 60px;
  text-align: center;
  flex-shrink: 0;
}

.find-bar-nav {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--text-tertiary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 9px;
  transition: all 0.12s;
  flex-shrink: 0;
}

.find-bar-nav:hover {
  background: var(--bg-sidebar-hover);
  color: var(--text-secondary);
}

.find-bar-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--text-tertiary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.12s;
  flex-shrink: 0;
}

.find-bar-close:hover {
  background: var(--bg-sidebar-hover);
  color: var(--text-secondary);
}

.find-bar-action {
  padding: 3px 10px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.12s;
  flex-shrink: 0;
}

.find-bar-action:hover {
  background: var(--bg-sidebar-hover);
  color: var(--text-primary);
}
```

**Step 2: Verify manually**

Run: `cd /Users/juanfreire/Documents/notemd && npm run dev`
Open the app. Open a file. Press Cmd+F. Verify:
- FindBar appears below the topbar
- Type a search term → matches highlighted in yellow
- Active match highlighted in orange
- Navigation arrows cycle through matches
- Replace works
- Escape closes

**Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add FindBar and search highlight styles"
```

---

### Task 5: Global Search Service

**Files:**
- Modify: `src/services/filesystem.ts`
- Modify: `src/types.ts`

**Step 1: Add search types to `src/types.ts`**

Append after the `FileNode` interface:

```typescript
export interface SearchMatch {
  line: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

export interface FileSearchResult {
  filePath: string;
  fileName: string;
  matches: SearchMatch[];
}
```

**Step 2: Add search functions to `src/services/filesystem.ts`**

Add at the end of the file:

```typescript
function collectFiles(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.isDirectory && node.children) {
      paths.push(...collectFiles(node.children));
    } else if (!node.isDirectory) {
      paths.push(node.path);
    }
  }
  return paths;
}

export async function searchInFiles(
  rootPath: string,
  searchTerm: string,
  options: { caseSensitive?: boolean; wholeWord?: boolean; useRegex?: boolean } = {}
): Promise<FileSearchResult[]> {
  if (!searchTerm) return [];

  const tree = await loadFileTree(rootPath);
  const filePaths = collectFiles(tree);

  let pattern: string;
  try {
    pattern = options.useRegex ? searchTerm : searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (options.wholeWord) pattern = `\\b${pattern}\\b`;
  } catch {
    return [];
  }

  const regex = new RegExp(pattern, options.caseSensitive ? "g" : "gi");
  const results: FileSearchResult[] = [];

  for (const filePath of filePaths) {
    try {
      const content = await readTextFile(filePath);
      const lines = content.split("\n");
      const matches: SearchMatch[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(line)) !== null) {
          matches.push({
            line: i + 1,
            lineContent: line,
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
          });
        }
      }

      if (matches.length > 0) {
        const fileName = filePath.split("/").pop() ?? filePath;
        results.push({ filePath, fileName, matches });
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}

export async function replaceInFile(
  filePath: string,
  searchTerm: string,
  replaceTerm: string,
  options: { caseSensitive?: boolean; wholeWord?: boolean; useRegex?: boolean } = {}
): Promise<number> {
  const content = await readTextFile(filePath);

  let pattern: string;
  try {
    pattern = options.useRegex ? searchTerm : searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (options.wholeWord) pattern = `\\b${pattern}\\b`;
  } catch {
    return 0;
  }

  const regex = new RegExp(pattern, options.caseSensitive ? "g" : "gi");
  const matches = content.match(regex);
  if (!matches) return 0;

  const newContent = content.replace(regex, replaceTerm);
  await writeTextFile(filePath, newContent);
  return matches.length;
}
```

Also add the import for `FileSearchResult` and `SearchMatch` at the top of `filesystem.ts`:

```typescript
import { FileNode, FileSearchResult, SearchMatch } from "../types";
```

(Note: `SearchMatch` is imported to avoid "unused" warnings — it's re-exported via `FileSearchResult`.)

**Step 3: Verify it compiles**

Run: `cd /Users/juanfreire/Documents/notemd && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/types.ts src/services/filesystem.ts
git commit -m "feat: add global search and replace-in-file to filesystem service"
```

---

### Task 6: GlobalSearch Component

**Files:**
- Create: `src/components/GlobalSearch.tsx`

**Step 1: Create the component**

```tsx
// src/components/GlobalSearch.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { searchInFiles, replaceInFile } from "../services/filesystem";
import type { FileSearchResult } from "../types";

interface Props {
  rootPath: string;
  onOpenFileAtMatch: (filePath: string, searchTerm: string) => void;
}

export default function GlobalSearch({ rootPath, onOpenFileAtMatch }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const doSearch = useCallback(
    async (term: string) => {
      if (!term.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const r = await searchInFiles(rootPath, term, { caseSensitive, wholeWord, useRegex });
        setResults(r);
        setExpandedFiles(new Set(r.map((f) => f.filePath)));
      } catch {
        setResults([]);
      }
      setSearching(false);
    },
    [rootPath, caseSensitive, wholeWord, useRegex]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value), 300);
    },
    [doSearch]
  );

  // Re-search when options change
  useEffect(() => {
    if (searchTerm.trim()) doSearch(searchTerm);
  }, [caseSensitive, wholeWord, useRegex]);

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleReplaceInFile = async (filePath: string) => {
    const count = await replaceInFile(filePath, searchTerm, replaceTerm, { caseSensitive, wholeWord, useRegex });
    if (count > 0) doSearch(searchTerm);
  };

  const handleReplaceAll = async () => {
    const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);
    if (!confirm(`Replace ${totalMatches} occurrences in ${results.length} files?`)) return;
    for (const result of results) {
      await replaceInFile(result.filePath, searchTerm, replaceTerm, { caseSensitive, wholeWord, useRegex });
    }
    doSearch(searchTerm);
  };

  const relativePath = (fullPath: string) => {
    return fullPath.startsWith(rootPath) ? fullPath.slice(rootPath.length + 1) : fullPath;
  };

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  return (
    <div className="global-search">
      <div className="global-search-inputs">
        <div className="global-search-row">
          <button
            className={`find-bar-toggle ${showReplace ? "expanded" : ""}`}
            onClick={() => setShowReplace(!showReplace)}
            title="Toggle Replace"
          >
            ▸
          </button>
          <input
            ref={searchInputRef}
            className="find-bar-input"
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search in files..."
            spellCheck={false}
          />
        </div>

        <div className="global-search-options">
          <button
            className={`find-bar-option ${caseSensitive ? "active" : ""}`}
            onClick={() => setCaseSensitive(!caseSensitive)}
            title="Case Sensitive"
          >
            Aa
          </button>
          <button
            className={`find-bar-option ${wholeWord ? "active" : ""}`}
            onClick={() => setWholeWord(!wholeWord)}
            title="Whole Word"
          >
            W
          </button>
          <button
            className={`find-bar-option ${useRegex ? "active" : ""}`}
            onClick={() => setUseRegex(!useRegex)}
            title="Regex"
          >
            .*
          </button>
          {totalMatches > 0 && (
            <span className="global-search-count">
              {totalMatches} result{totalMatches !== 1 ? "s" : ""} in {results.length} file{results.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {showReplace && (
          <div className="global-search-row">
            <div className="find-bar-toggle-spacer" />
            <input
              className="find-bar-input"
              type="text"
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              placeholder="Replace..."
              spellCheck={false}
            />
            <button className="find-bar-action" onClick={handleReplaceAll} disabled={results.length === 0}>
              All
            </button>
          </div>
        )}
      </div>

      <div className="global-search-results">
        {searching && <div className="global-search-status">Searching...</div>}
        {!searching && searchTerm && results.length === 0 && (
          <div className="global-search-status">No results found</div>
        )}

        {results.map((fileResult) => (
          <div key={fileResult.filePath} className="global-search-file">
            <button className="global-search-file-header" onClick={() => toggleFile(fileResult.filePath)}>
              <span className="tree-dir-icon">{expandedFiles.has(fileResult.filePath) ? "▾" : "▸"}</span>
              <span className="global-search-file-name">{relativePath(fileResult.filePath)}</span>
              <span className="global-search-file-count">{fileResult.matches.length}</span>
            </button>

            {showReplace && (
              <button
                className="global-search-file-replace"
                onClick={() => handleReplaceInFile(fileResult.filePath)}
                title="Replace all in this file"
              >
                Replace
              </button>
            )}

            {expandedFiles.has(fileResult.filePath) &&
              fileResult.matches.map((match, i) => (
                <button
                  key={`${match.line}-${match.matchStart}-${i}`}
                  className="global-search-match"
                  onClick={() => onOpenFileAtMatch(fileResult.filePath, searchTerm)}
                >
                  <span className="global-search-match-line">{match.line}</span>
                  <span className="global-search-match-text">
                    {match.lineContent.slice(0, match.matchStart)}
                    <mark>{match.lineContent.slice(match.matchStart, match.matchEnd)}</mark>
                    {match.lineContent.slice(match.matchEnd)}
                  </span>
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/juanfreire/Documents/notemd && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/GlobalSearch.tsx
git commit -m "feat: add GlobalSearch component with sidebar panel UI"
```

---

### Task 7: Integrate GlobalSearch into Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: Add tabs and GlobalSearch to Sidebar**

Changes to `src/components/Sidebar.tsx`:

1. Add import at top:
```typescript
import GlobalSearch from "./GlobalSearch";
```

2. Add `sidebarView` and new props to the Props interface:
```typescript
interface Props {
  files: FileNode[];
  activeFile: string | null;
  rootPath: string | null;
  onFolderSelect: (path: string) => void;
  onFileSelect: (path: string) => void;
  onFileCreated: () => void;
  showNewFile?: boolean;
  onShowNewFileChange?: (show: boolean) => void;
  sidebarView: "files" | "search";
  onSidebarViewChange: (view: "files" | "search") => void;
  onOpenFileAtMatch: (filePath: string, searchTerm: string) => void;
}
```

3. Update component signature to destructure new props:
```typescript
export default function Sidebar({ files, activeFile, rootPath, onFolderSelect, onFileSelect, onFileCreated, showNewFile, onShowNewFileChange, sidebarView, onSidebarViewChange, onOpenFileAtMatch }: Props) {
```

4. Replace the sidebar-header JSX section (lines 43-68 approximately) with tabs:

Replace the entire `<aside>` return with:
```tsx
return (
  <aside className="sidebar">
    <div className="sidebar-header">
      <h1>Hashmark</h1>
      <div className="sidebar-actions">
        <button
          onClick={() => onSidebarViewChange("files")}
          className={`sidebar-btn ${sidebarView === "files" ? "sidebar-btn-active" : ""}`}
          title="Files"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 3.5v7a1 1 0 001 1h9a1 1 0 001-1v-5a1 1 0 00-1-1H7L5.5 2.5H2.5a1 1 0 00-1 1z" />
          </svg>
        </button>
        <button
          onClick={() => onSidebarViewChange("search")}
          className={`sidebar-btn ${sidebarView === "search" ? "sidebar-btn-active" : ""}`}
          title="Search (⌘⇧F)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="6" cy="6" r="4" />
            <line x1="9" y1="9" x2="12" y2="12" />
          </svg>
        </button>
        {rootPath && sidebarView === "files" && (
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="sidebar-btn"
            title="New file"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="7" y1="3" x2="7" y2="11" />
              <line x1="3" y1="7" x2="11" y2="7" />
            </svg>
          </button>
        )}
      </div>
    </div>

    {sidebarView === "files" ? (
      <>
        {isCreating && (
          <div style={{ padding: "8px" }}>
            <input
              autoFocus
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFile();
                if (e.key === "Escape") setIsCreating(false);
              }}
              placeholder="filename.md"
              className="new-file-input"
            />
          </div>
        )}

        <nav className="sidebar-nav">
          {!rootPath && (
            <p className="sidebar-empty">
              Open a folder to start editing your Markdown files
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
      </>
    ) : (
      rootPath && (
        <GlobalSearch
          rootPath={rootPath}
          onOpenFileAtMatch={onOpenFileAtMatch}
        />
      )
    )}
  </aside>
);
```

**Step 2: Verify it compiles**

Run: `cd /Users/juanfreire/Documents/notemd && npx tsc --noEmit`
Expected: No errors (may show error in App.tsx since we haven't updated it yet — that's Task 8)

**Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add Files/Search tabs to sidebar with GlobalSearch integration"
```

---

### Task 8: Wire Everything Together in App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Update App.tsx with search state and new callbacks**

Full updated `src/App.tsx`:

1. Add `sidebarView` state (after `showNewFile` state, line 15):
```typescript
const [sidebarView, setSidebarView] = useState<"files" | "search">("files");
const [pendingSearchTerm, setPendingSearchTerm] = useState<string | undefined>();
```

2. Add Cmd+Shift+F listener in the menu events `useEffect` (after the "menu-save" listener, around line 58):
```typescript
listen("menu-find", () => {
  // Handled by Editor component directly
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true }));
}).then((fn) => unlisten.push(fn));

listen("menu-find-in-files", () => {
  setSidebarView("search");
}).then((fn) => unlisten.push(fn));
```

3. Add a global keyboard listener for Cmd+Shift+F (new useEffect after menu events):
```typescript
useEffect(() => {
  function handleGlobalKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
      e.preventDefault();
      setSidebarView("search");
    }
  }
  window.addEventListener("keydown", handleGlobalKeyDown);
  return () => window.removeEventListener("keydown", handleGlobalKeyDown);
}, []);
```

4. Add `handleOpenFileAtMatch` callback (after `handleFileCreated`):
```typescript
function handleOpenFileAtMatch(filePath: string, searchTerm: string) {
  setActiveFile(filePath);
  setSaveStatus("saved");
  setPendingSearchTerm(searchTerm);
}
```

5. Update Sidebar props in JSX:
```tsx
<Sidebar
  files={files}
  activeFile={activeFile}
  rootPath={rootPath}
  onFolderSelect={handleFolderSelect}
  onFileSelect={handleFileSelect}
  onFileCreated={handleFileCreated}
  showNewFile={showNewFile}
  onShowNewFileChange={setShowNewFile}
  sidebarView={sidebarView}
  onSidebarViewChange={setSidebarView}
  onOpenFileAtMatch={handleOpenFileAtMatch}
/>
```

6. Update Editor props in JSX:
```tsx
<Editor
  key={activeFile}
  filePath={activeFile}
  onSaveStatusChange={setSaveStatus}
  searchTerm={pendingSearchTerm}
/>
```

7. Clear pendingSearchTerm when switching files normally. Update `handleFileSelect`:
```typescript
function handleFileSelect(path: string) {
  setActiveFile(path);
  setSaveStatus("saved");
  setPendingSearchTerm(undefined);
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/juanfreire/Documents/notemd && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire search state and Cmd+Shift+F handler into App"
```

---

### Task 9: GlobalSearch Styles

**Files:**
- Modify: `src/styles.css`

**Step 1: Add GlobalSearch styles at the end of `src/styles.css`**

```css
/* ---- Global Search ---- */
.global-search {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.global-search-inputs {
  padding: 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.global-search-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.global-search-options {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-left: 24px;
}

.global-search-count {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: 'IBM Plex Mono', monospace;
  margin-left: auto;
}

.global-search-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.global-search-status {
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
  padding: 16px;
}

.global-search-file {
  margin-bottom: 2px;
}

.global-search-file-header {
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  border-radius: 4px;
  transition: background 0.12s;
}

.global-search-file-header:hover {
  background: var(--bg-sidebar-hover);
}

.global-search-file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-search-file-count {
  font-size: 10px;
  color: var(--text-tertiary);
  background: var(--bg-sidebar-hover);
  border-radius: 8px;
  padding: 1px 6px;
  font-family: 'IBM Plex Mono', monospace;
}

.global-search-file-replace {
  font-size: 11px;
  color: var(--text-secondary);
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 8px;
  cursor: pointer;
  margin-left: 28px;
  margin-bottom: 2px;
  font-family: inherit;
  transition: all 0.12s;
}

.global-search-file-replace:hover {
  background: var(--bg-sidebar-hover);
}

.global-search-match {
  width: 100%;
  text-align: left;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 8px 3px 28px;
  font-size: 12px;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  border-radius: 4px;
  transition: background 0.12s;
}

.global-search-match:hover {
  background: var(--bg-sidebar-hover);
}

.global-search-match-line {
  font-size: 10px;
  color: var(--text-tertiary);
  font-family: 'IBM Plex Mono', monospace;
  min-width: 24px;
  text-align: right;
  flex-shrink: 0;
}

.global-search-match-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.global-search-match-text mark {
  background: var(--accent-soft);
  color: var(--text-accent);
  border-radius: 2px;
  padding: 0 1px;
}

/* ---- Sidebar Tab Active State ---- */
.sidebar-btn-active {
  color: var(--text-primary);
  background: var(--bg-sidebar-active);
}
```

**Step 2: Verify manually**

Run: `cd /Users/juanfreire/Documents/notemd && npm run dev`
Open the app. Open a folder. Press Cmd+Shift+F. Verify:
- Sidebar switches to search view
- Search input appears and is focused
- Typing shows results grouped by file
- Click a result opens the file with FindBar active
- Replace works across files
- Files/Search tabs toggle correctly

**Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add GlobalSearch panel and sidebar tab styles"
```

---

### Task 10: Tauri Native Menu Items for Find

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add Find and Find in Files menu items**

In `src-tauri/src/lib.rs`, add after the `save` menu item (line 20-21):

```rust
let find = MenuItemBuilder::with_id("find", "Find")
    .accelerator("CmdOrCtrl+F")
    .build(app)?;

let find_in_files = MenuItemBuilder::with_id("find_in_files", "Find in Files...")
    .accelerator("CmdOrCtrl+Shift+F")
    .build(app)?;

let find_and_replace = MenuItemBuilder::with_id("find_and_replace", "Find and Replace")
    .accelerator("CmdOrCtrl+H")
    .build(app)?;
```

Add these items to the edit_menu (replace the current edit_menu builder, lines 33-41):
```rust
let edit_menu = SubmenuBuilder::new(app, "Edit")
    .undo()
    .redo()
    .separator()
    .cut()
    .copy()
    .paste()
    .select_all()
    .separator()
    .item(&find)
    .item(&find_and_replace)
    .item(&find_in_files)
    .build()?;
```

Add event handlers in `on_menu_event` (after the "save" handler, line 66-68):
```rust
"find" => {
    let _ = app.emit("menu-find", ());
}
"find_in_files" => {
    let _ = app.emit("menu-find-in-files", ());
}
"find_and_replace" => {
    let _ = app.emit("menu-find", ());
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/juanfreire/Documents/notemd && cd src-tauri && cargo check`
Expected: No errors

**Step 3: Full integration test**

Run: `cd /Users/juanfreire/Documents/notemd && npm run tauri dev`
Verify:
- Edit menu shows Find, Find and Replace, Find in Files
- Cmd+F opens FindBar in editor
- Cmd+Shift+F opens global search in sidebar
- All search, replace, navigation features work
- Native menu items trigger the correct actions

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add Find, Find and Replace, Find in Files to native Edit menu"
```

---

## Summary

| Task | Component | Files |
|------|-----------|-------|
| 1 | SearchAndReplace extension | `src/extensions/search-and-replace.ts` (create) |
| 2 | FindBar component | `src/components/FindBar.tsx` (create) |
| 3 | Editor integration | `src/components/Editor.tsx` (modify) |
| 4 | FindBar + highlight styles | `src/styles.css` (modify) |
| 5 | Global search service | `src/services/filesystem.ts`, `src/types.ts` (modify) |
| 6 | GlobalSearch component | `src/components/GlobalSearch.tsx` (create) |
| 7 | Sidebar integration | `src/components/Sidebar.tsx` (modify) |
| 8 | App wiring | `src/App.tsx` (modify) |
| 9 | GlobalSearch styles | `src/styles.css` (modify) |
| 10 | Tauri native menu | `src-tauri/src/lib.rs` (modify) |
