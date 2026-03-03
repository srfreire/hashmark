import { readDir, readTextFile, writeTextFile, mkdir, remove, rename, DirEntry } from "@tauri-apps/plugin-fs";
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
