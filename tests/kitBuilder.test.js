import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildDeploymentKit, buildGuide, deploymentKitFilename } from "../js/kitBuilder.js";
import { generateToken } from "../js/tokenEngine.js";

const ENDPOINT = "https://webhook.site/abc";

async function sampleTokens() {
  return Promise.all([
    generateToken({ type: "web-bug", label: "Email Pixel", endpoint: ENDPOINT, mode: "GET" }),
    generateToken({
      type: "env-file",
      label: "Leaked .env",
      endpoint: ENDPOINT,
      mode: "GET",
      meta: { envPreset: "dotenv" }
    }),
    generateToken({ type: "qr", label: "Office QR", endpoint: ENDPOINT, mode: "GET", meta: { qrSize: 256 } })
  ]);
}

describe("buildGuide", () => {
  it("lists each token and the safety notice", () => {
    const guide = buildGuide([
      { id: "ct_x", type: "web-bug", label: "Pixel", mode: "GET" },
      { id: "ct_y", type: "pdf", label: "Invoice", mode: "GET" }
    ]);
    expect(guide).toContain("# Canary Deployment Kit");
    expect(guide).toContain("| Pixel |");
    expect(guide).toContain("`ct_x`");
    expect(guide).toContain("authorized to monitor");
  });

  it("escapes pipes in labels so the table stays intact", () => {
    const guide = buildGuide([{ id: "ct_z", type: "web-bug", label: "a|b", mode: "GET" }]);
    expect(guide).toContain("a\\|b");
  });
});

describe("buildDeploymentKit", () => {
  it("zips the register, guide, snippets, files and QR codes", async () => {
    const tokens = await sampleTokens();
    const kit = await buildDeploymentKit(tokens, { tokens }, { includePdfs: false });

    expect(kit.blob.type).toBe("application/zip");
    expect(kit.bytes).toBeGreaterThan(0);

    const entries = Object.keys(unzipSync(new Uint8Array(await kit.blob.arrayBuffer())));
    expect(entries).toContain("DEPLOYMENT.md");
    expect(entries).toContain("tokens.json");
    expect(entries.some((entry) => entry.startsWith("snippets/") && entry.endsWith(".html"))).toBe(true);
    expect(entries.some((entry) => entry.startsWith("files/") && entry.endsWith(".env"))).toBe(true);
    expect(entries.some((entry) => entry.startsWith("qr/") && entry.endsWith(".svg"))).toBe(true);
  });

  it("writes a valid, re-importable tokens.json", async () => {
    const tokens = await sampleTokens();
    const kit = await buildDeploymentKit(tokens, { schema: "canary-token-generator/v1", tokens });
    const archive = unzipSync(new Uint8Array(await kit.blob.arrayBuffer()));
    const parsed = JSON.parse(strFromU8(archive["tokens.json"]));
    expect(parsed.tokens).toHaveLength(tokens.length);
  });

  it("includes generated PDFs when requested", async () => {
    const pdfToken = await generateToken({
      type: "pdf",
      label: "Decoy Invoice",
      endpoint: ENDPOINT,
      mode: "GET",
      meta: { preset: "invoice" }
    });
    const kit = await buildDeploymentKit([pdfToken], { tokens: [pdfToken] }, { includePdfs: true });
    const entries = Object.keys(unzipSync(new Uint8Array(await kit.blob.arrayBuffer())));
    expect(entries.some((entry) => entry.startsWith("documents/") && entry.endsWith(".pdf"))).toBe(true);
    expect(kit.warnings).toHaveLength(0);
  });
});

describe("deploymentKitFilename", () => {
  it("is date-stamped and ends in .zip", () => {
    expect(deploymentKitFilename(new Date("2026-03-04T12:00:00Z"))).toBe("canary-deployment-kit-2026-03-04.zip");
  });
});
