export interface DecodedText {
  text: string;
  newline: "lf" | "crlf";
  hasBom: boolean;
}

export function decodeMarkdown(bytes: Uint8Array): DecodedText {
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasBom ? bytes.slice(3) : bytes;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  const crlfCount = text.match(/\r\n/g)?.length ?? 0;
  const lfCount = text.match(/(?<!\r)\n/g)?.length ?? 0;
  return {
    text: text.replaceAll("\r\n", "\n"),
    newline: crlfCount > lfCount ? "crlf" : "lf",
    hasBom,
  };
}

export function encodeMarkdown(text: string, newline: "lf" | "crlf", hasBom: boolean): Uint8Array {
  const normalized = text.replaceAll("\r\n", "\n");
  const encoded = new TextEncoder().encode(
    newline === "crlf" ? normalized.replaceAll("\n", "\r\n") : normalized,
  );
  if (!hasBom) return encoded;
  const bytes = new Uint8Array(encoded.length + 3);
  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(encoded, 3);
  return bytes;
}
