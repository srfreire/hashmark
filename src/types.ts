export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

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
