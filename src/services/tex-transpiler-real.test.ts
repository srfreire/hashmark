import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { createTexTranspiler } from "./tex-transpiler";

const identity = (p: string) => `convert://${p}`;

const SAMPLES = [
  "/Users/juanfreire/Documents/other/career-ops/templates/cv-template.tex",
  "/Users/juanfreire/Documents/osix/nessie/docs/technical_paper.tex",
];

describe("real-world .tex smoke (plan B transpiler)", () => {
  for (const path of SAMPLES) {
    it(`produces non-trivial output for ${path.split("/").pop()}`, async () => {
      const source = readFileSync(path, "utf8");
      const t = createTexTranspiler(identity);
      const start = performance.now();
      const r = await t.render(source, { baseDir: path.replace(/\/[^/]+$/, "") });
      const ms = performance.now() - start;
      const summary = `${path.split("/").pop()}: ${ms.toFixed(0)}ms, html=${r.html?.length ?? 0}b, error=${r.error ?? "none"}`;
      expect.soft(r.error, summary).toBeNull();
      // Doesn't crash, produces non-trivial HTML. Real-world LaTeX heavy in custom macros
      // won't render fully — that's expected. The win is "shows something instead of nothing".
      expect.soft(r.html?.length ?? 0, summary).toBeGreaterThan(200);
    });
  }
});
