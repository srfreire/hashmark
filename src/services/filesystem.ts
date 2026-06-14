import { readDir, readTextFile, writeTextFile, mkdir, remove, rename, stat, DirEntry } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { FileNode, SearchMatch, FileSearchResult } from "../types";

export async function selectFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false, recursive: true });
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
      if (children.length > 0) {
        nodes.push({
          name: entry.name!,
          path: fullPath,
          isDirectory: true,
          children,
        });
      }
    } else if (entry.name && /\.(md|markdown|tex)$/i.test(entry.name)) {
      nodes.push({
        name: entry.name,
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

export function collectFiles(nodes: FileNode[]): string[] {
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

function buildSearchRegex(
  searchTerm: string,
  options: { caseSensitive?: boolean; wholeWord?: boolean; useRegex?: boolean },
): RegExp | null {
  if (!searchTerm) return null;

  let pattern = options.useRegex
    ? searchTerm
    : searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (options.wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }

  try {
    return new RegExp(pattern, options.caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

export async function searchInFiles(
  rootPath: string,
  searchTerm: string,
  options: { caseSensitive?: boolean; wholeWord?: boolean; useRegex?: boolean } = {},
): Promise<FileSearchResult[]> {
  if (!searchTerm) return [];

  const regex = buildSearchRegex(searchTerm, options);
  if (!regex) return [];

  const tree = await loadFileTree(rootPath);
  const filePaths = collectFiles(tree);
  const results: FileSearchResult[] = [];

  for (const filePath of filePaths) {
    try {
      const content = await readTextFile(filePath);
      const lines = content.split("\n");
      const matches: SearchMatch[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match: RegExpExecArray | null;

        regex.lastIndex = 0;
        while ((match = regex.exec(line)) !== null) {
          matches.push({
            line: i + 1,
            lineContent: line,
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
          });
          if (match[0].length === 0) regex.lastIndex++;
        }
      }

      if (matches.length > 0) {
        const fileName = filePath.split("/").pop() ?? filePath;
        results.push({ filePath, fileName, matches });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return results;
}

export async function revealInFinder(path: string): Promise<void> {
  await revealItemInDir(path);
}

export async function getFileMtime(filePath: string): Promise<number> {
  const meta = await stat(filePath);
  return meta.mtime?.getTime() ?? 0;
}

export async function getGitRoot(rootPath: string): Promise<string | null> {
  return invoke<string | null>("get_git_root", { repoPath: rootPath });
}

export async function getGitStatus(rootPath: string): Promise<Map<string, string>> {
  const result = await invoke<Record<string, string>>("get_git_status", { repoPath: rootPath });
  return new Map(Object.entries(result));
}

export async function replaceInFile(
  filePath: string,
  searchTerm: string,
  replaceTerm: string,
  options: { caseSensitive?: boolean; wholeWord?: boolean; useRegex?: boolean } = {},
): Promise<number> {
  const regex = buildSearchRegex(searchTerm, options);
  if (!regex) return 0;

  const content = await readTextFile(filePath);

  let count = 0;
  const newContent = content.replace(regex, () => {
    count++;
    return replaceTerm;
  });

  if (count > 0) {
    await writeTextFile(filePath, newContent);
  }

  return count;
}
