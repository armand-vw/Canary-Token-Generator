// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readAll,
  addToken,
  removeToken,
  clearTokens,
  getToken,
  exportPayload,
  importPayload,
  summarize,
  subscribe
} from "../js/store.js";

const KEY = "ctg.tokens.v1";

function makeToken(overrides = {}) {
  return {
    id: "ct_test",
    type: "web-bug",
    label: "Test token",
    endpoint: "https://webhook.site/abc",
    mode: "GET",
    beaconUrl: "https://webhook.site/abc?ct=ct_test",
    createdAt: new Date().toISOString(),
    artifacts: [],
    ...overrides
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("store CRUD", () => {
  it("starts empty", () => {
    expect(readAll()).toEqual([]);
  });

  it("adds, reads and de-duplicates by id", () => {
    addToken(makeToken({ id: "ct_a", label: "A" }));
    addToken(makeToken({ id: "ct_b", label: "B" }));
    addToken(makeToken({ id: "ct_a", label: "A updated" }));

    const tokens = readAll();
    expect(tokens).toHaveLength(2);
    expect(getToken("ct_a").label).toBe("A updated");
    // newest first
    expect(tokens[0].id).toBe("ct_a");
  });

  it("removes a token by id", () => {
    addToken(makeToken({ id: "ct_a" }));
    addToken(makeToken({ id: "ct_b" }));
    expect(removeToken("ct_a")).toBe(true);
    expect(readAll().map((token) => token.id)).toEqual(["ct_b"]);
  });

  it("clears all tokens", () => {
    addToken(makeToken({ id: "ct_a" }));
    clearTokens();
    expect(readAll()).toEqual([]);
  });

  it("tolerates corrupted storage", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(KEY, "{ not json");
    expect(readAll()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

describe("export / import", () => {
  it("exports a self-describing payload", () => {
    addToken(makeToken({ id: "ct_a" }));
    const payload = exportPayload();
    expect(payload.schema).toBe("canary-token-generator/v1");
    expect(payload.count).toBe(1);
    expect(payload.tokens).toHaveLength(1);
  });

  it("imports new tokens and reports duplicates and skips", () => {
    addToken(makeToken({ id: "ct_a" }));
    const incoming = {
      tokens: [
        makeToken({ id: "ct_a" }), // duplicate
        makeToken({ id: "ct_b" }), // new
        { id: "ct_broken" } // invalid (no type/endpoint)
      ]
    };
    const result = importPayload(JSON.stringify(incoming));
    expect(result.added).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.skipped).toBe(1);
    expect(readAll()).toHaveLength(2);
  });

  it("rejects malformed input", () => {
    expect(importPayload("not json").error).toBeTruthy();
    expect(importPayload(JSON.stringify({ nope: true })).error).toBeTruthy();
  });
});

describe("summarize + subscribe", () => {
  it("aggregates counts by type", () => {
    addToken(makeToken({ id: "ct_a", type: "web-bug" }));
    addToken(makeToken({ id: "ct_b", type: "pdf" }));
    addToken(makeToken({ id: "ct_c", type: "pdf" }));
    const summary = summarize();
    expect(summary.total).toBe(3);
    expect(summary.byType.pdf).toBe(2);
    expect(summary.latest).toBeTruthy();
  });

  it("notifies subscribers on mutation and supports unsubscribe", () => {
    let calls = 0;
    const unsubscribe = subscribe(() => {
      calls += 1;
    });
    addToken(makeToken({ id: "ct_a" }));
    expect(calls).toBe(1);
    unsubscribe();
    addToken(makeToken({ id: "ct_b" }));
    expect(calls).toBe(1);
  });
});
