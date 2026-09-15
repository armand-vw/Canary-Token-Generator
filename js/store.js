/**
 * store.js — local persistence for generated canary tokens
 * ----------------------------------------------------------------------------
 * Tokens live in localStorage under a versioned key. This is deliberate: the
 * app has no backend, so the browser *is* the database. The module exposes a
 * tiny observable API so views can re-render whenever tokens change.
 *
 * Every read/write is defensive — Safari private mode, disabled storage and
 * quota errors are all handled without throwing into the UI.
 */

const STORAGE_KEY = "ctg.tokens.v1";
const listeners = new Set();

/** @typedef {Object} CanaryToken
 * @property {string} id            Unique canary id (also embedded in the beacon).
 * @property {string} type          Token type key, e.g. "web-bug" | "pdf".
 * @property {string} label         Human-friendly name.
 * @property {string} [notes]       Free-form notes.
 * @property {string} endpoint      Webhook / listener URL.
 * @property {'GET'|'POST'} mode    Delivery method.
 * @property {string} beaconUrl     Fully-formed tracking URL.
 * @property {string} createdAt     ISO timestamp.
 * @property {Object} [value]       Generated secret material / files (type-specific).
 * @property {Object} [meta]        Extra type-specific config (preset, filename…).
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

/** Remove a single token by id. */
export function removeToken(id) {
  return writeAll(readAll().filter((token) => token.id !== id));
}

/** Remove every stored token. */
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

  merged.sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));
  writeAll(merged);
  return { added, duplicates, skipped };
}

/** Aggregate counts used by the dashboard stat cards. */
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
