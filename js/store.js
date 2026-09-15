/**
 * store.js — localStorage persistence for generated tokens. Reads and writes
 * are defensive: private mode, disabled storage and quota errors never throw.
 */

const STORAGE_KEY = "ctg.tokens.v1";
const listeners = new Set();

/**
 * A deployable artifact belonging to a token (snippet, decoy file or image).
 * @typedef {Object} CanaryArtifact
 * @property {string} key             Stable identifier within the token.
 * @property {string} label           Display label.
 * @property {string} value           Text content, file body or SVG markup.
 * @property {'text'|'file'|'image'} [kind]
 * @property {string} [filename]      Suggested download name for files/images.
 * @property {string} [language]      Syntax hint for display.
 */

/** @typedef {Object} CanaryToken
 * @property {string} id              Unique canary id (also embedded in the beacon).
 * @property {string} type            Token type key, e.g. "web-bug" | "pdf" | "qr".
 * @property {string} label           Human-friendly name.
 * @property {string} [notes]         Free-form notes.
 * @property {string} endpoint        Webhook / listener URL.
 * @property {'GET'|'POST'} mode      Delivery method.
 * @property {string} beaconUrl       Fully-formed tracking URL.
 * @property {Object|null} [customPayload] JSON merged into POST beacons.
 * @property {Object} [meta]          Extra type-specific config (preset, filename…).
 * @property {string} createdAt       ISO timestamp.
 * @property {CanaryArtifact[]} [artifacts] Generated deployment material.
 */

function notify() {
  for (const listener of listeners) {
    try {
      listener(readAll());
    } catch (error) {
      console.error("[store] listener failed", error);
    }
  }
}

/** Subscribe to token changes. Returns an unsubscribe function. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read every stored token, newest first. Never throws. */
export function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((token) => token && typeof token === "object" && token.id);
  } catch (error) {
    console.warn("[store] Could not read tokens from localStorage", error);
    return [];
  }
}

function writeAll(tokens) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    notify();
    return true;
  } catch (error) {
    console.error("[store] Could not persist tokens", error);
    return false;
  }
}

/** Add a token (de-duplicating by id) and persist. */
export function addToken(token) {
  const tokens = readAll().filter((existing) => existing.id !== token.id);
  tokens.unshift(token);
  return writeAll(tokens);
}

export function removeToken(id) {
  return writeAll(readAll().filter((token) => token.id !== id));
}

export function clearTokens() {
  return writeAll([]);
}

export function getToken(id) {
  return readAll().find((token) => token.id === id) ?? null;
}

/** Export shape includes metadata so files are self-describing. */
export function exportPayload() {
  return {
    schema: "canary-token-generator/v1",
    exportedAt: new Date().toISOString(),
    count: readAll().length,
    tokens: readAll()
  };
}

/**
 * Import tokens from a previously exported JSON payload.
 * @returns {{added: number, duplicates: number, skipped: number, error?: string}}
 */
export function importPayload(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { added: 0, duplicates: 0, skipped: 0, error: "File is not valid JSON." };
  }

  const incoming = Array.isArray(parsed) ? parsed : parsed?.tokens;
  if (!Array.isArray(incoming)) {
    return { added: 0, duplicates: 0, skipped: 0, error: "No token array found in the file." };
  }

  const existing = readAll();
  const existingIds = new Set(existing.map((token) => token.id));
  let added = 0;
  let duplicates = 0;
  let skipped = 0;

  const merged = [...existing];
  for (const token of incoming) {
    if (!token || typeof token !== "object" || !token.id || !token.type || !token.endpoint) {
      skipped += 1;
      continue;
    }
    if (existingIds.has(token.id)) {
      duplicates += 1;
      continue;
    }
    existingIds.add(token.id);
    merged.push(token);
    added += 1;
  }

  merged.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  writeAll(merged);
  return { added, duplicates, skipped };
}

export function summarize(tokens = readAll()) {
  const byType = tokens.reduce((acc, token) => {
    acc[token.type] = (acc[token.type] ?? 0) + 1;
    return acc;
  }, {});
  return {
    total: tokens.length,
    byType,
    latest: tokens[0]?.createdAt ?? null
  };
}
