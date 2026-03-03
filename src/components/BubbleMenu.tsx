import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import { Editor } from "@tiptap/react";

interface Props {
  editor: Editor;
}

export default function BubbleMenu({ editor }: Props) {
  return (
    <TiptapBubbleMenu editor={editor}>
      <div className="bubble-menu">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`bubble-btn ${editor.isActive("bold") ? "active" : ""}`}
          title="Bold"
        >
          B
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`bubble-btn ${editor.isActive("italic") ? "active" : ""}`}
          title="Italic"
          style={{ fontStyle: "italic" }}
        >
          I
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`bubble-btn ${editor.isActive("underline") ? "active" : ""}`}
          title="Underline"
          style={{ textDecoration: "underline" }}
        >
          U
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`bubble-btn ${editor.isActive("strike") ? "active" : ""}`}
          title="Strikethrough"
          style={{ textDecoration: "line-through" }}
        >
          S
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`bubble-btn ${editor.isActive("code") ? "active" : ""}`}
          title="Inline code"
          style={{ fontSize: 11 }}
        >
          {"</>"}
        </button>
        <div className="bubble-sep" />
        <button
          onClick={() => {
            const url = window.prompt("URL:");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          className={`bubble-btn ${editor.isActive("link") ? "active" : ""}`}
          title="Add link"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 8a2.5 2.5 0 003.5.7l2-2a2.5 2.5 0 00-3.5-3.5L7 4.2" />
            <path d="M8 6a2.5 2.5 0 00-3.5-.7l-2 2a2.5 2.5 0 003.5 3.5L7 9.8" />
          </svg>
        </button>
      </div>
    </TiptapBubbleMenu>
  );
}
