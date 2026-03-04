import { useRef } from "react";

interface Props {
  dark: boolean;
  onToggle: () => void;
}

export default function ThemeToggle({ dark, onToggle }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);

  function handleClick() {
    const btn = btnRef.current;
    if (!btn || !document.startViewTransition) {
      onToggle();
      return;
    }

    const rect = btn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    // Radius needs to cover the entire screen from the button position
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    document.documentElement.style.setProperty("--theme-toggle-x", `${x}px`);
    document.documentElement.style.setProperty("--theme-toggle-y", `${y}px`);
    document.documentElement.style.setProperty("--theme-toggle-r", `${radius}px`);

    document.startViewTransition(() => {
      onToggle();
    });
  }

  return (
    <button ref={btnRef} onClick={handleClick} className="theme-btn" title="Toggle theme">
      {dark ? (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <circle cx="7.5" cy="7.5" r="3" />
          <line x1="7.5" y1="1.5" x2="7.5" y2="3" />
          <line x1="7.5" y1="12" x2="7.5" y2="13.5" />
          <line x1="1.5" y1="7.5" x2="3" y2="7.5" />
          <line x1="12" y1="7.5" x2="13.5" y2="7.5" />
          <line x1="3.26" y1="3.26" x2="4.32" y2="4.32" />
          <line x1="10.68" y1="10.68" x2="11.74" y2="11.74" />
          <line x1="3.26" y1="11.74" x2="4.32" y2="10.68" />
          <line x1="10.68" y1="4.32" x2="11.74" y2="3.26" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M13 8.5a5.5 5.5 0 01-7-7 5.5 5.5 0 107 7z" />
        </svg>
      )}
    </button>
  );
}
