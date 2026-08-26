// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "./sanitize-svg";

describe("SVG sanitization", () => {
  it("removes executable content and remote resources", () => {
    const sanitized = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><image href="https://example.test/a.png"/><path fill="url(https://example.test/a.svg#x)" d="M0 0"/></svg>',
    );
    expect(sanitized).not.toBeNull();
    expect(sanitized).not.toMatch(/script|onload|https:/i);
    expect(sanitized).toContain("<path");
  });

  it("rejects document types and external entities", () => {
    expect(sanitizeSvg('<!DOCTYPE svg SYSTEM "https://example.test/x"><svg/>')).toBeNull();
  });
});
