import { describe, expect, it } from "vitest";
import { decodeMarkdown, encodeMarkdown } from "./encoding";

describe("Markdown encoding", () => {
  it("preserves BOM and predominant CRLF", () => {
    const source = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode("one\r\ntwo\r\n"),
    ]);
    const decoded = decodeMarkdown(source);
    expect(decoded).toEqual({ text: "one\ntwo\n", newline: "crlf", hasBom: true });
    expect(
      Array.from(encodeMarkdown(decoded.text, decoded.newline, decoded.hasBom)).slice(0, 3),
    ).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(encodeMarkdown(decoded.text, decoded.newline, false))).toBe(
      "one\r\ntwo\r\n",
    );
  });

  it("creates normalized UTF-8 LF content", () => {
    expect(new TextDecoder().decode(encodeMarkdown("one\r\ntwo", "lf", false))).toBe("one\ntwo");
  });
});
