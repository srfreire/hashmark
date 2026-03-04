import { useState, useEffect, useRef, useMemo } from "react";

export interface Command {
  label: string;
  shortcut: string;
  action: () => void;
}

interface Props {
  commands: Command[];
  onClose: () => void;
}

export default function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(lower));
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="quick-open-overlay" onMouseDown={onClose}>
      <div className="quick-open" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="quick-open-input"
          type="text"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="quick-open-results" ref={listRef}>
          {filtered.map((cmd, i) => (
            <button
              key={cmd.label}
              className={`quick-open-item command-item${i === selectedIndex ? " selected" : ""}`}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => { cmd.action(); onClose(); }}
            >
              <span className="quick-open-item-name">{cmd.label}</span>
              {cmd.shortcut && <span className="command-shortcut">{cmd.shortcut}</span>}
            </button>
          ))}
          {filtered.length === 0 && query && (
            <div className="quick-open-empty">No commands found</div>
          )}
        </div>
      </div>
    </div>
  );
}
