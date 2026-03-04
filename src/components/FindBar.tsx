import { useState, useEffect, useRef, useCallback } from "react";
import { Editor } from "@tiptap/react";
import type { SearchState, SearchAndReplaceStorage } from "../extensions/search-and-replace";

interface Props {
  editor: Editor;
  visible: boolean;
  onClose: () => void;
  initialSearchTerm?: string;
}

export default function FindBar({ editor, visible, onClose, initialSearchTerm }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchInfo, setMatchInfo] = useState({ activeIndex: 0, matchCount: 0 });

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to state changes from the extension
  useEffect(() => {
    const storage = (editor.storage as Record<string, any>).searchAndReplace as SearchAndReplaceStorage;

    storage.onStateChange = (state: SearchState) => {
      setMatchInfo({ activeIndex: state.activeIndex, matchCount: state.matchCount });
    };

    return () => {
      storage.onStateChange = null;
    };
  }, [editor]);

  // On open: focus search input and apply initialSearchTerm
  useEffect(() => {
    if (visible) {
      if (initialSearchTerm) {
        setSearchTerm(initialSearchTerm);
        editor.commands.setSearchTerm(initialSearchTerm);
      }
      // Focus after a tick so the DOM is ready
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
  }, [visible, initialSearchTerm, editor]);

  const handleClose = useCallback(() => {
    editor.commands.clearSearch();
    onClose();
  }, [editor, onClose]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      editor.commands.setSearchTerm(value);
    },
    [editor],
  );

  const handleReplaceChange = useCallback(
    (value: string) => {
      setReplaceTerm(value);
      editor.commands.setReplaceTerm(value);
    },
    [editor],
  );

  const toggleOption = useCallback(
    (option: "caseSensitive" | "wholeWord" | "useRegex", current: boolean) => {
      const newValue = !current;
      const setters = { caseSensitive: setCaseSensitive, wholeWord: setWholeWord, useRegex: setUseRegex };
      setters[option](newValue);
      editor.commands.setSearchOption(option, newValue);
    },
    [editor],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        editor.commands.previousMatch();
      } else if (e.key === "Enter") {
        e.preventDefault();
        editor.commands.nextMatch();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    },
    [editor, handleClose],
  );

  const handleReplaceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    },
    [handleClose],
  );

  if (!visible) return null;

  function getMatchDisplay(): string {
    if (matchInfo.matchCount > 0) return `${matchInfo.activeIndex + 1}/${matchInfo.matchCount}`;
    if (searchTerm) return "No results";
    return "";
  }
  const matchDisplay = getMatchDisplay();

  return (
    <div className="find-bar">
      <div className="find-bar-row">
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
          placeholder="Find"
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <button
          className={`find-bar-option${caseSensitive ? " active" : ""}`}
          onClick={() => toggleOption("caseSensitive", caseSensitive)}
          title="Match Case"
        >
          Aa
        </button>
        <button
          className={`find-bar-option${wholeWord ? " active" : ""}`}
          onClick={() => toggleOption("wholeWord", wholeWord)}
          title="Whole Word"
        >
          W
        </button>
        <button
          className={`find-bar-option${useRegex ? " active" : ""}`}
          onClick={() => toggleOption("useRegex", useRegex)}
          title="Use Regex"
        >
          .*
        </button>
        <span className="find-bar-count">{matchDisplay}</span>
        <button
          className="find-bar-nav"
          onClick={() => editor.commands.previousMatch()}
          title="Previous Match"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5L5 3.5L7.5 6.5" /></svg>
        </button>
        <button
          className="find-bar-nav"
          onClick={() => editor.commands.nextMatch()}
          title="Next Match"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 3.5L5 6.5L7.5 3.5" /></svg>
        </button>
        <button
          className="find-bar-close"
          onClick={handleClose}
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" /></svg>
        </button>
      </div>
      {showReplace && (
        <div className="find-bar-row find-bar-replace-row">
          <div className="find-bar-toggle-spacer" />
          <input
            className="find-bar-input"
            type="text"
            placeholder="Replace"
            value={replaceTerm}
            onChange={(e) => handleReplaceChange(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
          />
          <button
            className="find-bar-action"
            onClick={() => editor.commands.replaceCurrentMatch()}
            title="Replace"
          >
            Replace
          </button>
          <button
            className="find-bar-action"
            onClick={() => editor.commands.replaceAllMatches()}
            title="Replace All"
          >
            All
          </button>
        </div>
      )}
    </div>
  );
}
