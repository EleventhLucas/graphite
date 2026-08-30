import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import { wysiwygExtension } from "../lib/wysiwyg";

interface MarkdownEditorProps {
  value: string;
  onChange(value: string): void;
  dark: boolean;
  disabled?: boolean;
  mode: "source" | "wysiwyg";
}

export function MarkdownEditor({ value, onChange, dark, disabled, mode }: MarkdownEditorProps) {
  const extensions = useMemo(
    () => [
      markdown({ extensions: GFM }),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      ...(mode === "wysiwyg" ? wysiwygExtension : []),
    ],
    [mode],
  );
  return (
    <CodeMirror
      aria-label={mode === "wysiwyg" ? "Inline Markdown editor" : "Markdown code editor"}
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={dark ? oneDark : "light"}
      editable={!disabled}
      basicSetup={{
        autocompletion: false,
        bracketMatching: true,
        closeBrackets: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        lineNumbers: mode === "source",
      }}
      height="100%"
      className="h-full overflow-hidden text-[14px]"
    />
  );
}
