import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import { createWysiwygExtension } from "../lib/wysiwyg";

const inlineThemeRules = {
  "&": {
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
  },
  ".cm-content": {
    caretColor: "hsl(var(--foreground))",
    color: "hsl(var(--foreground))",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "hsl(var(--foreground))",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "hsl(var(--foreground) / 0.16)",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
} as const;

const inlineLightTheme = EditorView.theme(inlineThemeRules);
const inlineDarkTheme = EditorView.theme(inlineThemeRules, { dark: true });

interface MarkdownEditorProps {
  value: string;
  onChange(value: string): void;
  dark: boolean;
  disabled?: boolean;
  mode: "source" | "wysiwyg";
  vaultId: string;
  sourcePath: string;
  onOpenNote(path: string): void;
}

export function MarkdownEditor({
  value,
  onChange,
  dark,
  disabled,
  mode,
  vaultId,
  sourcePath,
  onOpenNote,
}: MarkdownEditorProps) {
  const inline = mode === "wysiwyg";
  const extensions = useMemo(
    () => [
      markdown({ extensions: GFM }),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      ...(inline ? createWysiwygExtension({ vaultId, sourcePath, onOpenNote }) : []),
    ],
    [inline, onOpenNote, sourcePath, vaultId],
  );
  return (
    <CodeMirror
      aria-label={inline ? "Inline Markdown editor" : "Markdown code editor"}
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={inline ? (dark ? inlineDarkTheme : inlineLightTheme) : dark ? oneDark : "light"}
      editable={!disabled}
      basicSetup={{
        autocompletion: false,
        bracketMatching: true,
        closeBrackets: true,
        foldGutter: false,
        highlightActiveLine: !inline,
        highlightSelectionMatches: true,
        history: false,
        historyKeymap: false,
        defaultKeymap: false,
        lineNumbers: !inline,
        syntaxHighlighting: !inline,
      }}
      height="100%"
      className="h-full overflow-hidden text-[14px]"
    />
  );
}
