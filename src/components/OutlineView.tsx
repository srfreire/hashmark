interface Props {
  headings: Array<{ level: number; text: string; pos: number }>;
  onHeadingClick: (pos: number) => void;
}

export default function OutlineView({ headings, onHeadingClick }: Props) {
  if (headings.length === 0) {
    return (
      <div className="sidebar-nav">
        <p className="sidebar-empty">No headings found</p>
      </div>
    );
  }

  return (
    <nav className="sidebar-nav">
      {headings.map((h, i) => (
        <button
          key={`${h.pos}-${i}`}
          className="outline-item"
          style={{ paddingLeft: 8 + (h.level - 1) * 16 }}
          onClick={() => onHeadingClick(h.pos)}
          title={h.text}
        >
          <span className="outline-level">H{h.level}</span>
          <span className="outline-text">{h.text}</span>
        </button>
      ))}
    </nav>
  );
}
