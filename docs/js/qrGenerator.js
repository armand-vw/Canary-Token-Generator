/**
 * qrGenerator.js — renders a beacon URL as a scannable QR. Emits SVG (no canvas
 * needed, crisp at any print size); the qrcode dependency is lazy-loaded.
 */

/** @type {Promise<any> | null} */
let qrLibPromise = null;

function loadQrLib() {
  if (!qrLibPromise) {
    qrLibPromise = import("qrcode").catch((error) => {
      qrLibPromise = null; // allow a retry on the next attempt
      throw error;
    });
  }
  return qrLibPromise;
}

/**
 * Render `text` as an SVG QR code.
 *
 * @param {string} text                    Content to encode (the beacon URL).
 * @param {{ size?: number, margin?: number, dark?: string, light?: string }} [options]
 * @returns {Promise<string>} SVG markup.
 */
export async function generateQrSvg(text, options = {}) {
  const { size, margin = 2, dark = "#0f172a", light = "#ffffff" } = options;
  const mod = await loadQrLib();
  const toString = mod.toString ?? mod.default?.toString;
  if (typeof toString !== "function") {
    throw new Error("qrcode library did not expose a toString() function");
  }
  return toString(text, {
    type: "svg",
    margin,
    width: Number(size) || 512,
    errorCorrectionLevel: "M",
    color: { dark, light }
  });
}

/**
 * Wrap an SVG string as a data URL for inline <img> use.
 * @param {string} svg
 * @returns {string}
 */
export function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
