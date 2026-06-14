import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTexTranspiler } from "./tex-transpiler";

const TFG_DIR = "/Users/juanfreire/Documents/academic/labtfg/phase2-juan/docs/tfg-memoria-latex";
const OUT_DIR = "/tmp/tex-corpus-render";
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
try { mkdirSync(OUT_DIR, { recursive: true }); } catch {}

// KaTeX emits <annotation encoding="application/x-tex">...original tex...</annotation>
// inside MathML output. The "original tex" portion legitimately contains \commands —
// strip these before leak detection.
function stripKatexAnnotations(html: string): string {
  return html.replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/g, "");
}

// Patterns that should never appear in the HTML output of a clean render.
// We capture matches with their context to surface in assertion failures.
function findLeaks(htmlRaw: string): Array<{ pattern: string; context: string }> {
  const html = stripKatexAnnotations(htmlRaw);
  const leaks: Array<{ pattern: string; context: string }> = [];
  function add(pattern: string, regex: RegExp, label?: string) {
    let m: RegExpExecArray | null;
    regex.lastIndex = 0;
    let count = 0;
    while ((m = regex.exec(html)) !== null && count < 3) {
      const start = Math.max(0, m.index - 30);
      const end = Math.min(html.length, m.index + m[0].length + 30);
      const ctx = html.slice(start, end).replace(/\s+/g, " ");
      leaks.push({ pattern: label ?? pattern, context: `…${ctx}…` });
      count++;
      if (regex.lastIndex === m.index) regex.lastIndex++;
    }
  }
  // Backslash followed by LaTeX command name leaking into output (not inside KaTeX/MathML/code)
  add("\\\\cmd", /\\[a-zA-Z]{2,}\b/g, "literal \\command in output");
  // Placement specs like [H], [h!], [!htbp]
  add("[H]-ish", /\[(?:H|h!|!?htbp|t|b)\]/g, "literal [H] placement");
  // Common machinery artifacts that mean unknown-command fallback concatenated multiple groups
  add("tocchapter", /toc\s*chapter/g, "addcontentsline leak (tocchapter)");
  add("BIBLIOGRAFÍABIBLIOGRAFÍA", /(\b[A-ZÁÉÍÓÚÑ]{5,}\b)\1/g, "duplicated all-caps run (markboth leak)");
  // Unrendered KaTeX env names leaked through
  add("equationequation", /equation\s*equation/g, "math env name leak");
  return leaks;
}

describe("TFG corpus: detect rendering leaks", () => {
  for (const path of FILES) {
    const rel = path.replace(TFG_DIR + "/", "");
    it(`no leaks in ${rel}`, async () => {
      const source = readFileSync(path, "utf8");
      const t = createTexTranspiler(identity);
      const r = await t.render(source, { baseDir: path.replace(/\/[^/]+$/, "") });
      const html = r.html ?? "";
      // Persist HTML for human inspection
      const outName = rel.replace(/\//g, "__").replace(/\.tex$/, ".html");
      writeFileSync(join(OUT_DIR, outName),
        `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"><style>body{font-family:Georgia,serif;max-width:780px;margin:32px auto;padding:0 24px;line-height:1.6}img{max-width:100%}pre{background:#f4f4f4;padding:12px;overflow-x:auto}code{background:#f4f4f4;padding:1px 4px}</style></head><body>${html}</body></html>`,
      );
      const leaks = findLeaks(html);
      const msg = leaks.length === 0
        ? `${rel}: clean (${html.length}b)`
        : `${rel}: ${leaks.length} leak(s)\n${leaks.map((l) => `  - ${l.pattern}: ${l.context}`).join("\n")}`;
      expect.soft(leaks, msg).toEqual([]);
    });
  }
});
