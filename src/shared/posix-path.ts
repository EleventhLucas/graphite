function segments(value: string): string[] {
  const resolved: string[] = [];
  for (const segment of value.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length > 0 && resolved.at(-1) !== "..") resolved.pop();
      else resolved.push(segment);
    } else {
      resolved.push(segment);
    }
  }
  return resolved;
}

export function normalize(value: string): string {
  const absolute = value.startsWith("/");
  const result = segments(value).join("/");
  if (absolute) return `/${result}`;
  return result || ".";
}

export function join(...values: string[]): string {
  return normalize(values.filter(Boolean).join("/"));
}

export function dirname(value: string): string {
  const clean = normalize(value).replace(/\/+$/, "");
  const separator = clean.lastIndexOf("/");
  if (separator < 0) return ".";
  if (separator === 0) return "/";
  return clean.slice(0, separator);
}

export function basename(value: string, suffix = ""): string {
  const clean = normalize(value).replace(/\/+$/, "");
  const name = clean.slice(clean.lastIndexOf("/") + 1);
  return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

export function extname(value: string): string {
  const name = basename(value);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot);
}

export function relative(from: string, to: string): string {
  const source = segments(normalize(from));
  const target = segments(normalize(to));
  let common = 0;
  while (common < source.length && source[common] === target[common]) common += 1;
  return [...source.slice(common).map(() => ".."), ...target.slice(common)].join("/");
}
