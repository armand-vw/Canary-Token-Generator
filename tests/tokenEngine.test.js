import { describe, it, expect } from "vitest";
import {
  TOKEN_TYPES,
  generateCanaryId,
  randomString,
  base64Url,
  generateAwsKeyPair,
  generateJwt,
  generateDatabaseString,
  buildBeaconUrl,
  buildPayload,
  buildSnippets,
  generateToken,
  slugify,
  badgeClassFor
} from "../js/tokenEngine.js";

const ENDPOINT = "https://webhook.site/11111111-2222-3333-4444-555555555555";

function decodeJwtPart(part) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("random helpers", () => {
  it("mints canary ids with a ct_ prefix", () => {
    const id = generateCanaryId();
    expect(id).toMatch(/^ct_[A-Za-z0-9]{22}$/);
    expect(generateCanaryId()).not.toBe(id);
  });

  it("produces random strings of the requested length and alphabet", () => {
    const value = randomString(32, "AB");
    expect(value).toHaveLength(32);
    expect(value).toMatch(/^[AB]+$/);
  });

  it("encodes base64url without padding or unsafe characters", () => {
    expect(base64Url("hello")).toBe("aGVsbG8");
    expect(base64Url("~~~")).not.toMatch(/[+/=]/);
  });
});

describe("credential factories", () => {
  it("builds a structurally valid AWS key pair", () => {
    const { accessKeyId, secretAccessKey, sessionToken } = generateAwsKeyPair();
    expect(accessKeyId).toMatch(/^AKIA[A-Z0-9]{16}$/);
    expect(secretAccessKey).toHaveLength(40);
    expect(sessionToken.startsWith("FwoGZXIvYXdzE")).toBe(true);
  });

  it("builds a three-part JWT carrying the canary claim", () => {
    const jwt = generateJwt({ issuer: "test-issuer" }, "ct_example");
    const [header, payload, signature] = jwt.split(".");
    expect(jwt.split(".")).toHaveLength(3);
    expect(decodeJwtPart(header)).toEqual({ alg: "HS256", typ: "JWT" });
    const claims = decodeJwtPart(payload);
    expect(claims.jti).toBe("ct_example");
    expect(claims.iss).toBe("test-issuer");
    expect(claims.canary).toBe(true);
    expect(signature.length).toBeGreaterThan(0);
  });

  it("embeds the canary id in a PostgreSQL connection string", () => {
    const dsn = generateDatabaseString("ct_example", { host: "db.internal" });
    expect(dsn.startsWith("postgresql://")).toBe(true);
    expect(dsn).toContain("ct_example");
    expect(dsn).toContain("db.internal");
  });
});

describe("beacon construction", () => {
  /** @type {import("../js/store.js").CanaryToken} */
  const token = {
    id: "ct_beacon",
    label: "My Canary",
    type: "web-bug",
    endpoint: ENDPOINT,
    mode: "GET",
    beaconUrl: "https://webhook.site/abc?ct=ct_beacon",
    createdAt: "2026-01-01T00:00:00.000Z",
    meta: { channel: "email" }
  };

  it("appends identifying query parameters", () => {
    const url = new URL(buildBeaconUrl(ENDPOINT, token));
    expect(url.searchParams.get("ct")).toBe("ct_beacon");
    expect(url.searchParams.get("label")).toBe("My Canary");
    expect(url.searchParams.get("type")).toBe("web-bug");
    expect(url.searchParams.get("src")).toBe("canary-token-generator");
    expect(url.searchParams.get("channel")).toBe("email");
  });

  it("builds a payload and merges the custom payload", () => {
    const payload = buildPayload({ ...token, customPayload: { severity: "high" } });
    expect(payload.event).toBe("canary.triggered");
    expect(payload.canaryId).toBe("ct_beacon");
    expect(payload.severity).toBe("high");

    const testPayload = buildPayload(token, { test: true });
    expect(testPayload.event).toBe("canary.test");
  });

  it("provides HTML, Markdown and cURL snippets", () => {
    const snippets = buildSnippets({ ...token, beaconUrl: buildBeaconUrl(ENDPOINT, token) });
    expect(snippets.html).toContain("<img");
    expect(snippets.markdown.startsWith("![")).toBe(true);
    expect(snippets.curl).toContain("curl");
  });
});

describe("generateToken dispatcher", () => {
  const types = Object.keys(TOKEN_TYPES).filter((type) => type !== "credentials" && type !== "env-file");

  it.each(types)("generates a valid %s token", async (type) => {
    const token = await generateToken({ type, label: "Dispatcher", endpoint: ENDPOINT, mode: "GET" });
    expect(token.id).toMatch(/^ct_/);
    expect(token.beaconUrl).toContain(`ct=${token.id}`);
    expect(token.artifacts.length).toBeGreaterThan(0);
    expect(token).toHaveProperty("createdAt");
  });

  it("generates every credential format", async () => {
    for (const credentialType of ["aws", "jwt", "database"]) {
      const token = await generateToken({
        type: "credentials",
        label: `Cred ${credentialType}`,
        endpoint: ENDPOINT,
        mode: "POST",
        meta: { credentialType }
      });
      expect(token.artifacts.length).toBeGreaterThan(0);
      for (const artifact of token.artifacts) {
        expect(typeof artifact.value).toBe("string");
        expect(artifact.value.length).toBeGreaterThan(0);
      }
    }
  });

  it("generates every env-file preset as a downloadable file artifact", async () => {
    for (const envPreset of ["dotenv", "aws", "ssh"]) {
      const token = await generateToken({
        type: "env-file",
        label: `Env ${envPreset}`,
        endpoint: ENDPOINT,
        mode: "GET",
        meta: { envPreset }
      });
      const file = token.artifacts.find((artifact) => artifact.kind === "file");
      expect(file, `missing file artifact for ${envPreset}`).toBeTruthy();
      expect(file.filename.length).toBeGreaterThan(0);
    }
  });

  it("produces a QR image artifact for qr tokens", async () => {
    const token = await generateToken({
      type: "qr",
      label: "QR",
      endpoint: ENDPOINT,
      mode: "GET",
      meta: { qrSize: 256 }
    });
    const image = token.artifacts.find((artifact) => artifact.kind === "image");
    expect(image).toBeTruthy();
    expect(image.value.startsWith("<svg")).toBe(true);
    expect(image.filename.endsWith(".svg")).toBe(true);
  });

  it("ignores invalid custom payload JSON rather than throwing", async () => {
    const token = await generateToken({
      type: "web-bug",
      label: "Bad payload",
      endpoint: ENDPOINT,
      mode: "POST",
      customPayload: "{ not json"
    });
    expect(token.customPayload).toBeNull();
  });
});

describe("presentation helpers", () => {
  it("slugs labels into safe filenames", () => {
    expect(slugify("Payroll Q3 Draft!!")).toBe("payroll-q3-draft");
    expect(slugify("")).toBe("canary");
  });

  it("maps accents to badge classes", () => {
    expect(badgeClassFor("cyan")).toBe("badge-cyan");
    expect(badgeClassFor("rose")).toBe("badge-rose");
    expect(badgeClassFor("unknown")).toBe("");
  });
});
