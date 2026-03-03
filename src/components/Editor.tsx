import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance } from "tippy.js";
import BubbleMenu from "./BubbleMenu";
import SlashMenu from "./SlashMenu";
import { SlashCommands, slashMenuItems } from "../extensions/slash-command";
import { readFile, writeFile } from "../services/filesystem";

const lowlight = createLowlight(common);

interface Props {
  filePath: string;
  onSaveStatusChange: (status: "saved" | "saving" | "unsaved") => void;
}

export default function Editor({ filePath, onSaveStatusChange }: Props) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPathRef = useRef(filePath);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: "Type '/' for commands...",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Link.configure({ openOnClick: false }),
      Underline,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      SlashCommands.configure({
        suggestion: {
          items: ({ query }: { query: string }) => {
            return slashMenuItems.filter((item) =>
              item.title.toLowerCase().includes(query.toLowerCase())
            );
          },
          render: () => {
            let component: ReactRenderer | null = null;
            let popup: Instance[] | null = null;

            return {
              onStart: (props: any) => {
                component = new ReactRenderer(SlashMenu, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },
              onUpdate(props: any) {
                component?.updateProps(props);
                if (props.clientRect) {
                  popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect });
                }
              },
              onKeyDown(props: any) {
                if (props.event.key === "Escape") {
                  popup?.[0]?.hide();
                  return true;
                }
                return (component?.ref as any)?.onKeyDown(props);
              },
              onExit() {
                popup?.[0]?.destroy();
                component?.destroy();
              },
            };
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: "prose prose-gray max-w-none focus:outline-none min-h-[calc(100vh-4rem)] px-4 py-8",
      },
    },
    onUpdate: ({ editor }) => {
      onSaveStatusChange("unsaved");

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        const markdownStorage = (editor.storage as Record<string, any>).markdown;
        const markdown = markdownStorage.getMarkdown();
        onSaveStatusChange("saving");
        await writeFile(currentPathRef.current, markdown);
        onSaveStatusChange("saved");
      }, 1000);
    },
  });

  useEffect(() => {
    currentPathRef.current = filePath;

    async function load() {
      const content = await readFile(filePath);
      if (editor) {
        editor.commands.setContent(content, {
          emitUpdate: false,
          parseOptions: { preserveWhitespace: "full" },
        });
      }
      onSaveStatusChange("saved");
    }

    if (editor) load();
  }, [filePath, editor]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  if (!editor) return null;

  return (
    <div className="max-w-3xl mx-auto w-full">
      <BubbleMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
