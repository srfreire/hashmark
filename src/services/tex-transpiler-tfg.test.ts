import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createTexTranspiler } from "./tex-transpiler";

const TFG_DIR = "/Users/juanfreire/Documents/academic/labtfg/phase2-juan/docs/tfg-memoria-latex";
const identity = (p: string) => `convert://${p}`;

function walkTex(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTex(full));
    else if (entry.name.endsWith(".tex")) out.push(full);
  }
  return out;
}

const FILES = walkTex(TFG_DIR);

describe("TFG corpus: every .tex must render without crashing", () => {
  for (const path of FILES) {
    it(`renders ${path.replace(TFG_DIR + "/", "")}`, async () => {
      const source = readFileSync(path, "utf8");
      const t = createTexTranspiler(identity);
      const r = await t.render(source, { baseDir: path.replace(/\/[^/]+$/, "") });
      const meta = `${path.replace(TFG_DIR + "/", "")} -> html=${r.html?.length ?? 0}b, error=${r.error ?? "none"}`;
      expect.soft(r.error, meta).toBeNull();
      // Non-empty: even short files like caratula should produce *some* HTML
      expect.soft(r.html?.length ?? 0, meta).toBeGreaterThan(20);
    });
  }
});

// Specific regressions surfaced from the user's screenshots
describe("specific regressions", () => {
  const t = createTexTranspiler(identity);

  it("\\addcontentsline{toc}{chapter}{X} is dropped silently", async () => {
    const r = await t.render(String.raw`\addcontentsline{toc}{chapter}{Bibliografía} REST`, { baseDir: "/tmp" });
    expect(r.html).not.toContain("toc");
    expect(r.html).not.toContain("chapter");
    expect(r.html).not.toContain("Bibliografía");
    expect(r.html).toContain("REST");
  });

  it("\\markboth is dropped silently", async () => {
    const r = await t.render(String.raw`\markboth{BIBLIOGRAFÍA}{BIBLIOGRAFÍA} body`, { baseDir: "/tmp" });
    expect(r.html).not.toContain("BIBLIOGRAFÍA");
    expect(r.html).toContain("body");
  });

  it("\\begin{figure}[H] doesn't leak [H] as text", async () => {
    const r = await t.render(String.raw`\begin{figure}[H]\centering A figure\end{figure}`, { baseDir: "/tmp" });
    expect(r.html).not.toContain("[H]");
    expect(r.html).toContain("A figure");
  });

  it("\\begin{table}[!h] doesn't leak placement spec", async () => {
    const r = await t.render(String.raw`\begin{table}[!h]\centering Data\end{table}`, { baseDir: "/tmp" });
    expect(r.html).not.toContain("[!h]");
    expect(r.html).toContain("Data");
  });

  it("renders thebibliography as a list with bibitem entries", async () => {
    const r = await t.render(String.raw`\begin{thebibliography}{99}\bibitem{a}First ref.\bibitem{b}Second ref.\end{thebibliography}`, { baseDir: "/tmp" });
    expect(r.html).toMatch(/<ol[^>]*>[\s\S]*<li>[\s\S]*First ref/);
    expect(r.html).toContain("Second ref");
  });

  it("{\\it X} renders X as italic", async () => {
    const r = await t.render(String.raw`Foo {\it bar} baz.`, { baseDir: "/tmp" });
    expect(r.html).toMatch(/<em>\s*bar\s*<\/em>/);
  });

  it("{\\bf X} renders X as bold", async () => {
    const r = await t.render(String.raw`Foo {\bf bar} baz.`, { baseDir: "/tmp" });
    expect(r.html).toMatch(/<strong>\s*bar\s*<\/strong>/);
  });

  it("LaTeX double-backtick quotes become curly", async () => {
    const r = await t.render("``Hello''", { baseDir: "/tmp" });
    expect(r.html).toContain("“");
    expect(r.html).toContain("”");
  });

  it("LaTeX -- becomes en-dash, --- becomes em-dash", async () => {
    const r = await t.render("pages 1--10 and so---there.", { baseDir: "/tmp" });
    expect(r.html).toContain("1–10");
    expect(r.html).toContain("so—there");
  });

  it("\\caption{X} inside figure renders X", async () => {
    const r = await t.render(String.raw`\begin{figure}[H]\includegraphics{img.png}\caption{An image.}\end{figure}`, { baseDir: "/base" });
    expect(r.html).toContain("An image.");
  });
});
