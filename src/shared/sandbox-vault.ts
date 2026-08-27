export const SANDBOX_VAULT_ID = "graphite-sandbox";
export const SANDBOX_VAULT_NAME = "Graphite Sandbox";
export const SANDBOX_START_NOTE = "Home.md";

export interface SandboxVaultFile {
  path: string;
  bytes: Uint8Array;
}

const encoder = new TextEncoder();

function text(value: string, bom = false): Uint8Array {
  const content = encoder.encode(value.replace(/\r?\n/g, "\r\n"));
  if (!bom) return content;
  const bytes = new Uint8Array(content.length + 3);
  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(content, 3);
  return bytes;
}

function bytesFromHex(value: string): Uint8Array {
  const clean = value.replaceAll(" ", "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function createWave(): Uint8Array {
  const sampleRate = 8_000;
  const sampleCount = 1_600;
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  bytes.set(encoder.encode("RIFF"), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(encoder.encode("WAVEfmt "), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set(encoder.encode("data"), 36);
  view.setUint32(40, sampleCount * 2, true);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const fade = 1 - sample / sampleCount;
    const value = Math.sin((sample / sampleRate) * Math.PI * 2 * 440) * 5_000 * fade;
    view.setInt16(44 + sample * 2, Math.round(value), true);
  }
  return bytes;
}

function createPdf(): Uint8Array {
  const content = "BT /F1 20 Tf 38 104 Td (Graphite sandbox PDF) Tj ET\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 180] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(encoder.encode(pdf).length);
    pdf += object;
  }
  const xref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoder.encode(pdf);
}

export function createSandboxVaultFiles(): SandboxVaultFile[] {
  return [
    {
      path: "Home.md",
      bytes: text(`---
title: Graphite Sandbox
tags:
  - graphite
  - fixture
---

# Graphite Sandbox

This safe sample vault ships with Graphite. Edit, rename, move, and delete its contents without risking your notes.

## Editing

This paragraph has **bold text**, *emphasis*, ~~strikethrough~~, and \`inline code\`.

- [ ] Toggle an incomplete task
- [x] Toggle a completed task
- A regular list item

| Mode | Purpose |
| --- | --- |
| Inline | Editable live formatting |
| Code | Raw Markdown |
| Preview | Readonly rendering |

\`\`\`ts
const graphite = "offline";
\`\`\`

## Links

- [[Notes/Welcome|Resolved explicit note]]
- [[Unique Note]] resolves by unique basename.
- [[Missing Note]] can be created beside this note.
- [[Shared]] is intentionally ambiguous.
- [Standard local link](Notes/Welcome.md)
- [External link](https://example.com) opens only when clicked.

## Embeds

![[Attachments/pixel.png]]
![[Attachments/tone.wav]]
![[Attachments/sample.pdf]]
![[Embeds/Level 1]]
`),
    },
    {
      path: "Notes/Welcome.md",
      bytes: text(
        "# Welcome\n\nRename or move this note to test inbound link rewriting.\n\n[Back home](../Home.md)\n",
      ),
    },
    {
      path: "Notes/Unique Note.md",
      bytes: text("# Unique Note\n\nThis basename is unique in the vault.\n"),
    },
    {
      path: "Ambiguous/A/Shared.md",
      bytes: text("# Shared A\n\nOne ambiguous basename candidate.\n"),
    },
    {
      path: "Ambiguous/B/Shared.md",
      bytes: text("# Shared B\n\nThe other ambiguous basename candidate.\n"),
    },
    { path: "Embeds/Level 1.md", bytes: text("# Level 1\n\n![[Embeds/Level 2]]\n") },
    { path: "Embeds/Level 2.md", bytes: text("# Level 2\n\n![[Embeds/Level 3]]\n") },
    { path: "Embeds/Level 3.md", bytes: text("# Level 3\n\n![[Embeds/Level 4]]\n") },
    {
      path: "Embeds/Level 4.md",
      bytes: text("# Level 4\n\nThis content exceeds the nested embed limit.\n"),
    },
    { path: "Embeds/Cycle A.md", bytes: text("# Cycle A\n\n![[Embeds/Cycle B]]\n") },
    { path: "Embeds/Cycle B.md", bytes: text("# Cycle B\n\n![[Embeds/Cycle A]]\n") },
    {
      path: "Security/Unsafe HTML.md",
      bytes: text(
        '# Sanitization\n\n<script>alert("never")</script>\n\n<img src="https://example.com/remote.png" onerror="alert(1)">\n\n<a href="javascript:alert(1)">unsafe URL</a>\n',
      ),
    },
    {
      path: "Conflicts/Edit Externally.md",
      bytes: text(
        "# External edit target\n\nModify this file outside Graphite while it is open.\n",
      ),
    },
    {
      path: "Conflicts/Delete Externally.md",
      bytes: text(
        "# External deletion target\n\nDelete this file outside Graphite while it is open.\n",
      ),
    },
    {
      path: "Encoding/CRLF.md",
      bytes: text("# CRLF\n\nThis note intentionally uses CRLF.\n"),
    },
    {
      path: "Encoding/BOM.md",
      bytes: text("# BOM\n\nThis note has a UTF-8 BOM.\n", true),
    },
    { path: ".hidden.md", bytes: text("Graphite must not expose dot-prefixed files.\n") },
    {
      path: "Unsupported/readme.txt",
      bytes: text("Unsupported files must not appear in the vault tree.\n"),
    },
    {
      path: "Attachments/pixel.png",
      bytes: bytesFromHex(
        "89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082",
      ),
    },
    {
      path: "Attachments/graphite.svg",
      bytes: text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90"><rect width="240" height="90" rx="12" fill="#222"/><text x="24" y="55" fill="#eee" font-family="sans-serif" font-size="25">Graphite fixture</text></svg>\n',
      ),
    },
    { path: "Attachments/tone.wav", bytes: createWave() },
    { path: "Attachments/sample.pdf", bytes: createPdf() },
    {
      path: "Attachments/unsupported-codec.mp4",
      bytes: text("not a playable media file\n"),
    },
  ];
}
