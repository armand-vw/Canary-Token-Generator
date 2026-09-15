import { describe, it, expect } from "vitest";
import { escapeHtml, validateUrl, isValidJson, formatBytes, formatDate, truncate } from "../js/ui.js";

describe("escapeHtml", () => {
  it("neutralises HTML-significant characters", () => {
    expect(escapeHtml('<img src="x" onerror="alert(1)">')).toBe(
      "&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;"
    );
    expect(escapeHtml("a & b 'c'")).toBe("a &amp; b &#39;c&#39;");
  });

  it("handles nullish input", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("validateUrl", () => {
  it("accepts https endpoints", () => {
    const result = validateUrl("https://webhook.site/abc-123");
    expect(result.ok).toBe(true);
    expect(result.url.host).toBe("webhook.site");
  });

  it("rejects empty, malformed and non-http values", () => {
    expect(validateUrl("").ok).toBe(false);
    expect(validateUrl("not a url").ok).toBe(false);
    expect(validateUrl("ftp://example.com").ok).toBe(false);
  });

  it("allows http only for localhost", () => {
    expect(validateUrl("http://localhost:8080/hook").ok).toBe(true);
    expect(validateUrl("http://127.0.0.1/hook").ok).toBe(true);
    expect(validateUrl("http://example.com/hook").ok).toBe(false);
  });
});

describe("isValidJson", () => {
  it("detects valid and invalid JSON", () => {
    expect(isValidJson('{"a":1}')).toBe(true);
    expect(isValidJson("{ not json")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats byte counts", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("handles invalid input", () => {
    expect(formatBytes(NaN)).toBe("0 B");
  });
});

describe("formatDate", () => {
  it("returns an em dash for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("formats valid dates", () => {
    expect(formatDate("2026-01-01T00:00:00.000Z")).not.toBe("—");
  });
});

describe("truncate", () => {
  it("shortens long strings with an ellipsis", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
    expect(truncate("abc", 5)).toBe("abc");
  });
});
