import { describe, it, expect } from "vitest";
import { createTexTranspiler } from "./tex-transpiler";

const identity = (p: string) => `convert://${p}`;

async function render(source: string, baseDir = "/tmp"): Promise<string> {
  const t = createTexTranspiler(identity);
  const result = await t.render(source, { baseDir });
  if (result.error) throw new Error(`render error: ${result.error}\nhtml: ${result.html}`);
  return result.html ?? "";
}

describe("tex-transpiler: structure", () => {
  it("renders \\section as h2", async () => {
    const html = await render(String.raw`\section{Intro}`);
    expect(html).toMatch(/<h2[^>]*>Intro<\/h2>/);
  });

  it("renders \\subsection as h3", async () => {
    const html = await render(String.raw`\subsection{Sub}`);
    expect(html).toMatch(/<h3[^>]*>Sub<\/h3>/);
  });

  it("renders \\subsubsection as h4", async () => {
    const html = await render(String.raw`\subsubsection{Sub Sub}`);
    expect(html).toMatch(/<h4[^>]*>Sub Sub<\/h4>/);
  });

  it("strips the preamble when \\begin{document} is present", async () => {
    const html = await render(String.raw`\documentclass{article}\usepackage{amsmath}\begin{document}\section{X}\end{document}`);
    expect(html).toMatch(/<h2[^>]*>X<\/h2>/);
    expect(html).not.toContain("amsmath");
    expect(html).not.toContain("documentclass");
  });

  it("renders body when no \\begin{document} marker present", async () => {
    const html = await render(String.raw`\section{Loose}`);
    expect(html).toMatch(/<h2[^>]*>Loose<\/h2>/);
  });

  it("strips line comments", async () => {
    const html = await render(`% a comment\n\\section{Title}`);
    expect(html).not.toContain("comment");
    expect(html).toMatch(/<h2[^>]*>Title<\/h2>/);
  });
});

describe("tex-transpiler: emphasis", () => {
  it("renders \\textbf as strong", async () => {
    const html = await render(String.raw`\textbf{bold}`);
    expect(html).toMatch(/<strong>bold<\/strong>/);
  });

  it("renders \\textit as em", async () => {
    const html = await render(String.raw`\textit{italic}`);
    expect(html).toMatch(/<em>italic<\/em>/);
  });

  it("renders \\emph as em", async () => {
    const html = await render(String.raw`\emph{stressed}`);
    expect(html).toMatch(/<em>stressed<\/em>/);
  });

  it("renders \\texttt as code", async () => {
    const html = await render(String.raw`\texttt{code}`);
    expect(html).toMatch(/<code>code<\/code>/);
  });

  it("renders \\underline as u", async () => {
    const html = await render(String.raw`\underline{x}`);
    expect(html).toMatch(/<u>x<\/u>/);
  });
});

describe("tex-transpiler: lists", () => {
  it("renders itemize as ul", async () => {
    const html = await render(String.raw`\begin{itemize}\item A\item B\end{itemize}`);
    expect(html).toMatch(/<ul>[\s\S]*<li>A<\/li>[\s\S]*<li>B<\/li>[\s\S]*<\/ul>/);
  });

  it("renders enumerate as ol", async () => {
    const html = await render(String.raw`\begin{enumerate}\item One\item Two\end{enumerate}`);
    expect(html).toMatch(/<ol>[\s\S]*<li>One<\/li>[\s\S]*<li>Two<\/li>[\s\S]*<\/ol>/);
  });

  it("renders nested lists", async () => {
    const html = await render(String.raw`\begin{itemize}\item A\begin{itemize}\item A1\end{itemize}\item B\end{itemize}`);
    expect(html).toMatch(/<ul>[\s\S]*<li>A[\s\S]*<ul>[\s\S]*<li>A1<\/li>[\s\S]*<\/ul>[\s\S]*<\/li>[\s\S]*<li>B<\/li>[\s\S]*<\/ul>/);
  });
});

describe("tex-transpiler: links and images", () => {
  it("renders \\href as anchor", async () => {
    const html = await render(String.raw`\href{https://example.com}{click}`);
    expect(html).toMatch(/<a href="https:\/\/example\.com">click<\/a>/);
  });

  it("renders \\url as anchor with the URL as text", async () => {
    const html = await render(String.raw`\url{https://x.com}`);
    expect(html).toMatch(/<a href="https:\/\/x\.com">https:\/\/x\.com<\/a>/);
  });

  it("renders \\includegraphics with resolved relative path", async () => {
    const html = await render(String.raw`\includegraphics{foo.png}`, "/Users/me/docs");
    expect(html).toContain('src="convert:///Users/me/docs/foo.png"');
  });

  it("renders \\includegraphics with options bracket", async () => {
    const html = await render(String.raw`\includegraphics[width=0.5\textwidth]{bar.png}`, "/base");
    expect(html).toContain('src="convert:///base/bar.png"');
  });

  it("renders \\includegraphics with URL unchanged", async () => {
    const html = await render(String.raw`\includegraphics{https://example.com/a.png}`, "/base");
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).not.toContain("convert://https");
  });
});

describe("tex-transpiler: math", () => {
  it("renders inline math via KaTeX", async () => {
    const html = await render(String.raw`Look at $x^2 + y^2 = z^2$.`);
    expect(html).toContain("katex");
    expect(html).not.toContain("$x^2");
  });

  it("renders display math via \\[ ... \\]", async () => {
    const html = await render(String.raw`\[ \int_0^1 x \, dx \]`);
    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
  });

  it("renders equation env via KaTeX display", async () => {
    const html = await render(String.raw`\begin{equation} E = mc^2 \end{equation}`);
    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
  });

  it("renders $$ ... $$ as display math", async () => {
    const html = await render(String.raw`$$\sum_{i=1}^n i = \frac{n(n+1)}{2}$$`);
    expect(html).toContain("katex-display");
  });
});

describe("tex-transpiler: placeholders for unsupported", () => {
  it("renders \\cite as a [?] placeholder", async () => {
    const html = await render(String.raw`See \cite{foo} for details.`);
    expect(html).toContain("[?]");
    expect(html).not.toContain("\\cite");
  });

  it("ignores \\label and \\ref gracefully", async () => {
    const html = await render(String.raw`\label{lbl} and \ref{lbl}`);
    expect(html).not.toContain("\\label");
    expect(html).not.toContain("\\ref");
  });

  it("renders unknown commands by stripping the macro and keeping arg content", async () => {
    const html = await render(String.raw`\unknownmacro{visible content}`);
    expect(html).toContain("visible content");
  });
});

describe("tex-transpiler: escaping", () => {
  it("escapes HTML special chars in text", async () => {
    const html = await render(`5 < 7 & 8 > 6`);
    expect(html).toContain("5 &lt; 7");
    expect(html).toContain("&amp;");
    expect(html).toContain("&gt; 6");
  });

  it("handles common LaTeX special chars", async () => {
    const html = await render(String.raw`\% \& \$ \_ \# \{ \}`);
    expect(html).toContain("%");
    expect(html).toContain("&amp;");
    expect(html).toContain("$");
    expect(html).toContain("_");
    expect(html).toContain("#");
  });
});

describe("tex-transpiler: error handling", () => {
  it("returns error=null and html string for normal input", async () => {
    const t = createTexTranspiler(identity);
    const r = await t.render(String.raw`Hello`, { baseDir: "/tmp" });
    expect(r.error).toBeNull();
    expect(r.html).toBeTruthy();
  });

  it("does not throw on empty input", async () => {
    const t = createTexTranspiler(identity);
    const r = await t.render("", { baseDir: "/tmp" });
    expect(r.error).toBeNull();
    expect(typeof r.html).toBe("string");
  });

  it("falls back gracefully on malformed math (returns html with error span, error=null)", async () => {
    const t = createTexTranspiler(identity);
    const r = await t.render(String.raw`$\frac{1$`, { baseDir: "/tmp" });
    // Individual math failures don't poison the whole render — they become inline error markers.
    expect(r.error).toBeNull();
    expect(r.html).toContain("tex-math-error");
  });
});
