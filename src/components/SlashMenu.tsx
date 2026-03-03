import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { SlashMenuItem } from "../extensions/slash-command";

interface Props {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
}

export default forwardRef(function SlashMenu({ items, command }: Props, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) command(item);
    },
    [items, command]
  );

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="slash-menu">
        <p className="slash-menu-empty">No results</p>
      </div>
    );
  }

  return (
    <div className="slash-menu">
      {items.map((item, index) => (
        <button
          key={item.title}
          onClick={() => selectItem(index)}
          className={`slash-menu-item ${index === selectedIndex ? "selected" : ""}`}
        >
          <span className="slash-menu-icon">{item.icon}</span>
          <div className="slash-menu-text">
            <div className="slash-menu-title">{item.title}</div>
            <div className="slash-menu-desc">{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
});
