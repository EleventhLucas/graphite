import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { GFM } from "@lezer/markdown";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef } from "react";
import type { ColorTheme } from "../../shared/contracts";
import { createWysiwygExtension } from "../lib/wysiwyg";

const inlineThemeRules = {
  "&": {
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
  },
  ".cm-content": {
    caretColor: "hsl(var(--foreground))",
    fontFamily: "var(--font-monospace)",
    color: "hsl(var(--foreground))",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "hsl(var(--foreground))",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "hsl(var(--selection) / 0.2)",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
} as const;

const inlineLightTheme = EditorView.theme(inlineThemeRules);
const inlineDarkTheme = EditorView.theme(inlineThemeRules, { dark: true });

const sourceThemeRules = {
  "&": {
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--code-foreground))",
  },
  ".cm-content": {
    caretColor: "hsl(var(--foreground))",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "hsl(var(--foreground))",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "hsl(var(--selection) / 0.22)",
  },
  ".cm-gutters": {
    borderRightColor: "hsl(var(--border))",
    backgroundColor: "hsl(var(--panel))",
    color: "hsl(var(--muted-foreground))",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "hsl(var(--accent) / 0.62)",
  },
  ".cm-matchingBracket": {
    outline: "1px solid hsl(var(--selection) / 0.55)",
    backgroundColor: "hsl(var(--selection) / 0.12)",
  },
} as const;

const sourceLightTheme = EditorView.theme(sourceThemeRules);
const sourceDarkTheme = EditorView.theme(sourceThemeRules, { dark: true });

const sourceHighlightStyle = HighlightStyle.define([
  { tag: [tags.comment, tags.meta], color: "hsl(var(--syntax-comment))" },
  {
    tag: [tags.keyword, tags.modifier, tags.operatorKeyword, tags.bool, tags.null],
    color: "hsl(var(--syntax-keyword))",
  },
  {
    tag: [tags.string, tags.regexp, tags.special(tags.string)],
    color: "hsl(var(--syntax-string))",
  },
  { tag: [tags.number, tags.integer, tags.float], color: "hsl(var(--syntax-number))" },
  {
    tag: [tags.function(tags.variableName), tags.labelName],
    color: "hsl(var(--syntax-function))",
  },
  {
    tag: [tags.variableName, tags.typeName, tags.className, tags.propertyName, tags.attributeName],
    color: "hsl(var(--syntax-variable))",
  },
  { tag: [tags.heading, tags.strong], fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "hsl(var(--link))", textDecoration: "underline" },
]);

interface MarkdownEditorProps {
  value: string;
  onChange(value: string): void;
  dark: boolean;
  themeId: ColorTheme;
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
  themeId,
  disabled,
  mode,
  vaultId,
  sourcePath,
  onOpenNote,
}: MarkdownEditorProps) {
  const inline = mode === "wysiwyg";
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const extensions = useMemo(
    () => [
      markdown({ extensions: GFM }),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      ...(!inline ? [syntaxHighlighting(sourceHighlightStyle)] : []),
      ...(inline ? createWysiwygExtension({ vaultId, sourcePath, onOpenNote }) : []),
    ],
    [inline, onOpenNote, sourcePath, vaultId],
  );

  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (!cancelled && document.documentElement.dataset.theme === themeId) {
        editorRef.current?.view?.requestMeasure();
      }
    };
    const frame = requestAnimationFrame(() => {
      measure();
      void document.fonts?.ready.then(measure);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [themeId]);

  return (
    <CodeMirror
      ref={editorRef}
      aria-label={inline ? "Inline Markdown editor" : "Markdown code editor"}
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={
        inline
          ? dark
            ? inlineDarkTheme
            : inlineLightTheme
          : dark
            ? sourceDarkTheme
            : sourceLightTheme
      }
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
        syntaxHighlighting: false,
      }}
      height="100%"
      className="h-full overflow-hidden text-[14px]"
    />
  );
}
