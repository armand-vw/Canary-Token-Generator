/**
 * tokenEngine.js — canary token generation + beacon delivery
 * ----------------------------------------------------------------------------
 * Pure, framework-free logic for:
 *   1. Minting unique canary ids.
 *   2. Building realistic decoy material (web bugs, fake AWS keys, JWTs,
 *      connection strings, .env files).
 *   3. Formatting deployment snippets (HTML / Markdown / cURL).
 *   4. Dispatching alerts to a user-supplied webhook (GET pixel or POST JSON).
 *
 * The module has no DOM dependencies beyond `fetch`/`Image` at dispatch time,
 * which keeps it easy to reason about and unit-test.
 */

/* ============================================================================
 * Token type registry (drives the "Generate" cards + configurator forms)
 * ========================================================================== */

export const TOKEN_TYPES = {
  "web-bug": {
    id: "web-bug",
    name: "Web Bug / Tracking Link",
    tagline: "HTTP beacon",
    description:
      "A unique URL that fires an alert the moment it is requested. Embed it in emails, docs, wikis or HTML as an invisible pixel.",
    icon: "crosshair",
    accent: "cyan",
    supportsCustomPayload: true
  },
  pdf: {
    id: "pdf",
    name: "Decoy PDF Document",
    tagline: "Embedded link",
    description:
      "A realistic PDF built in-browser with an embedded tracking link. Alerts fire when the document's link is followed.",
    icon: "file-text",
    accent: "violet",
    supportsCustomPayload: false
  },
  credentials: {
    id: "credentials",
    name: "Fake Credentials / API Keys",
    tagline: "AWS · JWT · DB",
    description:
      "Realistic-looking key material tagged with your canary id. Plant it in configs, repos or password managers to catch reuse.",
    icon: "key-round",
    accent: "amber",
    supportsCustomPayload: false
  },
  "env-file": {
    id: "env-file",
    name: "Decoy .env / Config File",
    tagline: "Downloadable bait",
    description:
      "A downloadable secrets file (.env, AWS credentials, SSH config) that combines keys with a hidden tracking endpoint.",
    icon: "file-lock-2",
    accent: "emerald",
    supportsCustomPayload: false
  }
};

export const CREDENTIAL_TYPES = {
  aws: { id: "aws", name: "AWS Access Key + Secret", hint: "AKIA… key id and 40-char secret" },
  jwt: { id: "jwt", name: "JSON Web Token (HS256)", hint: "Signed-looking JWT with canary claim" },
  database: { id: "database", name: "Database Connection String", hint: "PostgreSQL URI with embedded canary id" }
};

export const ENV_PRESETS = {
  dotenv: { id: "dotenv", name: ".env", filename: ".env" },
  aws: { id: "aws", name: "AWS credentials file", filename: "credentials" },
  ssh: { id: "ssh", name: "SSH config", filename: "config" }
};

export const PDF_PRESETS = {
  invoice: { id: "invoice", name: "Invoice", title: "Invoice #INV-2043" },
  resume: { id: "resume", name: "Resume / CV", title: "Curriculum Vitae" },
  handbook: { id: "handbook", name: "Employee Handbook", title: "Employee Handbook" },
  memo: { id: "memo", name: "Internal Memo", title: "Internal Memorandum" }
};

/* ============================================================================
 * Random / crypto helpers
 * ========================================================================== */

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const UPPER_ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const AWS_SECRET_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Cryptographically-random string from a given alphabet. */
export function randomString(length, alphabet = BASE62) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** URL-safe base64 without padding. */
export function base64Url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A unique, URL-safe canary id. Also embedded into the beacon query string. */
export function generateCanaryId() {
  return `ct_${randomString(22)}`;
}

/* ============================================================================
 * Decoy material factories
 * ========================================================================== */

/** Realistic AWS access key pair. */
export function generateAwsKeyPair() {
  return {
    accessKeyId: `AKIA${randomString(16, UPPER_ALNUM)}`,
    secretAccessKey: randomString(40, AWS_SECRET_ALPHABET),
    sessionToken: `FwoGZXIvYXdzE${base64Url(randomBytes(48))}`
  };
}

/**
 * Build an HS256-shaped JWT. The signature is random (not cryptographically
 * valid) — this is bait, not a usable credential.
 */
export function generateJwt(
  { issuer = "canary-ctg", audience = "internal-api", subject = "svc-deploy" } = {},
  canaryId
) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: issuer,
    aud: audience,
    sub: subject,
    iat: now,
    nbf: now,
    exp: now + 60 * 60 * 24 * 365,
    jti: canaryId,
    scope: "read:configs write:deployments",
    canary: true
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  return `${signingInput}.${base64Url(randomBytes(32))}`;
}

/** PostgreSQL-style connection string with the canary id baked in. */
export function generateDatabaseString(canaryId, { host = "db-prod-01.internal", database = "app_production" } = {}) {
  return `postgresql://svc_${randomString(8).toLowerCase()}:${randomString(24)}@${host}:5432/${database}?sslmode=require&application_name=${canaryId}`;
}

/* ============================================================================
 * Beacon construction + delivery
 * ========================================================================== */

/** Append canary metadata to the user's endpoint to form the tracking URL. */
export function buildBeaconUrl(endpoint, token) {
  const url = new URL(endpoint);
  url.searchParams.set("ct", token.id);
  url.searchParams.set("label", token.label || "canary");
  url.searchParams.set("type", token.type);
  url.searchParams.set("src", "canary-token-generator");
  if (token.meta?.channel) url.searchParams.set("channel", token.meta.channel);
  return url.toString();
}

/** Assemble the JSON body sent on POST delivery. */
export function buildPayload(token, { test = false } = {}) {
  let custom = {};
  if (token.customPayload && typeof token.customPayload === "object") {
    custom = token.customPayload;
  }
  return {
    event: test ? "canary.test" : "canary.triggered",
    canaryId: token.id,
    label: token.label,
    type: token.type,
    source: "canary-token-generator",
    triggeredAt: new Date().toISOString(),
    page: typeof location !== "undefined" ? location.href : undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    ...custom
  };
}

/**
 * Fire the beacon at the token's endpoint.
 *
 * GET  → fetched as a tracking pixel (no-cors, opaque response).
 * POST → attempts a CORS request; if the provider blocks it we retry with a
 *        no-cors POST so the request is still delivered, then report the
 *        limitation rather than hiding it.
 *
 * @returns {Promise<{ok: boolean, method: string, url: string, note: string, status?: number}>}
 */
export async function sendBeacon(token, { test = false } = {}) {
  const url = buildBeaconUrl(token.endpoint, token);
  const payload = buildPayload(token, { test });

  if (token.mode === "GET") {
    try {
      await fetch(`${url}&_=${Date.now()}`, { method: "GET", mode: "no-cors", cache: "no-store" });
      return {
        ok: true,
        method: "GET",
        url,
        note: "Pixel request dispatched. GET responses are opaque (no-cors), so success is assumed."
      };
    } catch {
      return new Promise((resolve) => {
        const image = new Image();
        const done = (note) => resolve({ ok: true, method: "Image GET", url, note });
        image.onload = () => done("Pixel loaded — the endpoint responded.");
        image.onerror = () => done("Pixel dispatched (response not readable from a cross-origin request).");
        image.src = `${url}&_=${Date.now()}`;
        window.setTimeout(() => done("Pixel dispatched."), 2500);
      });
    }
  }

  try {
    const response = await fetch(token.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    return {
      ok: response.ok,
      method: "POST",
      url,
      status: response.status,
      note: response.ok ? `Delivered (HTTP ${response.status}).` : `Endpoint returned HTTP ${response.status}.`
    };
  } catch {
    try {
      await fetch(token.endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload),
        cache: "no-store"
      });
      return {
        ok: true,
        method: "POST (no-cors)",
        url,
        note: "Cross-origin response was blocked, so the request was re-sent as no-cors. Some providers (Discord/Slack) require a serverless proxy."
      };
    } catch {
      return {
        ok: false,
        method: "POST",
        url,
        note: "Delivery failed. Verify the endpoint URL, that it accepts POST, and its CORS policy."
      };
    }
  }
}

/* ============================================================================
 * Deployment snippets
 * ========================================================================== */

export function buildSnippets(token) {
  const beacon = token.beaconUrl;
  return {
    html: `<img src="${beacon}" width="1" height="1" alt="" style="display:none" />`,
    markdown: `![.](${beacon})`,
    curl: `curl -s -o /dev/null "${beacon}"`
  };
}

/* ============================================================================
 * Token generation (dispatcher)
 * ========================================================================== */

/**
 * Create a token object from a validated configurator payload.
 *
 * @param {Object} config
 * @param {string} config.type            One of TOKEN_TYPES.
 * @param {string} config.label           Display label.
 * @param {string} [config.notes]
 * @param {string} config.endpoint        Webhook / listener URL.
 * @param {'GET'|'POST'} [config.mode]
 * @param {string} [config.customPayload] Raw JSON string.
 * @param {Object} [config.meta]          Type-specific options.
 * @returns {CanaryToken}
 */
export function generateToken(config) {
  const id = generateCanaryId();
  const mode = config.type === "web-bug" ? (config.mode ?? "GET") : (config.mode ?? "POST");
  const token = {
    id,
    type: config.type,
    label: config.label?.trim() || TOKEN_TYPES[config.type]?.name || "Canary",
    notes: config.notes?.trim() || "",
    endpoint: config.endpoint,
    mode,
    customPayload: parseCustomPayload(config.customPayload),
    meta: { ...(config.meta ?? {}) },
    createdAt: new Date().toISOString(),
    artifacts: []
  };

  token.beaconUrl = buildBeaconUrl(token.endpoint, token);

  switch (config.type) {
    case "web-bug":
      token.artifacts = buildWebBugArtifacts(token);
      break;
    case "pdf":
      token.artifacts = [{ key: "beacon", label: "Tracking URL", value: token.beaconUrl, language: "text" }];
      break;
    case "credentials":
      token.artifacts = buildCredentialArtifacts(token);
      break;
    case "env-file":
      token.artifacts = buildEnvArtifacts(token);
      break;
    default:
      token.artifacts = [{ key: "beacon", label: "Tracking URL", value: token.beaconUrl, language: "text" }];
  }

  return token;
}

function parseCustomPayload(raw) {
  if (!raw || !String(raw).trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildWebBugArtifacts(token) {
  const snippets = buildSnippets(token);
  return [
    { key: "beacon", label: "Tracking URL", value: token.beaconUrl, language: "text" },
    { key: "html", label: "HTML image tag", value: snippets.html, language: "html" },
    { key: "markdown", label: "Markdown image", value: snippets.markdown, language: "markdown" },
    { key: "curl", label: "cURL test", value: snippets.curl, language: "bash" }
  ];
}

function buildCredentialArtifacts(token) {
  const credentialType = token.meta.credentialType ?? "aws";

  if (credentialType === "jwt") {
    const jwt = generateJwt({ issuer: token.meta.issuer, subject: token.meta.subject }, token.id);
    return [{ key: "jwt", label: "JSON Web Token", value: jwt, language: "text" }];
  }

  if (credentialType === "database") {
    const dsn = generateDatabaseString(token.id, { host: token.meta.host || "db-prod-01.internal" });
    return [{ key: "dsn", label: "Connection string", value: dsn, language: "text" }];
  }

  const { accessKeyId, secretAccessKey, sessionToken } = generateAwsKeyPair();
  return [
    {
      key: "aws",
      label: "AWS credentials block",
      language: "ini",
      value: `[default]\naws_access_key_id = ${accessKeyId}\naws_secret_access_key = ${secretAccessKey}\naws_session_token = ${sessionToken}\nregion = us-east-1`
    },
    { key: "access-key-id", label: "Access key id", value: accessKeyId, language: "text" },
    { key: "secret", label: "Secret access key", value: secretAccessKey, language: "text" }
  ];
}

function buildEnvArtifacts(token) {
  const preset = token.meta.envPreset ?? "dotenv";
  const { accessKeyId, secretAccessKey } = generateAwsKeyPair();
  const beacon = token.beaconUrl;
  const filename = ENV_PRESETS[preset]?.filename ?? ".env";

  if (preset === "aws") {
    const value = `[default]\naws_access_key_id = ${accessKeyId}\naws_secret_access_key = ${secretAccessKey}\nregion = us-east-1\noutput = json\n# telemetry endpoint\nendpoint_url = ${beacon}\n`;
    return [{ key: "file", label: `credentials (${filename})`, value, language: "ini", kind: "file", filename }];
  }

  if (preset === "ssh") {
    const value = [
      "Host bastion-prod",
      "  HostName 10.0.4.12",
      "  User deploy",
      "  IdentityFile ~/.ssh/id_ed25519",
      "  # health check callback",
      `  RemoteCommand curl -s ${beacon}`,
      "",
      "Host *",
      "  ServerAliveInterval 60",
      "  StrictHostKeyChecking accept-new"
    ].join("\n");
    return [{ key: "file", label: `ssh config (${filename})`, value, language: "bash", kind: "file", filename }];
  }

  const value = [
    "NODE_ENV=production",
    "APP_NAME=internal-api",
    `APP_KEY=${randomString(48)}`,
    `DATABASE_URL=${generateDatabaseString(token.id)}`,
    `AWS_ACCESS_KEY_ID=${accessKeyId}`,
    `AWS_SECRET_ACCESS_KEY=${secretAccessKey}`,
    `STRIPE_SECRET_KEY=sk_live_${randomString(32)}`,
    `SENTRY_DSN=https://${randomString(32)}@sentry.internal/42`,
    `INTERNAL_WEBHOOK_URL=${beacon}`,
    `HEALTHCHECK_URL=${beacon}`,
    ""
  ].join("\n");
  return [{ key: "file", label: `.env (${filename})`, value, language: "bash", kind: "file", filename }];
}

/** Map a token type accent to a concrete badge class (used by views). */
export function badgeClassFor(accent) {
  const map = {
    cyan: "badge-cyan",
    amber: "badge-amber",
    emerald: "badge-emerald",
    violet: "badge-violet",
    rose: "badge-rose"
  };
  return map[accent] ?? "";
}
