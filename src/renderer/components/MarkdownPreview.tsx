import { defaultSchema } from "hast-util-sanitize";
import { AlertTriangle, ExternalLink, FileQuestion, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ResolvedLink, VaultEntryKind } from "../../shared/contracts";
import { bridge } from "../lib/bridge";
import { sanitizeSvg } from "../lib/sanitize-svg";
import { remarkWikilinks } from "../lib/wikilinks";
import { Button } from "./Button";

interface PreviewProps {
  vaultId: string;
  sourcePath: string;
  markdown: string;
  depth?: number;
  visited?: string[];
  onOpenNote(path: string): void;
}

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "graphite-wiki", "http", "https"],
    src: [...(defaultSchema.protocols?.src ?? []), "graphite-embed", "blob", "data"],
  },
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-/]],
  },
};

function decodeGraphiteUrl(url: string, scheme: string): string {
  return decodeURIComponent(url.slice(scheme.length));
}

function useResolvedLink(vaultId: string, sourcePath: string, target: string) {
  const [resolution, setResolution] = useState<ResolvedLink | null>(null);
  useEffect(() => {
    let live = true;
    void bridge
      .resolveLink(vaultId, sourcePath, target)
      .then((value) => live && setResolution(value));
    return () => {
      live = false;
    };
  }, [sourcePath, target, vaultId]);
  return resolution;
}

function WikiLink({
  vaultId,
  sourcePath,
  target,
  children,
  onOpenNote,
}: Pick<PreviewProps, "vaultId" | "sourcePath" | "onOpenNote"> & {
  target: string;
  children: React.ReactNode;
}) {
  const resolution = useResolvedLink(vaultId, sourcePath, target);
  const activate = async () => {
    if (resolution?.status === "resolved") {
      if (resolution.kind === "markdown") onOpenNote(resolution.path);
      else await bridge.openAttachment(vaultId, resolution.path);
    } else if (resolution?.status === "missing") {
      onOpenNote(await bridge.createLinkedNote(vaultId, sourcePath, target));
    }
  };
  return (
    <button
      type="button"
      className="wiki-link"
      data-status={resolution?.status ?? "loading"}
      title={
        resolution?.status === "ambiguous"
          ? `Ambiguous: ${resolution.candidates.join(", ")}`
          : undefined
      }
      onClick={() => void activate()}
      disabled={resolution?.status === "ambiguous" || resolution?.status === "invalid"}
    >
      {children}
    </button>
  );
}

function PdfPage({ document, pageNumber }: { document: PDFDocumentProxy; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    let renderTask: RenderTask | undefined;
    void document
      .getPage(pageNumber)
      .then((page) => {
        const canvas = canvasRef.current;
        if (!live || !canvas) return;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unavailable.");
        const viewport = page.getViewport({ scale: 1.35 });
        const outputScale = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        return renderTask.promise;
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber]);

  return error ? (
    <div className="pdf-page-error">Page {pageNumber} could not be rendered.</div>
  ) : (
    <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} />
  );
}

function PdfEmbed({ url, path }: { url: string; path: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    void import("pdfjs-dist")
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = pdfjs.getDocument({ url });
        return loadingTask.promise;
      })
      .then((pdf) => live && setDocument(pdf))
      .catch(() => live && setError("PDF preview is unavailable for this attachment."));
    return () => {
      live = false;
      void loadingTask?.destroy();
    };
  }, [url]);

  if (error) return <div className="pdf-page-error">{error}</div>;
  if (!document) return <LoaderCircle className="animate-spin text-muted-foreground" size={18} />;
  const pages: React.ReactNode[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    pages.push(
      <PdfPage
        key={`${document.fingerprints[0] ?? path}-${pageNumber}`}
        document={document}
        pageNumber={pageNumber}
      />,
    );
  }
  return (
    <section className="pdf-embed" aria-label={`PDF preview: ${path}`}>
      {pages}
    </section>
  );
}

function AssetEmbed({
  vaultId,
  path,
  kind,
}: {
  vaultId: string;
  path: string;
  kind: VaultEntryKind;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let live = true;
    void bridge.readAsset(vaultId, path).then((payload) => {
      if (!live) return;
      if (payload.status !== "ok") {
        setFallback(
          payload.status === "too-large"
            ? "Attachment is too large for inline preview."
            : payload.message,
        );
        return;
      }
      let bytes = Uint8Array.from(atob(payload.base64), (character) => character.charCodeAt(0));
      if (payload.mimeType === "image/svg+xml") {
        const sanitized = sanitizeSvg(new TextDecoder().decode(bytes));
        if (!sanitized) {
          setFallback("This SVG could not be safely previewed.");
          return;
        }
        bytes = new TextEncoder().encode(sanitized);
      }
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: payload.mimeType }));
      setUrl(objectUrl);
    });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, vaultId]);

  if (fallback) {
    return (
      <div className="embed-fallback">
        <FileQuestion size={18} />
        <span>{fallback}</span>
        <Button variant="ghost" onClick={() => void bridge.openAttachment(vaultId, path)}>
          Open externally <ExternalLink size={14} />
        </Button>
      </div>
    );
  }
  if (!url) return <LoaderCircle className="animate-spin text-muted-foreground" size={18} />;
  if (kind === "image") return <img src={url} alt={path} loading="lazy" />;
  if (kind === "audio")
    return (
      <audio
        src={url}
        controls
        preload="metadata"
        onError={() => setFallback("This audio codec is not supported by the system webview.")}
      />
    );
  if (kind === "video")
    return (
      <video
        src={url}
        controls
        preload="metadata"
        onError={() => setFallback("This video codec is not supported by the system webview.")}
      />
    );
  if (kind === "pdf") return <PdfEmbed url={url} path={path} />;
  return null;
}

function Embed({
  vaultId,
  sourcePath,
  target,
  depth,
  visited,
  onOpenNote,
}: Pick<PreviewProps, "vaultId" | "sourcePath" | "onOpenNote"> & {
  target: string;
  depth: number;
  visited: string[];
}) {
  const resolution = useResolvedLink(vaultId, sourcePath, target);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (resolution?.status !== "resolved" || resolution.kind !== "markdown") return;
    let live = true;
    void bridge
      .readDocument(vaultId, resolution.path)
      .then((snapshot) => live && setNote(snapshot.text));
    return () => {
      live = false;
    };
  }, [resolution, vaultId]);

  if (!resolution) return <LoaderCircle className="animate-spin text-muted-foreground" size={18} />;
  if (resolution.status !== "resolved") {
    return (
      <div className="embed-fallback">
        <AlertTriangle size={18} /> Unable to resolve {target}
      </div>
    );
  }
  if (resolution.kind !== "markdown")
    return <AssetEmbed vaultId={vaultId} path={resolution.path} kind={resolution.kind} />;
  if (depth >= 3 || visited.includes(resolution.path)) {
    return (
      <div className="embed-fallback">Nested note preview stopped to prevent an embed cycle.</div>
    );
  }
  if (note === null)
    return <LoaderCircle className="animate-spin text-muted-foreground" size={18} />;
  return (
    <aside className="note-embed">
      <button
        type="button"
        className="note-embed-title"
        onClick={() => onOpenNote(resolution.path)}
      >
        {resolution.path}
      </button>
      <MarkdownPreview
        vaultId={vaultId}
        sourcePath={resolution.path}
        markdown={note}
        depth={depth + 1}
        visited={[...visited, resolution.path]}
        onOpenNote={onOpenNote}
      />
    </aside>
  );
}

export function MarkdownPreview({
  vaultId,
  sourcePath,
  markdown,
  depth = 0,
  visited = [sourcePath],
  onOpenNote,
}: PreviewProps) {
  const container = useRef<HTMLDivElement>(null);
  const plugins = useMemo(() => [remarkFrontmatter, remarkGfm, remarkWikilinks], []);
  return (
    <div ref={container} className="markdown-preview">
      <article className="markdown-preview-content">
        <ReactMarkdown
          remarkPlugins={plugins}
          rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeHighlight]}
          urlTransform={(url, key, node) => {
            if (url.startsWith("graphite-wiki:") || url.startsWith("graphite-embed:")) return url;
            if (/^https?:/i.test(url)) return url;
            if (key === "src" && node.tagName === "img") {
              return `graphite-embed:${encodeURIComponent(url)}`;
            }
            if (key === "href" && url) return `graphite-wiki:${encodeURIComponent(url)}`;
            return "";
          }}
          components={{
            a: ({ href = "", children }) => {
              if (href.startsWith("graphite-wiki:")) {
                return (
                  <WikiLink
                    vaultId={vaultId}
                    sourcePath={sourcePath}
                    target={decodeGraphiteUrl(href, "graphite-wiki:")}
                    onOpenNote={onOpenNote}
                  >
                    {children}
                  </WikiLink>
                );
              }
              if (/^https?:/i.test(href)) {
                return (
                  <button
                    className="external-link"
                    type="button"
                    onClick={() => void bridge.openExternal(href)}
                  >
                    {children} <ExternalLink size={12} />
                  </button>
                );
              }
              return <span>{children}</span>;
            },
            img: ({ src = "", alt = "" }) => {
              if (src.startsWith("graphite-embed:")) {
                return (
                  <Embed
                    vaultId={vaultId}
                    sourcePath={sourcePath}
                    target={decodeGraphiteUrl(src, "graphite-embed:")}
                    depth={depth}
                    visited={visited}
                    onOpenNote={onOpenNote}
                  />
                );
              }
              return <span className="embed-fallback">Remote or unsafe image blocked: {alt}</span>;
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
