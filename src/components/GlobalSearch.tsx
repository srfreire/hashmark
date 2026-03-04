import { useState, useEffect, useRef, useCallback } from "react";
import { FileSearchResult } from "../types";
import { searchInFiles, replaceInFile } from "../services/filesystem";

interface Props {
  rootPath: string;
  onOpenFileAtMatch: (filePath: string, searchTerm: string) => void;
  onClose: () => void;
}

export default function GlobalSearch({ rootPath, onOpenFileAtMatch, onClose }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(
    async (term: string) => {
      if (!term.trim()) {
        setResults([]);
        setHasSearched(false);
        setSearching(false);
        return;
      }

      setSearching(true);
      setHasSearched(true);

      try {
        const found = await searchInFiles(rootPath, term, {
          caseSensitive,
          wholeWord,
          useRegex,
        });
        setResults(found);
        // Auto-expand all files with results
        setExpandedFiles(new Set(found.map((r) => r.filePath)));
      } catch (e) {
        console.error("Search failed:", e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [rootPath, caseSensitive, wholeWord, useRegex],
  );

  // Debounced search on term change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      doSearch(searchTerm);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, doSearch]);

  // Re-search immediately when options toggle (skip debounce delay).
  // searchTerm and doSearch are intentionally omitted to only fire on option changes.
  useEffect(() => {
    if (searchTerm.trim()) {
      doSearch(searchTerm);
    }
  }, [caseSensitive, wholeWord, useRegex]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFileExpanded = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const handleReplaceInFile = useCallback(
    async (filePath: string) => {
      await replaceInFile(filePath, searchTerm, replaceTerm, {
        caseSensitive,
        wholeWord,
        useRegex,
      });
      doSearch(searchTerm);
    },
    [searchTerm, replaceTerm, caseSensitive, wholeWord, useRegex, doSearch],
  );

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  const handleReplaceAll = useCallback(async () => {
    const matchCount = results.reduce((sum, r) => sum + r.matches.length, 0);
    const confirmed = window.confirm(
      `Replace ${matchCount} matches across ${results.length} files?`,
    );
    if (!confirmed) return;

    for (const result of results) {
      await replaceInFile(result.filePath, searchTerm, replaceTerm, {
        caseSensitive,
        wholeWord,
        useRegex,
      });
    }
    doSearch(searchTerm);
  }, [results, searchTerm, replaceTerm, caseSensitive, wholeWord, useRegex, doSearch]);

  function highlightMatch(lineContent: string, matchStart: number, matchEnd: number) {
    const before = lineContent.substring(0, matchStart);
    const match = lineContent.substring(matchStart, matchEnd);
    const after = lineContent.substring(matchEnd);
    return (
      <>
        {before}
        <mark>{match}</mark>
        {after}
      </>
    );
  }

  // Focus search input on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  return (
    <div className="global-search">
      <div className="global-search-inputs">
        <div className="global-search-row">
          <button
            className={`find-bar-toggle${showReplace ? " expanded" : ""}`}
            onClick={() => setShowReplace(!showReplace)}
            title="Toggle Replace"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2L7 5L3 8" /></svg>
          </button>
          <input
            ref={searchInputRef}
            className="find-bar-input"
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button
            className="find-bar-close"
            onClick={onClose}
            title="Close Search"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" /></svg>
          </button>
        </div>
        {showReplace && (
          <div className="global-search-row">
            <div className="find-bar-toggle-spacer" />
            <input
              className="find-bar-input"
              type="text"
              placeholder="Replace"
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
            />
            <button
              className="find-bar-action"
              onClick={handleReplaceAll}
              title="Replace All"
              disabled={results.length === 0}
            >
              All
            </button>
          </div>
        )}
        <div className="global-search-options">
          <button
            className={`find-bar-option${caseSensitive ? " active" : ""}`}
            onClick={() => setCaseSensitive(!caseSensitive)}
            title="Match Case"
          >
            Aa
          </button>
          <button
            className={`find-bar-option${wholeWord ? " active" : ""}`}
            onClick={() => setWholeWord(!wholeWord)}
            title="Whole Word"
          >
            W
          </button>
          <button
            className={`find-bar-option${useRegex ? " active" : ""}`}
            onClick={() => setUseRegex(!useRegex)}
            title="Use Regex"
          >
            .*
          </button>
          {hasSearched && !searching && (
            <span className="global-search-count">
              {totalMatches} {totalMatches === 1 ? "result" : "results"}
              {results.length > 0 && ` in ${results.length} ${results.length === 1 ? "file" : "files"}`}
            </span>
          )}
        </div>
      </div>

      <div className="global-search-results">
        {searching && (
          <div className="global-search-status">Searching...</div>
        )}

        {!searching && hasSearched && results.length === 0 && (
          <div className="global-search-status">No results found</div>
        )}

        {!searching &&
          results.map((fileResult) => (
            <div key={fileResult.filePath} className="global-search-file">
              <button
                className="global-search-file-header"
                onClick={() => toggleFileExpanded(fileResult.filePath)}
              >
                <span className="tree-dir-icon">
                  {expandedFiles.has(fileResult.filePath) ? "▾" : "▸"}
                </span>
                <span className="global-search-file-name">
                  {fileResult.fileName}
                </span>
                <span className="global-search-file-count">
                  {fileResult.matches.length}
                </span>
              </button>

              {expandedFiles.has(fileResult.filePath) && (
                <>
                  {showReplace && (
                    <button
                      className="global-search-file-replace"
                      onClick={() => handleReplaceInFile(fileResult.filePath)}
                    >
                      Replace
                    </button>
                  )}
                  {fileResult.matches.map((match, idx) => (
                    <button
                      key={`${match.line}-${match.matchStart}-${idx}`}
                      className="global-search-match"
                      onClick={() =>
                        onOpenFileAtMatch(fileResult.filePath, searchTerm)
                      }
                    >
                      <span className="global-search-match-line">
                        {match.line}
                      </span>
                      <span className="global-search-match-text">
                        {highlightMatch(
                          match.lineContent,
                          match.matchStart,
                          match.matchEnd,
                        )}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
