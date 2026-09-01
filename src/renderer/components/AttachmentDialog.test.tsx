// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDocument, openAttachment, readAsset } = vi.hoisted(() => ({
  getDocument: vi.fn(),
  openAttachment: vi.fn(async () => true),
  readAsset: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument,
}));

vi.mock("../lib/bridge", () => ({
  bridge: {
    readAsset,
    openAttachment,
  },
}));

import { AttachmentDialog } from "./AttachmentDialog";

describe("AttachmentDialog", () => {
  beforeEach(() => {
    openAttachment.mockClear();
    readAsset.mockResolvedValue({
      status: "ok",
      mimeType: "image/png",
      base64: "iVBORw0KGgo=",
    });
    getDocument.mockReturnValue({
      promise: Promise.resolve({ fingerprints: ["fixture"], numPages: 0 }),
      destroy: vi.fn(async () => undefined),
    });
    Object.defineProperties(URL, {
      createObjectURL: {
        configurable: true,
        value: vi.fn(() => "blob:graphite-attachment"),
      },
      revokeObjectURL: { configurable: true, value: vi.fn() },
    });
  });

  it("previews an attachment in-app and retains an explicit external-open action", async () => {
    render(
      <AttachmentDialog
        open
        vaultId="vault"
        path="Attachments/pixel.png"
        kind="image"
        onOpenChange={() => undefined}
      />,
    );

    expect(screen.getByRole("dialog", { name: "pixel.png" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Attachments/pixel.png" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Resize image" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Open externally/ }));
    expect(openAttachment).toHaveBeenCalledWith("vault", "Attachments/pixel.png");
  });

  it("passes PDF bytes directly to PDF.js instead of a worker-fetched blob URL", async () => {
    readAsset.mockResolvedValueOnce({
      status: "ok",
      mimeType: "application/pdf",
      base64: "JVBERi0=",
    });
    render(
      <AttachmentDialog
        open
        vaultId="vault"
        path="Attachments/sample.pdf"
        kind="pdf"
        onOpenChange={() => undefined}
      />,
    );

    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    const input = getDocument.mock.calls[0]?.[0];
    expect(input?.data).toBeInstanceOf(Uint8Array);
    expect(input).not.toHaveProperty("url");
    expect(screen.getByLabelText("PDF preview: Attachments/sample.pdf")).toBeInTheDocument();
  });
});
