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

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden w-56">
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 p-3">No results</p>
      ) : (
        items.map((item, index) => (
          <button
            key={item.title}
            onClick={() => selectItem(index)}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
              index === selectedIndex ? "bg-gray-100" : "hover:bg-gray-50"
            }`}
          >
            <span className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded text-xs font-mono font-bold text-gray-600">
              {item.icon}
            </span>
            <div>
              <div className="font-medium text-gray-800">{item.title}</div>
              <div className="text-xs text-gray-400">{item.description}</div>
            </div>
          </button>
        ))
      )}
    </div>
  );
});
