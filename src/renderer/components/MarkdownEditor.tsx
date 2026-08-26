import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

interface MarkdownEditorProps {
  value: string;
  onChange(value: string): void;
  dark: boolean;
  disabled?: boolean;
}

export function MarkdownEditor({ value, onChange, dark, disabled }: MarkdownEditorProps) {
  const extensions = useMemo(
    () => [
      markdown(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
    ],
    [],
  );
  return (
    <CodeMirror
      aria-label="Markdown source"
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
        lineNumbers: true,
      }}
      height="100%"
      className="h-full overflow-hidden text-[14px]"
    />
  );
}
