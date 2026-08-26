import type { ResolvedLink } from "./contracts";
import {
  entryKindForPath,
  normalizeVaultPath,
  splitLinkTarget,
  withoutMarkdownExtension,
} from "./paths";
import { basename, dirname, extname, join, relative } from "./posix-path";

function comparable(value: string): string {
  return withoutMarkdownExtension(normalizeVaultPath(value)).toLocaleLowerCase();
}

export function resolveVaultLink(
  sourcePath: string,
  rawTarget: string,
  paths: string[],
): ResolvedLink {
  const target = splitLinkTarget(rawTarget.trim()).file;
  if (!target || /^(?:[a-z]+:|\/)/i.test(target)) return { status: "invalid" };

  let clean: string;
  try {
    clean = normalizeVaultPath(decodeURIComponent(target));
  } catch {
    return { status: "invalid" };
  }

  const sourceFolder = dirname(normalizeVaultPath(sourcePath)).replaceAll("\\", "/");
  const hasFolder = clean.includes("/");
  const candidates: string[] = [];
  const requestedExtension = extname(clean);
  const forms = requestedExtension ? [clean] : [clean, `${clean}.md`];

  if (hasFolder) {
    for (const form of forms) candidates.push(normalizeVaultPath(form));
  } else {
    for (const form of forms) candidates.push(normalizeVaultPath(join(sourceFolder, form)));
  }

  for (const candidate of candidates) {
    const exact = paths.find((path) => path.toLocaleLowerCase() === candidate.toLocaleLowerCase());
    if (exact) {
      const kind = entryKindForPath(exact);
      return kind ? { status: "resolved", path: exact, kind } : { status: "invalid" };
    }
  }

  const targetBase = comparable(basename(clean));
  const basenameMatches = paths.filter((path) => comparable(basename(path)) === targetBase);
  if (basenameMatches.length === 1) {
    const path = basenameMatches[0];
    const kind = entryKindForPath(path);
    return kind ? { status: "resolved", path, kind } : { status: "invalid" };
  }
  if (basenameMatches.length > 1) return { status: "ambiguous", candidates: basenameMatches };

  const proposed = hasFolder
    ? normalizeVaultPath(requestedExtension ? clean : `${clean}.md`)
    : normalizeVaultPath(join(sourceFolder, requestedExtension ? clean : `${clean}.md`));
  return { status: "missing", proposedPath: proposed };
}

export function mapMovedPath(path: string, oldPath: string, newPath: string): string {
  if (path === oldPath) return newPath;
  return path.startsWith(`${oldPath}/`) ? `${newPath}${path.slice(oldPath.length)}` : path;
}

export function rewriteLinksForMove(
  markdown: string,
  oldSourcePath: string,
  newSourcePath: string,
  oldPaths: string[],
  oldMovedPath: string,
  newMovedPath: string,
): string {
  const newPaths = oldPaths.map((path) => mapMovedPath(path, oldMovedPath, newMovedPath));
  const rewriteTarget = (target: string, markdownStyle: boolean): string => {
    const { file, suffix } = splitLinkTarget(target);
    const resolution = resolveVaultLink(oldSourcePath, file, oldPaths);
    if (resolution.status !== "resolved") return target;
    const mappedTarget = mapMovedPath(resolution.path, oldMovedPath, newMovedPath);
    const sourceMoved = oldSourcePath !== newSourcePath;
    const targetMoved = mappedTarget !== resolution.path;
    if (!sourceMoved && !targetMoved) return target;

    if (!markdownStyle) {
      const base = basename(mappedTarget);
      const duplicateCount = newPaths.filter(
        (path) => basename(path).toLocaleLowerCase() === base.toLocaleLowerCase(),
      ).length;
      const rendered =
        duplicateCount === 1
          ? withoutMarkdownExtension(base)
          : withoutMarkdownExtension(mappedTarget);
      return `${rendered}${suffix}`;
    }

    const fromFolder = dirname(newSourcePath).replaceAll("\\", "/");
    let relativePath = relative(fromFolder, mappedTarget);
    if (!relativePath.startsWith(".")) relativePath = `./${relativePath}`;
    return `${encodeURI(relativePath).replaceAll("#", "%23")}${suffix}`;
  };

  const wikilinks = markdown.replace(
    /(!?\[\[)([^\]|]+)((?:\|[^\]]+)?)\]\]/g,
    (_match, prefix: string, target: string, alias: string) =>
      `${prefix}${rewriteTarget(target, false)}${alias}]]`,
  );

  return wikilinks.replace(
    /(!?\[[^\]]*\]\()([^)\s]+)(\))/g,
    (_match, prefix: string, target: string, suffix: string) =>
      `${prefix}${rewriteTarget(decodeURI(target), true)}${suffix}`,
  );
}
