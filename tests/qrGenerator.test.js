import { describe, it, expect } from "vitest";
import { generateQrSvg, svgToDataUrl } from "../docs/js/qrGenerator.js";

describe("generateQrSvg", () => {
  it("renders an SVG QR code for a tracking URL", async () => {
    const svg = await generateQrSvg("https://webhook.site/abc?ct=ct_qr", { size: 256 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg.length).toBeGreaterThan(200);
  });

  it("reflects different inputs in the generated markup", async () => {
    const a = await generateQrSvg("https://example.com/a", { size: 256 });
    const b = await generateQrSvg("https://example.com/b", { size: 256 });
    expect(a).not.toBe(b);
  });
});

describe("svgToDataUrl", () => {
  it("produces a usable data URL", () => {
    const url = svgToDataUrl('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(url).toContain("%3Csvg");
  });
});
