import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MARKDOWN_EXTENSIONS,
  PDF_EXTENSIONS,
  SUPPORTED_EXTENSIONS,
  VIDEO_EXTENSIONS,
  type VaultEntryKind,
} from "./contracts";
import { extname, normalize } from "./posix-path";

const INVALID_SEGMENT = /[<>:"|?*]/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function normalizeVaultPath(value: string): string {
  const normalized = normalize(value.replaceAll("\\", "/")).replace(/^\.\//, "");
  if (normalized === ".") return "";
  if (
    normalized.startsWith("/") ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    /^[a-z]:/i.test(normalized)
  ) {
    throw new Error("Path must remain inside the active vault.");
  }
  return normalized;
}

export function isHiddenPath(value: string): boolean {
  const normalized = normalizeVaultPath(value);
  return normalized.split("/").some((segment) => segment.startsWith("."));
}

export function validateEntryName(name: string): string {
  const clean = name.trim();
  if (!clean || clean === "." || clean === "..") throw new Error("A name is required.");
  const hasControlCharacter = [...clean].some((character) => character.charCodeAt(0) <= 31);
  if (
    clean.includes("/") ||
    clean.includes("\\") ||
    INVALID_SEGMENT.test(clean) ||
    hasControlCharacter
  ) {
    throw new Error(
      "The name contains characters that are not portable across Graphite platforms.",
    );
  }
  if (clean.endsWith(".") || clean.endsWith(" ") || WINDOWS_RESERVED.test(clean)) {
    throw new Error("The name is not portable across Graphite platforms.");
  }
  if (clean.startsWith(".")) throw new Error("Hidden entries cannot be created in Graphite.");
  return clean;
}

export function entryKindForPath(value: string): VaultEntryKind | null {
  const extension = extname(value).toLowerCase();
  if ((MARKDOWN_EXTENSIONS as readonly string[]).includes(extension)) return "markdown";
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(extension)) return "image";
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(extension)) return "audio";
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(extension)) return "video";
  if ((PDF_EXTENSIONS as readonly string[]).includes(extension)) return "pdf";
  return null;
}

export function isSupportedPath(value: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extname(value).toLowerCase());
}

export function withoutMarkdownExtension(value: string): string {
  return value.toLowerCase().endsWith(".md") ? value.slice(0, -3) : value;
}

export function splitLinkTarget(value: string): { file: string; suffix: string } {
  const index = value.search(/[#^]/);
  return index < 0
    ? { file: value, suffix: "" }
    : { file: value.slice(0, index), suffix: value.slice(index) };
}
