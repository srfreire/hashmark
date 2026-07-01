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
  "eqref",
  "nameref",
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
  "addtolength",
  "renewcommand",
  "newcommand",
  "providecommand",
  "DeclareMathOperator",
  "definecolor",
  "color",
  "textcolor",
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
  "addcontentsline",
  "addtocontents",
  "phantomsection",
  "protect",
  "relax",
  "par",
  "frontmatter",
  "mainmatter",
  "backmatter",
  "appendix",
  "captionsetup",
  "graphicspath",
  "usepackage",
  "documentclass",
  "geometry",
  "markboth",
  "markright",
  "index",
  "nocite",
  "cleardoublepage",
  "newgeometry",
  "restoregeometry",
  "fontsize",
  "selectfont",
  "small",
  "footnotesize",
  "normalsize",
  "large",
  "Large",
  "LARGE",
  "huge",
  "Huge",
  "tiny",
  "scriptsize",
  "rule",
  "vrule",
  "hrule",
  "newcounter",
  "stepcounter",
  "setcounter",
  "addtocounter",
  "value",
  "DeclareUnicodeCharacter",
  "DeclareRobustCommand",
  "ProvideTextCommand",
  "DeclareTextCommand",
  "lstdefinestyle",
  "lstset",
  "lstinputlisting",
  "hypersetup",
  "urlstyle",
  "today",
  "ldots",
  "dots",
  "textellipsis",
  "TeX",
  "LaTeX",
  "LaTeXe",
  "and",
  "endinput",
  "raggedright",
  "raggedleft",
  "leftline",
  "rightline",
  "ifx",
  "fi",
  "else",
  "@ifundefined",
  "pagenumbering",
  "headheight",
  "topmargin",
  "oddsidemargin",
  "evensidemargin",
  "textwidth",
  "textheight",
  "marginparwidth",
  "footnotemark",
  "footnotetext",
  "newtheorem",
  "theoremstyle",
  "linespread",
  "baselineskip",
  "baselinestretch",
  "renewenvironment",
  "newenvironment",
]);

const ENV_DROP = new Set([
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
  "figure*",
  "table",
  "table*",
  "minipage",
  "titlepage",
  // Beamer
  "frame",
  "columns",
  "column",
  "block",
  "exampleblock",
  "alertblock",
  "definition",
  "theorem",
  "lemma",
  "proof",
  "corollary",
  "proposition",
  "example",
  "remark",
  "note",
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

// LaTeX-style typography: ``X'' → curly double, `X' → curly single, ---/-- → em/en dashes.
// Also converts `~` (non-breaking space) to a regular space — this is text-flow only,
// not the `\~` command (which my command handler emits as `&nbsp;`).
// Applied to plain text segments only (not inside math or verbatim).
function applyTypography(s: string): string {
  return s
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/``/g, "“")
    .replace(/''/g, "”")
    .replace(/`/g, "‘")
    // Right single quote: an apostrophe between letters or at end of a word.
    .replace(/(\w)'/g, "$1’")
    // Non-breaking space tilde (use a regular space — preserving non-breaking is overkill here)
    .replace(/~/g, " ");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// Unescape common LaTeX escapes used inside "verbatim-ish" args (texttt, url, href).
// Converts \_, \&, \#, \$, \%, \~, \^ to their literal characters.
function unescapeLatexBasic(s: string): string {
  return s.replace(/\\([_&#$%~^{}])/g, "$1");
}

// Break hints inside verbatim-ish args (\allowbreak, \-, \/) produce no glyph in
// LaTeX — they only mark where a line may break. Map \allowbreak/\linebreak to a
// zero-width space (a break opportunity that survives escapeHtml) and drop the rest.
function stripBreakHints(s: string): string {
  return s
    .replace(/\\allowbreak\s*/g, "​")
    .replace(/\\(?:linebreak|break|newline)\b\s*/g, "​")
    .replace(/\\-/g, "")
    .replace(/\\\//g, "");
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

  // Skip Beamer-style overlay specifiers like <2>, <2->, <1-3>
  skipOverlay(): void {
    const save = this.pos;
    while (!this.eof() && /\s/.test(this.peek())) this.pos++;
    if (this.peek() !== "<") { this.pos = save; return; }
    const end = this.src.indexOf(">", this.pos);
    if (end === -1) { this.pos = save; return; }
    // Only treat as overlay if the content looks like digits/dashes/commas
    const inner = this.src.slice(this.pos + 1, end);
    if (!/^[\d,\-+ \s]+$/.test(inner)) { this.pos = save; return; }
    this.pos = end + 1;
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

  renderTabular(envName = "tabular"): string {
    // tabular: rows separated by \\, cells separated by &. Consume column spec first.
    this.readOptional();
    this.readGroup();
    const endMarker = "\\end{" + envName + "}";
    const rows: string[][] = [[]];
    let cell = "";
    const pushCell = () => { rows[rows.length - 1].push(cell); cell = ""; };
    const newRow = () => { rows.push([]); };
    while (!this.eof()) {
      if (this.startsWith(endMarker)) {
        this.pos += endMarker.length;
        break;
      }
      // Row separator: \\ or \\[skip]
      if (this.startsWith("\\\\")) {
        this.pos += 2;
        this.readOptional();
        pushCell();
        newRow();
        continue;
      }
      // Column separator (unescaped &)
      if (this.peek() === "&") {
        this.pos++;
        pushCell();
        continue;
      }
      // Drop horizontal rules silently
      if (this.startsWith("\\hline") || this.startsWith("\\toprule") || this.startsWith("\\midrule") || this.startsWith("\\bottomrule")) {
        const m = this.src.slice(this.pos).match(/^\\(hline|toprule|midrule|bottomrule)\b/);
        if (m) { this.pos += m[0].length; continue; }
      }
      if (this.startsWith("\\cline")) {
        this.pos += "\\cline".length;
        this.readGroup();
        continue;
      }
      cell += this.renderOne();
    }
    if (cell.trim().length > 0) pushCell();
    return `<table class="tex-tabular">${rows
      .filter((r) => r.some((c) => c.trim().length > 0))
      .map((r) => `<tr>${r.map((c) => `<td>${c.trim()}</td>`).join("")}</tr>`)
      .join("")}</table>`;
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

    // Special LaTeX chars that should end a plain-text run:
    //   \  start of command
    //   {  open group
    //   }  close group
    //   $  math delimiter
    //   &  alignment/column separator (renderTabular peeks for it BEFORE calling renderOne;
    //      outside tabular it has no meaning, but we surface it as a literal `&amp;`)
    //   %  comment (already stripped, but be safe)
    if (this.peek() === "&") {
      this.pos++;
      return "&amp;";
    }
    if (this.peek() === "%") {
      this.pos++;
      return "";
    }
    // Plain text run: read until next special char, then apply typography
    const start = this.pos;
    while (!this.eof()) {
      const c = this.peek();
      if (c === "\\" || c === "{" || c === "}" || c === "$" || c === "&" || c === "%") break;
      this.pos++;
    }
    if (this.pos === start) {
      // Shouldn't happen, but be safe: consume one char to avoid infinite loop.
      this.pos++;
      return escapeHtml(this.src.slice(start, this.pos));
    }
    return applyTypography(escapeHtml(this.src.slice(start, this.pos)));
  }

  renderCommand(name: string): string {
    // Special escaped characters
    if (name === "%" || name === "&" || name === "$" || name === "_" || name === "#" || name === "{" || name === "}") {
      return escapeHtml(name);
    }
    if (name === "\\") return "<br>";
    if (name === " " || name === "," || name === ";" || name === "!" || name === ":") return " ";
    if (name === "~") return "&nbsp;";

    // Headings — sub-parse args so nested \textit/\textbf etc. render correctly.
    // section/chapter/etc. may carry an optional [short title] before the mandatory arg.
    if (name === "section" || name === "section*") { this.readOptional(); return `<h2>${this.renderArg()}</h2>`; }
    if (name === "subsection" || name === "subsection*") { this.readOptional(); return `<h3>${this.renderArg()}</h3>`; }
    if (name === "subsubsection" || name === "subsubsection*") { this.readOptional(); return `<h4>${this.renderArg()}</h4>`; }
    if (name === "paragraph" || name === "paragraph*") {
      this.readOptional();
      return `<p class="tex-paragraph"><strong>${this.renderArg()}</strong></p>`;
    }
    if (name === "subparagraph" || name === "subparagraph*") {
      this.readOptional();
      return `<p class="tex-paragraph"><strong>${this.renderArg()}</strong></p>`;
    }
    if (name === "chapter" || name === "chapter*") { this.readOptional(); return `<h1>${this.renderArg()}</h1>`; }
    if (name === "part" || name === "part*") { this.readOptional(); return `<h1>${this.renderArg()}</h1>`; }
    if (name === "title") return `<h1 class="tex-title">${this.renderArg()}</h1>`;
    if (name === "author") return `<p class="tex-author">${this.renderArg()}</p>`;
    if (name === "date") return `<p class="tex-date">${this.renderArg()}</p>`;

    // Emphasis (commands that take an argument: \textbf{X}, \textit{X}, \emph{X})
    if (name === "textbf") return `<strong>${this.renderArg()}</strong>`;
    if (name === "textit" || name === "emph") return `<em>${this.renderArg()}</em>`;
    if (name === "underline") return `<u>${this.renderArg()}</u>`;
    if (name === "texttt") return `<code>${escapeHtml(stripBreakHints(unescapeLatexBasic(this.readGroup())))}</code>`;
    if (name === "textsc") return `<span style="font-variant: small-caps">${this.renderArg()}</span>`;
    if (name === "textsf") return `<span style="font-family: sans-serif">${this.renderArg()}</span>`;
    if (name === "textrm") return `<span>${this.renderArg()}</span>`;

    // Font-switch commands inside a group: {\bf X} → render rest of current parser as bold.
    // These don't take an argument — they affect everything following them in the current scope.
    if (name === "bf" || name === "bfseries") return `<strong>${this.renderRest()}</strong>`;
    if (name === "it" || name === "itshape" || name === "em") return `<em>${this.renderRest()}</em>`;
    if (name === "sl" || name === "slshape") return `<em>${this.renderRest()}</em>`;
    if (name === "tt" || name === "ttfamily") return `<code>${escapeHtml(this.src.slice(this.pos))}</code>${(this.pos = this.src.length, "")}`;
    if (name === "sc" || name === "scshape") return `<span style="font-variant: small-caps">${this.renderRest()}</span>`;
    if (name === "sf" || name === "sffamily") return `<span style="font-family: sans-serif">${this.renderRest()}</span>`;
    if (name === "rm" || name === "rmfamily") return `<span>${this.renderRest()}</span>`;

    // Links
    if (name === "href") {
      const url = unescapeLatexBasic(this.readGroup());
      const text = this.renderArg();
      return `<a href="${escapeAttr(url)}">${text}</a>`;
    }
    if (name === "url") {
      const url = unescapeLatexBasic(this.readGroup());
      return `<a href="${escapeAttr(url)}">${escapeHtml(url)}</a>`;
    }
    if (name === "hyperref") {
      // \hyperref[label]{text}
      this.readOptional();
      return this.renderArg();
    }

    // Images
    if (name === "includegraphics") {
      this.skipOverlay(); // Beamer: \includegraphics<2>[...]{...}
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
      // Absorb Beamer-style overlay specifier <2-> after \begin{env}
      this.skipOverlay();
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
    if (name === "bibitem") {
      // Stray \bibitem outside thebibliography — rare. Drop the key and continue.
      this.readOptional();
      this.readGroup();
      return "";
    }

    // Captions: render inline as a figcaption-like paragraph
    if (name === "caption" || name === "captionof") {
      if (name === "captionof") this.readGroup(); // type arg
      this.readOptional(); // short caption
      return `<figcaption class="tex-caption">${this.renderArg()}</figcaption>`;
    }

    // Includes: render a placeholder so master files (e.g. traballo.tex) are visibly non-empty.
    if (name === "input" || name === "include") {
      const path = this.readGroup();
      return `<div class="tex-include-placeholder">↘ <code>${escapeHtml(path)}</code></div>`;
    }

    // Math envs as fallback if encountered without \begin (shouldn't happen but safe)
    if (MATH_ENVS.has(name)) {
      return ""; // handled inside \begin
    }

    // Drop these silently — consume all chained {...} args
    if (VOID_COMMANDS_TO_DROP.has(name)) {
      this.readOptional();
      while (this.peek() === "{") this.readGroup();
      return "";
    }

    // Unknown command: consume optional. Then count chained {...} groups.
    //   - 0 args → nothing
    //   - 1 arg  → render the group content (likely a custom display macro)
    //   - 2+ args → machinery (e.g. \addcontentsline-like); drop all
    this.readOptional();
    const groups: string[] = [];
    while (this.peek() === "{") {
      groups.push(this.readGroup());
    }
    if (groups.length === 1) {
      const sub = new Parser(groups[0], this.ctx);
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

  // Consume the rest of the current parser's input as a single rendered string.
  // Used by font-switch commands like \bf, \it that scope to their enclosing group.
  renderRest(): string {
    const rest = this.src.slice(this.pos);
    this.pos = this.src.length;
    const sub = new Parser(rest, this.ctx);
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
      this.readOptional(); // enumerate options like [label=...]
      return `<ol>${this.renderItems(env)}</ol>`;
    }
    if (env === "description") {
      return `<dl>${this.renderItems(env)}</dl>`;
    }

    if (env === "tabular" || env === "tabularx" || env === "array") {
      if (env === "tabularx") this.readGroup(); // width
      return this.renderTabular(env);
    }

    if (env === "document") {
      // Render until \end{document}
      return this.renderUntilEndOf(env);
    }

    if (env === "thebibliography") {
      this.readGroup(); // widest label, e.g. {99}
      return `<ol class="tex-bibliography">${this.renderBibitems()}</ol>`;
    }

    if (ENV_DROP.has(env)) {
      this.readRawUntilEndOf(env);
      return "";
    }

    if (ENV_PASSTHROUGH_BLOCK.has(env)) {
      // Absorb optional args / placement specifiers ([H], [!htbp], [plain], [t], etc.)
      this.readOptional();
      // Some envs take a mandatory width or title arg
      if (env === "wrapfigure" || env === "wraptable") {
        this.readGroup(); // position
        this.readGroup(); // width
      } else if (env === "minipage" || env === "column") {
        this.readGroup(); // width
      } else if (env === "frame") {
        // Beamer frame may have a {title}{subtitle} after [plain]
        if (this.peek() === "{") this.readGroup();
        if (this.peek() === "{") this.readGroup();
      } else if (env === "block" || env === "exampleblock" || env === "alertblock") {
        if (this.peek() === "{") this.readGroup(); // title
      } else if (env === "columns") {
        // no extra args
      }
      const inner = this.renderUntilEndOf(env);
      const cls = `tex-env tex-env-${env}`;
      return `<div class="${cls}">${inner}</div>`;
    }

    // Unknown env: render contents inline, ignoring the env wrapper
    return this.renderUntilEndOf(env);
  }

  renderBibitems(): string {
    let out = "";
    let buf = "";
    let started = false;
    const flush = () => {
      if (started) out += `<li>${buf.trim()}</li>`;
      buf = "";
    };
    while (!this.eof()) {
      if (this.startsWith("\\end{thebibliography}")) {
        this.pos += "\\end{thebibliography}".length;
        flush();
        return out;
      }
      if (this.startsWith("\\bibitem")) {
        this.pos += "\\bibitem".length;
        this.readOptional();
        this.readGroup();
        flush();
        started = true;
        continue;
      }
      buf += this.renderOne();
    }
    flush();
    return out;
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
