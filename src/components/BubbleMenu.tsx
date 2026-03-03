import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import { Editor } from "@tiptap/react";

interface Props {
  editor: Editor;
}

const btnClass = (active: boolean) =>
  `px-2 py-1 text-xs rounded transition-colors ${
    active ? "bg-white text-gray-900 shadow-sm" : "text-gray-300 hover:text-white"
  }`;

export default function BubbleMenu({ editor }: Props) {
  return (
    <TiptapBubbleMenu
      editor={editor}
      className="bg-gray-800 rounded-lg shadow-xl flex items-center gap-0.5 p-1"
    >
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btnClass(editor.isActive("bold"))}
      >
        B
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btnClass(editor.isActive("italic"))}
      >
        I
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btnClass(editor.isActive("underline"))}
      >
        U
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={btnClass(editor.isActive("strike"))}
      >
        S
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={btnClass(editor.isActive("code"))}
      >
        {'</>'}
      </button>
      <div className="w-px h-4 bg-gray-600 mx-1" />
      <button
        onClick={() => {
          const url = window.prompt("URL:");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        className={btnClass(editor.isActive("link"))}
      >
        Link
      </button>
    </TiptapBubbleMenu>
  );
}
