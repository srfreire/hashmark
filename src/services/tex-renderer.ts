export interface TexRenderResult {
  html: string | null;
  error: string | null;
}

export interface TexRendererOptions {
  baseDir: string;
}

export interface TexRenderer {
  render(source: string, opts: TexRendererOptions): Promise<TexRenderResult>;
}

export type ConvertPath = (absolutePath: string) => string;

export function joinPath(base: string, rel: string): string {
  if (/^([a-z]+:|\/)/i.test(rel) || /^[a-z]:[\\/]/i.test(rel)) return rel;
  const sep = base.includes("\\") ? "\\" : "/";
  const baseParts = base.split(sep).filter((p) => p !== "");
  const relParts = rel.split(/[/\\]/);
  for (const p of relParts) {
    if (p === "..") baseParts.pop();
    else if (p !== "." && p !== "") baseParts.push(p);
  }
  const prefix = base.startsWith("/") ? "/" : "";
  return prefix + baseParts.join(sep);
}

export function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[a-z]:[\\/]/i.test(p);
}

export function isUrl(p: string): boolean {
  return /^([a-z]+:|data:|asset:|blob:)/i.test(p);
}

export function resolveImageSrc(src: string, baseDir: string, convertPath: ConvertPath): string {
  if (isUrl(src)) return src;
  if (isAbsolutePath(src)) return convertPath(src);
  return convertPath(joinPath(baseDir, src));
}
