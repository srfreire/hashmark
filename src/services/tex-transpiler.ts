import katex from "katex";
import type { ConvertPath, TexRenderer, TexRenderResult } from "./tex-renderer";
import { resolveImageSrc } from "./tex-renderer";

type Ctx = {
  baseDir: string;
  convertPath: ConvertPath;
};

const VOID_COMMANDS_TO_DROP = new Set([
  "label",
  "ref",
  "pageref",
  "noindent",
  "centering",
  "newpage",
  "clearpage",
  "pagebreak",
  "vspace",
  "hspace",
  "vfill",
  "hfill",
  "newline",
  "linebreak",
  "smallskip",
  "medskip",
  "bigskip",
  "setlength",
  "renewcommand",
  "newcommand",
  "providecommand",
  "DeclareMathOperator",
  "definecolor",
  "input",
  "include",
  "bibliography",
  "bibliographystyle",
  "maketitle",
  "tableofcontents",
  "listoffigures",
  "listoftables",
  "thispagestyle",
  "pagestyle",
  "fancyhf",
  "fancyfoot",
  "fancyhead",
  "footrulewidth",
  "headrulewidth",
  "lhead",
  "rhead",
  "chead",
  "lfoot",
  "rfoot",
  "cfoot",
]);

const ENV_DROP = new Set([
  "titlepage",
  "abstract",
  "thebibliography",
]);

const ENV_PASSTHROUGH_BLOCK = new Set([
  "center",
  "flushleft",
  "flushright",
  "quote",
  "quotation",
  "verse",
  "figure",
  "table",
  "minipage",
]);

const MATH_ENVS = new Set([
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
  "displaymath",
]);

const VERBATIM_ENVS = new Set(["verbatim", "lstlisting", "minted"]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function stripComments(src: string): string {
  // Strip % comments but preserve escaped \%
  return src.replace(/(^|[^\\])%[^\n]*/g, "$1");
}

function extractBody(src: string): string {
  const beginMatch = src.match(/\\begin\{document\}/);
  if (!beginMatch) return src;
  const startIdx = beginMatch.index! + beginMatch[0].length;
  const endMatch = src.slice(startIdx).match(/\\end\{document\}/);
  return endMatch ? src.slice(startIdx, startIdx + endMatch.index!) : src.slice(startIdx);
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: true,
      strict: "ignore",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `<span class="tex-math-error" title="${escapeAttr(msg)}">${escapeHtml(tex)}</span>`;
  }
}

class Parser {
  src: string;
  pos = 0;
  ctx: Ctx;

  constructor(src: string, ctx: Ctx) {
    this.src = src;
    this.ctx = ctx;
  }

  eof(): boolean {
    return this.pos >= this.src.length;
  }

  peek(offset = 0): string {
    return this.src[this.pos + offset] ?? "";
  }

  startsWith(s: string): boolean {
    return this.src.startsWith(s, this.pos);
  }

  consume(n: number): string {
    const out = this.src.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  // Read a balanced {...} group. Assumes current char is '{'. Returns inner text.
  readGroup(): string {
    if (this.peek() !== "{") return "";
    let depth = 0;
    let start = this.pos;
    while (!this.eof()) {
      const c = this.peek();
      if (c === "\\") {
        this.pos += 2;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const inner = this.src.slice(start + 1, this.pos);
          this.pos++;
          return inner;
        }
      }
      this.pos++;
    }
    return this.src.slice(start + 1);
  }

  // Read an optional [...] argument. Returns the inner text or null if absent.
  readOptional(): string | null {
    // Skip whitespace before optional arg
    const save = this.pos;
    while (!this.eof() && /\s/.test(this.peek())) this.pos++;
    if (this.peek() !== "[") {
      this.pos = save;
      return null;
    }
    const start = this.pos;
    let depth = 0;
    while (!this.eof()) {
      const c = this.peek();
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          const inner = this.src.slice(start + 1, this.pos);
          this.pos++;
          return inner;
        }
      }
      this.pos++;
    }
    return this.src.slice(start + 1);
  }

  readCommandName(): string {
    // Already consumed the '\'
    let name = "";
    // Special commands like \\, \{, \}, \%, \&, \$, \_, \#, \~, \^
    const c = this.peek();
    if (!/[a-zA-Z]/.test(c)) {
      this.pos++;
      return c;
    }
    while (!this.eof() && /[a-zA-Z]/.test(this.peek())) {
      name += this.peek();
      this.pos++;
    }
    // Optional star suffix
    if (this.peek() === "*") {
      name += "*";
      this.pos++;
    }
    return name;
  }

  skipWhitespace(): void {
    while (!this.eof() && /[ \t]/.test(this.peek())) this.pos++;
  }

  // Render until we hit \end{name} or EOF. Consumes the \end{name}.
  renderUntilEndOf(envName: string): string {
    let out = "";
    while (!this.eof()) {
      if (this.startsWith("\\end{" + envName + "}")) {
        this.pos += ("\\end{" + envName + "}").length;
        return out;
      }
      out += this.renderOne();
    }
    return out;
  }

  // Read raw source until \end{name}, no rendering. For verbatim envs.
  readRawUntilEndOf(envName: string): string {
    const marker = "\\end{" + envName + "}";
    const idx = this.src.indexOf(marker, this.pos);
    if (idx === -1) {
      const out = this.src.slice(this.pos);
      this.pos = this.src.length;
      return out;
    }
    const out = this.src.slice(this.pos, idx);
    this.pos = idx + marker.length;
    return out;
  }

  renderItems(envName: string): string {
    // Inside itemize/enumerate/description: each \item starts a list entry.
    // Render text between \item markers, recursively handling nested envs.
    let out = "";
    let buf = "";
    let started = false;

    const flush = () => {
      if (started) out += "<li>" + buf.trim() + "</li>";
      buf = "";
    };

    while (!this.eof()) {
      if (this.startsWith("\\end{" + envName + "}")) {
        this.pos += ("\\end{" + envName + "}").length;
        flush();
        return out;
      }
      if (this.startsWith("\\item")) {
        this.pos += "\\item".length;
        // optional [...]
        this.readOptional();
        flush();
        started = true;
        continue;
      }
      buf += this.renderOne();
    }
    flush();
    return out;
  }

  renderTabular(): string {
    // Minimal tabular: rows separated by \\, cells separated by &.
    // Consume the column spec argument first.
    this.readOptional();
    this.readGroup();
    // Now render the body until \end{tabular}
    let body = "";
    while (!this.eof()) {
      if (this.startsWith("\\end{tabular}")) {
        this.pos += "\\end{tabular}".length;
        break;
      }
      body += this.renderOne();
    }
    // Split into rows on \\ (in HTML output that's two backslashes? No — renderOne emits text)
    // Actually we let \\ become a literal token. We'll insert a row marker for \\.
    // Simpler: split body on a sentinel we never produce. Use the rendered output where \\ was passed.
    // Since renderOne for \\ emits <br>, we have <br> as row separators.
    const rows = body.split("<br>").map((r) => r.trim()).filter((r) => r.length > 0);
    const cells = rows.map((r) => r.split("&").map((c) => `<td>${c.trim()}</td>`).join(""));
    return `<table class="tex-tabular">${cells.map((c) => `<tr>${c}</tr>`).join("")}</table>`;
  }

  // Render a single token. Returns its HTML.
  renderOne(): string {
    if (this.eof()) return "";

    // Math: $$...$$ or $...$
    if (this.startsWith("$$")) {
      this.pos += 2;
      const start = this.pos;
      const end = this.src.indexOf("$$", this.pos);
      if (end === -1) {
        this.pos = this.src.length;
        return renderMath(this.src.slice(start), true);
      }
      const tex = this.src.slice(start, end);
      this.pos = end + 2;
      return renderMath(tex, true);
    }
    if (this.peek() === "$") {
      this.pos++;
      const start = this.pos;
      // Find next $ that isn't escaped
      while (!this.eof()) {
        const c = this.peek();
        if (c === "\\") {
          this.pos += 2;
          continue;
        }
        if (c === "$") break;
        this.pos++;
      }
      const tex = this.src.slice(start, this.pos);
      if (!this.eof()) this.pos++; // consume closing $
      return renderMath(tex, false);
    }

    // \[ ... \]
    if (this.startsWith("\\[")) {
      this.pos += 2;
      const start = this.pos;
      const end = this.src.indexOf("\\]", this.pos);
      if (end === -1) {
        this.pos = this.src.length;
        return renderMath(this.src.slice(start), true);
      }
      const tex = this.src.slice(start, end);
      this.pos = end + 2;
      return renderMath(tex, true);
    }
    if (this.startsWith("\\(")) {
      this.pos += 2;
      const start = this.pos;
      const end = this.src.indexOf("\\)", this.pos);
      if (end === -1) {
        this.pos = this.src.length;
        return renderMath(this.src.slice(start), false);
      }
      const tex = this.src.slice(start, end);
      this.pos = end + 2;
      return renderMath(tex, false);
    }

    // Command
    if (this.peek() === "\\") {
      this.pos++;
      const name = this.readCommandName();
      return this.renderCommand(name);
    }

    // Group {...}
    if (this.peek() === "{") {
      const inner = this.readGroup();
      // Render group contents inline (no <span>)
      const sub = new Parser(inner, this.ctx);
      return sub.renderAll();
    }

    // Plain text
    const c = this.peek();
    this.pos++;
    return escapeHtml(c);
  }

  renderCommand(name: string): string {
    // Special escaped characters
    if (name === "%" || name === "&" || name === "$" || name === "_" || name === "#" || name === "{" || name === "}") {
      return escapeHtml(name);
    }
    if (name === "\\") return "<br>";
    if (name === " " || name === "," || name === ";" || name === "!" || name === ":") return " ";
    if (name === "~") return "&nbsp;";

    // Headings
    if (name === "section") return `<h2>${escapeHtml(this.readGroup())}</h2>`;
    if (name === "section*") return `<h2>${escapeHtml(this.readGroup())}</h2>`;
    if (name === "subsection" || name === "subsection*") return `<h3>${escapeHtml(this.readGroup())}</h3>`;
    if (name === "subsubsection" || name === "subsubsection*") return `<h4>${escapeHtml(this.readGroup())}</h4>`;
    if (name === "paragraph" || name === "paragraph*") {
      const txt = this.readGroup();
      return `<p class="tex-paragraph"><strong>${escapeHtml(txt)}</strong></p>`;
    }
    if (name === "chapter" || name === "chapter*") return `<h1>${escapeHtml(this.readGroup())}</h1>`;
    if (name === "title") return `<h1 class="tex-title">${escapeHtml(this.readGroup())}</h1>`;
    if (name === "author") return `<p class="tex-author">${escapeHtml(this.readGroup())}</p>`;
    if (name === "date") return `<p class="tex-date">${escapeHtml(this.readGroup())}</p>`;

    // Emphasis
    if (name === "textbf" || name === "bf") return `<strong>${this.renderArg()}</strong>`;
    if (name === "textit" || name === "it" || name === "emph" || name === "em") return `<em>${this.renderArg()}</em>`;
    if (name === "underline") return `<u>${this.renderArg()}</u>`;
    if (name === "texttt" || name === "tt") return `<code>${escapeHtml(this.readGroup())}</code>`;
    if (name === "textsc" || name === "sc") return `<span style="font-variant: small-caps">${this.renderArg()}</span>`;
    if (name === "textsf" || name === "sf") return `<span style="font-family: sans-serif">${this.renderArg()}</span>`;
    if (name === "textrm" || name === "rm") return `<span>${this.renderArg()}</span>`;

    // Links
    if (name === "href") {
      const url = this.readGroup();
      const text = this.renderArg();
      return `<a href="${escapeAttr(url)}">${text}</a>`;
    }
    if (name === "url") {
      const url = this.readGroup();
      return `<a href="${escapeAttr(url)}">${escapeHtml(url)}</a>`;
    }
    if (name === "hyperref") {
      // \hyperref[label]{text}
      this.readOptional();
      return this.renderArg();
    }

    // Images
    if (name === "includegraphics") {
      this.readOptional();
      const src = this.readGroup();
      const resolved = resolveImageSrc(src, this.ctx.baseDir, this.ctx.convertPath);
      return `<img src="${escapeAttr(resolved)}" alt="${escapeAttr(src)}">`;
    }

    // Citations and refs → placeholders
    if (name === "cite" || name === "citep" || name === "citet" || name === "parencite") {
      this.readOptional();
      this.readGroup();
      return `<span class="tex-cite">[?]</span>`;
    }
    if (name === "footnote") {
      const txt = this.renderArg();
      return `<sup class="tex-footnote" title="${escapeAttr(txt.replace(/<[^>]+>/g, ""))}">[*]</sup>`;
    }

    // Environments
    if (name === "begin") {
      const env = this.readGroup();
      return this.renderEnvironment(env);
    }
    if (name === "end") {
      // Stray \end — consume the group and emit nothing.
      this.readGroup();
      return "";
    }
    if (name === "item") {
      // Stray \item outside of a list — treat as bullet.
      return "<br>• ";
    }

    // Math envs as fallback if encountered without \begin (shouldn't happen but safe)
    if (MATH_ENVS.has(name)) {
      return ""; // handled inside \begin
    }

    // Drop these silently
    if (VOID_COMMANDS_TO_DROP.has(name)) {
      // Consume optional + one mandatory arg if present (best effort)
      this.readOptional();
      if (this.peek() === "{") this.readGroup();
      return "";
    }

    // Unknown command: consume optional + first mandatory arg as visible content
    this.readOptional();
    if (this.peek() === "{") {
      const inner = this.readGroup();
      const sub = new Parser(inner, this.ctx);
      return sub.renderAll();
    }
    return "";
  }

  renderArg(): string {
    if (this.peek() !== "{") return "";
    const inner = this.readGroup();
    const sub = new Parser(inner, this.ctx);
    return sub.renderAll();
  }

  renderEnvironment(env: string): string {
    // Math environments
    if (MATH_ENVS.has(env)) {
      const tex = this.readRawUntilEndOf(env);
      // For align/gather/etc, wrap in the env so KaTeX handles them
      const useEnv = env.endsWith("*") || ["equation", "align", "gather", "multline", "eqnarray"].includes(env);
      const wrapped = useEnv && env !== "equation" && env !== "equation*" && env !== "displaymath"
        ? `\\begin{${env}}${tex}\\end{${env}}`
        : tex;
      return renderMath(wrapped, true);
    }

    if (VERBATIM_ENVS.has(env)) {
      const raw = this.readRawUntilEndOf(env);
      return `<pre><code>${escapeHtml(raw.replace(/^\n/, ""))}</code></pre>`;
    }

    if (env === "itemize") {
      return `<ul>${this.renderItems(env)}</ul>`;
    }
    if (env === "enumerate") {
      return `<ol>${this.renderItems(env)}</ol>`;
    }
    if (env === "description") {
      return `<dl>${this.renderItems(env)}</dl>`;
    }

    if (env === "tabular" || env === "tabularx" || env === "array") {
      if (env === "tabularx") this.readGroup(); // width
      return this.renderTabular();
    }

    if (env === "document") {
      // Render until \end{document}
      return this.renderUntilEndOf(env);
    }

    if (ENV_DROP.has(env)) {
      this.readRawUntilEndOf(env);
      return "";
    }

    if (ENV_PASSTHROUGH_BLOCK.has(env)) {
      const inner = this.renderUntilEndOf(env);
      const cls = `tex-env tex-env-${env}`;
      return `<div class="${cls}">${inner}</div>`;
    }

    // Unknown env: render contents inline, ignoring the env wrapper
    return this.renderUntilEndOf(env);
  }

  renderAll(): string {
    let out = "";
    while (!this.eof()) {
      out += this.renderOne();
    }
    return out;
  }
}

function postProcessParagraphs(html: string): string {
  // Convert double newlines in remaining text-flow into <p> breaks.
  // Only operate outside of block tags. Simple heuristic: replace blank-line runs
  // with </p><p> where it makes sense.
  // Wrap top-level content in <p> only between block boundaries.
  // For v1, replace 2+ newlines with paragraph break, then wrap top-level text runs in <p>.
  const parts = html.split(/\n\s*\n+/);
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      // If the part starts with a block-level tag, don't wrap
      if (/^<(h[1-6]|ul|ol|dl|table|pre|div|p|blockquote|img)\b/.test(p)) return p;
      return `<p>${p}</p>`;
    })
    .join("\n");
}

export function createTexTranspiler(convertPath: ConvertPath): TexRenderer {
  return {
    async render(source, { baseDir }): Promise<TexRenderResult> {
      try {
        if (!source.trim()) {
          return { html: "", error: null };
        }
        const stripped = stripComments(source);
        const body = extractBody(stripped);
        const parser = new Parser(body, { baseDir, convertPath });
        const raw = parser.renderAll();
        const html = postProcessParagraphs(raw);
        return { html, error: null };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        return { html: null, error };
      }
    },
  };
}
