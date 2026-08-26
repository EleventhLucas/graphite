const BLOCKED_ELEMENTS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "link",
  "style",
]);
const RESOURCE_ATTRIBUTES = new Set(["href", "xlink:href", "src"]);

export function sanitizeSvg(source: string): string | null {
  if (/<!doctype|<!entity|<\?xml-stylesheet/i.test(source)) return null;
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror") || document.documentElement.localName !== "svg") {
    return null;
  }

  for (const element of document.querySelectorAll("*")) {
    if (BLOCKED_ELEMENTS.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith("on") ||
        name === "style" ||
        (RESOURCE_ATTRIBUTES.has(name) && !value.startsWith("#")) ||
        (/url\s*\(/i.test(value) && !/url\s*\(\s*#/i.test(value))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return new XMLSerializer().serializeToString(document.documentElement);
}
