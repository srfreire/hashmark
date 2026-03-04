import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import tippy, { Instance } from "tippy.js";
import BubbleMenu from "./BubbleMenu";
import FindBar from "./FindBar";
import SlashMenu from "./SlashMenu";
import { SlashCommands, slashMenuItems } from "../extensions/slash-command";
import { SearchAndReplace } from "../extensions/search-and-replace";
import { readFile, writeFile } from "../services/filesystem";

const lowlight = createLowlight(common);

interface Props {
  filePath: string;
  onSaveStatusChange: (status: "saved" | "saving" | "unsaved") => void;
  searchTerm?: string;
  onFindBarVisibilityChange?: (visible: boolean) => void;
}

export default function Editor({ filePath, onSaveStatusChange, searchTerm, onFindBarVisibilityChange }: Props) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPathRef = useRef(filePath);
  const initialContentRef = useRef<string | null>(null);
  const [findBarVisible, setFindBarVisible] = useState(false);
  const [initialSearchTerm, setInitialSearchTerm] = useState<string | undefined>(undefined);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: "Start writing, or type '/' for commands...",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Link.configure({ openOnClick: false }),
      Underline,
      SearchAndReplace,
      Markdown.configure({
        html: true,
        tightLists: true,
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
        class: "tiptap",
      },
    },
    onUpdate: ({ editor }) => {
      onSaveStatusChange("unsaved");

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const storage = editor.storage as Record<string, any>;
          const markdown = storage.markdown.getMarkdown();
          onSaveStatusChange("saving");
          await writeFile(currentPathRef.current, markdown);
          onSaveStatusChange("saved");
        } catch (e) {
          console.error("Auto-save failed:", e);
          onSaveStatusChange("unsaved");
        }
      }, 1000);
    },
  });

  // Load file content when filePath changes
  useEffect(() => {
    currentPathRef.current = filePath;

    async function load() {
      try {
        const content = await readFile(filePath);
        initialContentRef.current = content;
        if (editor) {
          // Use the markdown parser directly from storage
          const storage = editor.storage as Record<string, any>;
          if (storage.markdown?.parser) {
            const parsed = storage.markdown.parser.parse(content);
            // Use the base setContent (bypassing the markdown wrapper which may double-parse)
            editor.chain().setContent(parsed).run();
          } else {
            // Fallback: pass content directly and let the Markdown extension handle it
            editor.chain().setContent(content).run();
          }
          onSaveStatusChange("saved");
        }
      } catch (e) {
        console.error("Failed to load file:", e);
      }
    }

    if (editor) load();
  }, [filePath, editor]);

  // Cmd+S manual save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        const selection = editor?.state.selection;
        if (selection && !selection.empty) {
          const selectedText = editor?.state.doc.textBetween(selection.from, selection.to, " ");
          setInitialSearchTerm(selectedText || undefined);
        } else {
          setInitialSearchTerm(undefined);
        }
        setFindBarVisible(true);
        onFindBarVisibilityChange?.(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        if (editor) {
          const storage = editor.storage as Record<string, any>;
          const markdown = storage.markdown.getMarkdown();
          onSaveStatusChange("saving");
          writeFile(currentPathRef.current, markdown).then(() => {
            onSaveStatusChange("saved");
          });
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Open FindBar when searchTerm prop changes
  useEffect(() => {
    if (searchTerm !== undefined && searchTerm !== "") {
      setInitialSearchTerm(searchTerm);
      setFindBarVisible(true);
      onFindBarVisibilityChange?.(true);
    }
  }, [searchTerm, onFindBarVisibilityChange]);

  if (!editor) return null;

  return (
    <div className="editor-container">
      <FindBar
        editor={editor}
        visible={findBarVisible}
        onClose={() => {
          setFindBarVisible(false);
          onFindBarVisibilityChange?.(false);
        }}
        initialSearchTerm={initialSearchTerm}
      />
      <BubbleMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
