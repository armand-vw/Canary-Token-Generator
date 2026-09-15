import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { generatePdf } from "../js/pdfGenerator.js";

/** @returns {any} */
function pdfToken(overrides = {}) {
  return {
    id: "ct_pdf_test",
    type: "pdf",
    label: "Quarterly Invoice",
    endpoint: "https://webhook.site/abc",
    mode: "GET",
    beaconUrl: "https://webhook.site/abc?ct=ct_pdf_test&label=Quarterly+Invoice",
    createdAt: "2026-01-01T00:00:00.000Z",
    meta: { preset: "invoice" },
    artifacts: [],
    ...overrides
  };
}

describe("generatePdf", () => {
  it("produces a valid single-page PDF blob", async () => {
    const { blob, filename, bytes } = await generatePdf(pdfToken());
    expect(blob.type).toBe("application/pdf");
    expect(bytes).toBeGreaterThan(1000);
    expect(filename).toBe("quarterly-invoice.pdf");

    const buffer = new Uint8Array(await blob.arrayBuffer());
    const header = new TextDecoder().decode(buffer.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("embeds a link annotation whose URI is the beacon", async () => {
    const { blob } = await generatePdf(pdfToken());
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));

    expect(doc.getPageCount()).toBe(1);

    const annots = doc.getPage(0).node.Annots();
    expect(annots).toBeTruthy();
    expect(annots.size()).toBe(1);

    const dict = /** @type {any} */ (doc.context.lookup(annots.get(0)));
    const action = dict.lookup(PDFName.of("A"));
    const uri = action.lookup(PDFName.of("URI"));
    expect(String(uri.decodeText())).toBe("https://webhook.site/abc?ct=ct_pdf_test&label=Quarterly+Invoice");
  });

  it("honours a custom filename and every document preset", async () => {
    const custom = await generatePdf(pdfToken({ meta: { preset: "resume", filename: "cv.pdf" } }));
    expect(custom.filename).toBe("cv.pdf");

    for (const preset of ["invoice", "resume", "handbook", "memo"]) {
      const result = await generatePdf(pdfToken({ meta: { preset } }));
      expect(result.bytes).toBeGreaterThan(1000);
    }
  });
});
