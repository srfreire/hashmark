import { Extension } from "@tiptap/core";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchState {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  activeIndex: number;
  matchCount: number;
}

interface SearchMatch {
  from: number;
  to: number;
}

type SearchOptionKey = "caseSensitive" | "wholeWord" | "useRegex";

// ---------------------------------------------------------------------------
// Module-level plugin key
// ---------------------------------------------------------------------------

const searchPluginKey = new PluginKey<DecorationSet>("searchAndReplace");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchRegex(state: SearchState): RegExp | null {
  if (!state.searchTerm) return null;

  let pattern = state.useRegex
    ? state.searchTerm
    : escapeRegExp(state.searchTerm);

  if (state.wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }

  const flags = state.caseSensitive ? "g" : "gi";

  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function findMatches(
  doc: ProsemirrorNode,
  regex: RegExp,
): SearchMatch[] {
  const matches: SearchMatch[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;

    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(node.text)) !== null) {
      const from = pos + match.index;
      const to = from + match[0].length;
      matches.push({ from, to });

      // Guard against zero-length matches to avoid infinite loops
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  });

  return matches;
}

/**
 * Scrolls the viewport so the active match is visible.
 */
export function scrollToActiveMatch(): void {
  requestAnimationFrame(() => {
    const el = document.querySelector(".search-highlight-active");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

// ---------------------------------------------------------------------------
// Command type declarations
// ---------------------------------------------------------------------------

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchAndReplace: {
      setSearchTerm: (term: string) => ReturnType;
      setReplaceTerm: (term: string) => ReturnType;
      setSearchOption: (option: SearchOptionKey, value: boolean) => ReturnType;
      nextMatch: () => ReturnType;
      previousMatch: () => ReturnType;
      replaceCurrentMatch: () => ReturnType;
      replaceAllMatches: () => ReturnType;
      clearSearch: () => ReturnType;
    };
  }
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export interface SearchAndReplaceStorage {
  searchState: SearchState;
  onStateChange: ((state: SearchState) => void) | null;
}

export const SearchAndReplace = Extension.create<
  Record<string, never>,
  SearchAndReplaceStorage
>({
  name: "searchAndReplace",

  addStorage() {
    return {
      searchState: {
        searchTerm: "",
        replaceTerm: "",
        caseSensitive: false,
        wholeWord: false,
        useRegex: false,
        activeIndex: 0,
        matchCount: 0,
      },
      onStateChange: null,
    };
  },

  addCommands() {
    const updateSearch = (
      editor: typeof this.editor,
      storage: SearchAndReplaceStorage,
      patch: Partial<SearchState>,
    ) => {
      Object.assign(storage.searchState, patch);

      // Recompute match count
      const regex = buildSearchRegex(storage.searchState);
      const matches = regex
        ? findMatches(editor.state.doc, regex)
        : [];
      storage.searchState.matchCount = matches.length;

      // Clamp active index
      if (storage.searchState.activeIndex >= matches.length) {
        storage.searchState.activeIndex = Math.max(0, matches.length - 1);
      }

      storage.onStateChange?.(storage.searchState);

      // Force a ProseMirror transaction so the plugin re-decorates
      editor.view.dispatch(editor.state.tr);

      scrollToActiveMatch();
    };

    return {
      setSearchTerm:
        (term: string) =>
        ({ editor }) => {
          updateSearch(editor, this.storage, {
            searchTerm: term,
            activeIndex: 0,
          });
          return true;
        },

      setReplaceTerm:
        (term: string) =>
        () => {
          this.storage.searchState.replaceTerm = term;
          return true;
        },

      setSearchOption:
        (option: SearchOptionKey, value: boolean) =>
        ({ editor }) => {
          updateSearch(editor, this.storage, {
            [option]: value,
            activeIndex: 0,
          });
          return true;
        },

      nextMatch:
        () =>
        ({ editor }) => {
          const { searchState } = this.storage;
          if (searchState.matchCount === 0) return false;

          searchState.activeIndex =
            (searchState.activeIndex + 1) % searchState.matchCount;

          this.storage.onStateChange?.(searchState);
          editor.view.dispatch(editor.state.tr);
          scrollToActiveMatch();
          return true;
        },

      previousMatch:
        () =>
        ({ editor }) => {
          const { searchState } = this.storage;
          if (searchState.matchCount === 0) return false;

          searchState.activeIndex =
            (searchState.activeIndex - 1 + searchState.matchCount) %
            searchState.matchCount;

          this.storage.onStateChange?.(searchState);
          editor.view.dispatch(editor.state.tr);
          scrollToActiveMatch();
          return true;
        },

      replaceCurrentMatch:
        () =>
        ({ editor }) => {
          const { searchState } = this.storage;
          const regex = buildSearchRegex(searchState);
          if (!regex) return false;

          const matches = findMatches(editor.state.doc, regex);
          if (matches.length === 0) return false;

          const idx = Math.min(searchState.activeIndex, matches.length - 1);
          const match = matches[idx];

          editor
            .chain()
            .focus()
            .insertContentAt(
              { from: match.from, to: match.to },
              searchState.replaceTerm,
            )
            .run();

          // Recompute after replacement
          const newRegex = buildSearchRegex(searchState);
          const newMatches = newRegex
            ? findMatches(editor.state.doc, newRegex)
            : [];
          searchState.matchCount = newMatches.length;

          if (searchState.activeIndex >= newMatches.length) {
            searchState.activeIndex = Math.max(0, newMatches.length - 1);
          }

          this.storage.onStateChange?.(searchState);
          editor.view.dispatch(editor.state.tr);
          scrollToActiveMatch();
          return true;
        },

      replaceAllMatches:
        () =>
        ({ editor }) => {
          const { searchState } = this.storage;
          const regex = buildSearchRegex(searchState);
          if (!regex) return false;

          const matches = findMatches(editor.state.doc, regex);
          if (matches.length === 0) return false;

          // Batch all replacements into a single transaction for proper undo
          const chain = editor.chain().focus();
          const reversed = [...matches].reverse();
          for (const match of reversed) {
            chain.insertContentAt(
              { from: match.from, to: match.to },
              searchState.replaceTerm,
            );
          }
          chain.run();

          searchState.matchCount = 0;
          searchState.activeIndex = 0;

          this.storage.onStateChange?.(searchState);
          editor.view.dispatch(editor.state.tr);
          return true;
        },

      clearSearch:
        () =>
        ({ editor }) => {
          Object.assign(this.storage.searchState, {
            searchTerm: "",
            replaceTerm: "",
            activeIndex: 0,
            matchCount: 0,
          });
          this.storage.onStateChange?.(this.storage.searchState);
          editor.view.dispatch(editor.state.tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;

    return [
      new Plugin({
        key: searchPluginKey,
        props: {
          decorations: ({ doc }) => {
            const { searchState } = storage;
            const regex = buildSearchRegex(searchState);

            if (!regex) {
              return DecorationSet.empty;
            }

            const matches = findMatches(doc, regex);
            const decorations: Decoration[] = [];

            matches.forEach((match, index) => {
              const className =
                index === searchState.activeIndex
                  ? "search-highlight search-highlight-active"
                  : "search-highlight";

              decorations.push(
                Decoration.inline(match.from, match.to, {
                  class: className,
                }),
              );
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
