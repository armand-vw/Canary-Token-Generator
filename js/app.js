/**
 * app.js — application entry point
 * ----------------------------------------------------------------------------
 * Owns view routing, the configurator workflow, the token dashboard and the
 * docs view. State is intentionally minimal: a current view string plus the
 * currently-open token. Persistence is delegated to store.js.
 */

import * as store from "./store.js";
import {
  TOKEN_TYPES,
  CREDENTIAL_TYPES,
  ENV_PRESETS,
  PDF_PRESETS,
  generateToken,
  sendBeacon,
  badgeClassFor
} from "./tokenEngine.js";
import { generatePdf } from "./pdfGenerator.js";
import { buildDeploymentKit, deploymentKitFilename } from "./kitBuilder.js";
import { renderDocs } from "./templates.js";
import {
  $,
  $$,
  escapeHtml,
  refreshIcons,
  toast,
  copyText,
  bindCopyButtons,
  initDrawer,
  setDrawerCloseHandler,
  openDrawer,
  closeDrawer,
  validateUrl,
  isValidJson,
  downloadBlob,
  downloadJson,
  formatRelative,
  formatDate,
  formatBytes,
  confirmDialog,
  debounce
} from "./ui.js";

/* ============================================================================
 * View metadata
 * ========================================================================== */

const VIEWS = {
  generate: { title: "Generate Tokens", subtitle: "Pick a decoy type to configure and deploy" },
  tokens: { title: "My Active Tokens", subtitle: "Tokens generated in this browser" },
  docs: { title: "Docs / How It Works", subtitle: "Deployment, webhooks and responsible use" }
};

const ACCENTS = {
  cyan: { chip: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300", ring: "hover:border-cyan-400/60" },
  violet: { chip: "border-violet-500/30 bg-violet-500/10 text-violet-300", ring: "hover:border-violet-400/60" },
  amber: { chip: "border-amber-500/30 bg-amber-500/10 text-amber-300", ring: "hover:border-amber-400/60" },
  emerald: { chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", ring: "hover:border-emerald-400/60" },
  rose: { chip: "border-rose-500/30 bg-rose-500/10 text-rose-300", ring: "hover:border-rose-400/60" }
};

const state = {
  view: "generate",
  query: "",
  filter: "",
  currentToken: null
};

/* ============================================================================
 * View routing
 * ========================================================================== */

function switchView(view, { scroll = true } = {}) {
  if (!VIEWS[view]) view = "generate";
  state.view = view;

  $$("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.viewPanel !== view);
    if (panel.dataset.viewPanel === view) panel.classList.add("animate-fade-in");
  });

  $$("#sidebar-nav .nav-item").forEach((item) => {
    if (item.dataset.view === view) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  $("#view-title").textContent = VIEWS[view].title;
  $("#view-subtitle").textContent = VIEWS[view].subtitle;

  if (view === "tokens") renderDashboard();

  if (location.hash !== `#${view}`) {
    history.replaceState(null, "", `#${view}`);
  }
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  closeSidebar();
}

/* ============================================================================
 * Mobile sidebar
 * ========================================================================== */

function openSidebar() {
  $("#sidebar")?.classList.remove("-translate-x-full");
  $("#sidebar-backdrop")?.classList.remove("hidden");
}

function closeSidebar() {
  $("#sidebar")?.classList.add("-translate-x-full");
  $("#sidebar-backdrop")?.classList.add("hidden");
}

/* ============================================================================
 * Generate view — token type cards
 * ========================================================================== */

function renderTokenCards() {
  const grid = $("#token-type-grid");
  if (!grid) return;

  grid.innerHTML = Object.values(TOKEN_TYPES)
    .map((type) => {
      const accent = ACCENTS[type.accent] ?? ACCENTS.cyan;
      return `
        <button
          type="button"
          class="group flex h-full flex-col items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-left transition ${accent.ring} hover:bg-slate-900"
          data-token-type="${type.id}"
        >
          <span class="rounded-xl border ${accent.chip} p-2.5">
            <i data-lucide="${type.icon}" class="h-5 w-5"></i>
          </span>
          <span class="text-sm font-semibold text-slate-100">${escapeHtml(type.name)}</span>
          <span class="text-xs leading-relaxed text-slate-400">${escapeHtml(type.description)}</span>
          <span class="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-medium text-cyan-400 opacity-0 transition group-hover:opacity-100">
            Configure <i data-lucide="arrow-right" class="h-3.5 w-3.5"></i>
          </span>
        </button>`;
    })
    .join("");

  grid.querySelectorAll("[data-token-type]").forEach((card) => {
    card.addEventListener("click", () => openConfigurator(card.dataset.tokenType));
  });

  refreshIcons();
}

/* ============================================================================
 * Configurator drawer
 * ========================================================================== */

function openConfigurator(type) {
  const meta = TOKEN_TYPES[type];
  if (!meta) return;

  state.currentToken = null;
  const accent = ACCENTS[meta.accent] ?? ACCENTS.cyan;

  $("#drawer-icon").className = `rounded-xl border p-2 ${accent.chip}`;
  $("#drawer-icon").innerHTML = `<i data-lucide="${meta.icon}" class="h-5 w-5"></i>`;
  $("#drawer-title").textContent = meta.name;
  $("#drawer-subtitle").textContent = "Configure the decoy, then generate and deploy it.";
  $("#drawer-body").innerHTML = configuratorForm(type);
  $("#drawer-footer").innerHTML = `
    <div class="flex items-center justify-between gap-3">
      <button type="button" id="drawer-cancel" class="btn-secondary">Cancel</button>
      <button type="submit" form="configurator-form" class="btn-primary">
        <i data-lucide="sparkles" class="h-4 w-4"></i> Generate token
      </button>
    </div>`;

  bindConfiguratorForm(type);
  refreshIcons();
  openDrawer();
}

function configuratorForm(type) {
  const supportsPayload = TOKEN_TYPES[type]?.supportsCustomPayload;
  const defaultMode = type === "web-bug" || type === "pdf" || type === "env-file" ? "GET" : "POST";

  return `
    <form id="configurator-form" novalidate class="space-y-5" data-type="${type}">
      <input type="hidden" name="type" value="${type}" />

      <div>
        <label class="field-label" for="field-label">Label <span class="text-rose-400">*</span></label>
        <input class="input" id="field-label" name="label" type="text" maxlength="80"
          placeholder="e.g. Payroll Q3 draft" autocomplete="off" required />
        <p class="field-hint">Appears in every alert so you know which trap fired.</p>
      </div>

      <div>
        <label class="field-label" for="field-endpoint">Webhook / listener URL <span class="text-rose-400">*</span></label>
        <input class="input" id="field-endpoint" name="endpoint" type="url" inputmode="url"
          placeholder="https://webhook.site/your-unique-id" autocomplete="off" required />
        <p class="field-hint">Where alerts are delivered. Works with Webhook.site or your own serverless endpoint.</p>
      </div>

      ${typeSpecificFields(type)}

      <div>
        <label class="field-label" for="field-mode">Delivery method</label>
        <select class="input" id="field-mode" name="mode">
          <option value="GET" ${defaultMode === "GET" ? "selected" : ""}>GET — tracking pixel / link (CORS-safe)</option>
          <option value="POST" ${defaultMode === "POST" ? "selected" : ""}>POST — JSON payload to webhook</option>
        </select>
      </div>

      ${
        supportsPayload
          ? `<div>
              <label class="field-label" for="field-custom">Custom payload (optional)</label>
              <textarea class="input" id="field-custom" name="customPayload" rows="3"
                placeholder='{"severity":"high","env":"prod"}' spellcheck="false"></textarea>
              <p class="field-hint">Extra JSON merged into the POST body. Ignored for GET tokens.</p>
            </div>`
          : ""
      }

      <div>
        <label class="field-label" for="field-notes">Notes (optional)</label>
        <input class="input" id="field-notes" name="notes" type="text" maxlength="160"
          placeholder="Where you plan to plant this" autocomplete="off" />
      </div>

      <div id="form-errors" class="hidden rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"></div>
    </form>`;
}

function typeSpecificFields(type) {
  if (type === "qr") {
    return `
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="field-label" for="field-qr-size">QR size</label>
          <select class="input" id="field-qr-size" name="qrSize">
            <option value="256">Small — 256 px</option>
            <option value="512" selected>Medium — 512 px</option>
            <option value="1024">Large — 1024 px</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="field-qr-filename">Filename (optional)</label>
          <input class="input" id="field-qr-filename" name="qrFilename" type="text"
            placeholder="canary-qr.svg" autocomplete="off" />
        </div>
      </div>
      <p class="field-hint">The QR encodes your tracking URL, so scanning it fires the beacon.</p>`;
  }

  if (type === "pdf") {
    return `
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="field-label" for="field-pdf-preset">Document template</label>
          <select class="input" id="field-pdf-preset" name="pdfPreset">
            ${Object.values(PDF_PRESETS)
              .map((preset) => `<option value="${preset.id}">${escapeHtml(preset.name)}</option>`)
              .join("")}
          </select>
        </div>
        <div>
          <label class="field-label" for="field-pdf-filename">Filename (optional)</label>
          <input class="input" id="field-pdf-filename" name="pdfFilename" type="text"
            placeholder="invoice-q3.pdf" autocomplete="off" />
        </div>
      </div>
      <div>
        <label class="field-label" for="field-pdf-title">Document title (optional)</label>
        <input class="input" id="field-pdf-title" name="pdfTitle" type="text"
          placeholder="Override the internal PDF title" autocomplete="off" />
      </div>`;
  }

  if (type === "credentials") {
    return `
      <div>
        <label class="field-label" for="field-cred-type">Credential format</label>
        <select class="input" id="field-cred-type" name="credentialType">
          ${Object.values(CREDENTIAL_TYPES)
            .map((cred) => `<option value="${cred.id}">${escapeHtml(cred.name)} — ${escapeHtml(cred.hint)}</option>`)
            .join("")}
        </select>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="field-label" for="field-jwt-issuer">JWT issuer (optional)</label>
          <input class="input" id="field-jwt-issuer" name="jwtIssuer" type="text" placeholder="canary-ctg" autocomplete="off" />
        </div>
        <div>
          <label class="field-label" for="field-jwt-subject">JWT subject (optional)</label>
          <input class="input" id="field-jwt-subject" name="jwtSubject" type="text" placeholder="svc-deploy" autocomplete="off" />
        </div>
      </div>
      <div>
        <label class="field-label" for="field-db-host">Database host (optional)</label>
        <input class="input" id="field-db-host" name="dbHost" type="text" placeholder="db-prod-01.internal" autocomplete="off" />
        <p class="field-hint">Only used by the database connection-string format.</p>
      </div>`;
  }

  if (type === "env-file") {
    return `
      <div>
        <label class="field-label" for="field-env-preset">File preset</label>
        <select class="input" id="field-env-preset" name="envPreset">
          ${Object.values(ENV_PRESETS)
            .map((preset) => `<option value="${preset.id}">${escapeHtml(preset.name)}</option>`)
            .join("")}
        </select>
        <p class="field-hint">A hidden tracking endpoint is embedded in the generated file.</p>
      </div>`;
  }

  if (type === "web-bug") {
    return `
      <div>
        <label class="field-label" for="field-channel">Channel label (optional)</label>
        <input class="input" id="field-channel" name="channel" type="text" maxlength="40"
          placeholder="e.g. email-signature" autocomplete="off" />
        <p class="field-hint">Adds a <code class="text-slate-500">channel</code> parameter to help triage alerts.</p>
      </div>`;
  }

  return "";
}

function bindConfiguratorForm(type) {
  const form = $("#configurator-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleGenerate(type, form);
  });

  $("#drawer-cancel")?.addEventListener("click", () => {
    closeDrawer();
    setDrawerCloseHandler(null);
  });
}

function showFormErrors(errors) {
  const box = $("#form-errors");
  if (!box) return;
  if (!errors.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `<ul class="list-disc space-y-1 pl-4">${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`;
  box.classList.remove("hidden");
}

function collectFormValue(form, name) {
  const field = form.elements.namedItem(name);
  return field ? String(field.value ?? "").trim() : "";
}

async function handleGenerate(type, form) {
  const errors = [];
  const label = collectFormValue(form, "label");
  const endpoint = collectFormValue(form, "endpoint");
  const mode = collectFormValue(form, "mode") || "GET";
  const notes = collectFormValue(form, "notes");
  const customPayload = collectFormValue(form, "customPayload");

  if (!label) errors.push("A label is required.");

  const urlCheck = validateUrl(endpoint);
  if (!urlCheck.ok) errors.push(urlCheck.message);

  if (customPayload && !isValidJson(customPayload)) {
    errors.push("Custom payload must be valid JSON.");
  }

  const endpointField = $("#field-endpoint");
  endpointField?.setAttribute("aria-invalid", urlCheck.ok ? "false" : "true");
  showFormErrors(errors);

  if (errors.length) {
    if (!urlCheck.ok) endpointField?.focus();
    else $("#field-label")?.focus();
    return;
  }

  const meta = {};
  if (type === "pdf") {
    meta.preset = collectFormValue(form, "pdfPreset") || "invoice";
    meta.title = collectFormValue(form, "pdfTitle");
    meta.filename = collectFormValue(form, "pdfFilename");
  } else if (type === "qr") {
    meta.qrSize = Number(collectFormValue(form, "qrSize")) || 512;
    meta.filename = collectFormValue(form, "qrFilename");
  } else if (type === "credentials") {
    meta.credentialType = collectFormValue(form, "credentialType") || "aws";
    meta.issuer = collectFormValue(form, "jwtIssuer");
    meta.subject = collectFormValue(form, "jwtSubject");
    meta.host = collectFormValue(form, "dbHost");
  } else if (type === "env-file") {
    meta.envPreset = collectFormValue(form, "envPreset") || "dotenv";
  } else if (type === "web-bug") {
    meta.channel = collectFormValue(form, "channel");
  }

  const submitButton = form.querySelector("button[type='submit']");
  const submitLabel = submitButton?.innerHTML;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = `<i data-lucide="loader-2" class="h-4 w-4 spinner"></i> Generating…`;
    refreshIcons();
  }

  let token;
  try {
    token = await generateToken({ type, label, endpoint, mode, notes, customPayload, meta });
  } catch (error) {
    console.error("[app] Token generation failed", error);
    toast("Something went wrong generating that token.", { type: "error" });
    if (submitButton) {
      submitButton.disabled = false;
      if (submitLabel) submitButton.innerHTML = submitLabel;
      refreshIcons();
    }
    return;
  }

  const saved = store.addToken(token);
  state.currentToken = token;
  if (!saved) {
    toast("Token generated, but it couldn't be saved to local storage.", { type: "warning" });
  }

  renderResult(token);
}

/* ============================================================================
 * Result panel
 * ========================================================================== */

function renderResult(token) {
  const type = TOKEN_TYPES[token.type];

  const artifacts = token.artifacts.map((artifact, index) => artifactMarkup(artifact, index)).join("");

  $("#drawer-body").innerHTML = `
    <div class="animate-fade-in space-y-5">
      <div class="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <i data-lucide="check-circle-2" class="mt-0.5 h-5 w-5 shrink-0 text-emerald-300"></i>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-emerald-200">Token generated &amp; saved</p>
          <p class="mt-0.5 text-xs leading-relaxed text-emerald-200/80">
            ${escapeHtml(type?.name ?? token.type)} — “${escapeHtml(token.label)}”. Find it later under
            <button type="button" class="underline underline-offset-2 hover:text-emerald-100" id="result-view-tokens">My Active Tokens</button>.
          </p>
        </div>
      </div>

      <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="badge ${badgeClassFor(type?.accent)}"><i data-lucide="fingerprint" class="h-3 w-3"></i>${escapeHtml(type?.tagline ?? "")}</span>
          <span class="badge">${escapeHtml(token.mode)}</span>
          <span class="badge">${escapeHtml(new Date(token.createdAt).toISOString().slice(0, 10))}</span>
        </div>
        <p class="mt-3 text-xs text-slate-500">Canary ID</p>
        <div class="mt-1 flex items-center gap-2">
          <code class="flex-1 break-all text-sm text-cyan-300">${escapeHtml(token.id)}</code>
          <button type="button" class="btn-secondary copy-btn shrink-0 px-2 py-1" data-copy="${escapeHtml(token.id)}" aria-label="Copy canary id">
            <i data-lucide="copy" class="h-4 w-4"></i>
          </button>
        </div>
      </div>

      <div class="space-y-4">${artifacts}</div>

      <div id="file-actions" class="space-y-3">${fileActionsMarkup(token)}</div>

      <div id="beacon-status" class="hidden rounded-xl border p-3 text-xs"></div>

      <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p class="flex items-center gap-2 text-sm font-medium text-slate-200">
          <i data-lucide="map-pin" class="h-4 w-4 text-cyan-400"></i> Deployment
        </p>
        <p class="mt-1.5 text-xs leading-relaxed text-slate-400">${escapeHtml(deployHint(token.type))}</p>
        <p class="mt-2 text-xs leading-relaxed text-slate-500">
          ${type?.id === "pdf" ? "Note: modern PDF viewers block silent remote fetches — the alert fires when the embedded link is clicked." : "Nothing should ever hit this token during normal operation. A beacon means unauthorized access."}
        </p>
      </div>
    </div>`;

  $("#drawer-footer").innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <button type="button" id="result-back" class="btn-secondary">
        <i data-lucide="arrow-left" class="h-4 w-4"></i> New token
      </button>
      <div class="flex gap-2">
        <button type="button" id="test-beacon" class="btn-secondary">
          <i data-lucide="send" class="h-4 w-4"></i> Send test beacon
        </button>
        <button type="button" id="result-done" class="btn-primary">
          <i data-lucide="layout-dashboard" class="h-4 w-4"></i> View dashboard
        </button>
      </div>
    </div>`;

  bindResultActions(token);
  refreshIcons();
}

function artifactMarkup(artifact, index) {
  if (artifact.kind === "image") {
    return `
      <div>
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <label class="field-label mb-0">${escapeHtml(artifact.label)}</label>
          <button type="button" class="btn-secondary px-2 py-1 text-xs" data-download-image="${index}">
            <i data-lucide="download" class="h-3.5 w-3.5"></i> Download SVG
          </button>
        </div>
        <div class="flex justify-center rounded-xl border border-slate-800 bg-white p-4">
          <div class="qr-preview h-48 w-48">${artifact.value}</div>
        </div>
      </div>`;
  }

  return `
    <div>
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <label class="field-label mb-0">${escapeHtml(artifact.label)}</label>
        <button type="button" class="btn-secondary copy-btn px-2 py-1 text-xs"
          data-copy="${escapeHtml(artifact.value)}" data-copied-label="${escapeHtml(artifact.label)} copied">
          <i data-lucide="copy" class="h-3.5 w-3.5"></i> Copy
        </button>
      </div>
      <div class="code-surface"><pre><code>${escapeHtml(artifact.value)}</code></pre></div>
      ${
        artifact.kind === "file"
          ? `<button type="button" class="btn-secondary mt-2" data-download-file="${index}">
               <i data-lucide="download" class="h-4 w-4"></i> Download ${escapeHtml(artifact.filename || "file")}
             </button>`
          : ""
      }
    </div>`;
}

function fileActionsMarkup(token) {
  if (token.type !== "pdf") return "";
  return `
    <button type="button" id="download-pdf" class="btn-primary w-full">
      <i data-lucide="file-down" class="h-4 w-4"></i> Generate &amp; download decoy PDF
    </button>`;
}

function deployHint(type) {
  switch (type) {
    case "web-bug":
      return "Paste the HTML/Markdown snippet into an email signature, CMS draft, wiki page or document. The pixel is invisible.";
    case "qr":
      return "Print the QR and attach it to a physical asset, add it to a slide, or embed it in a document. Any scan fires the beacon.";
    case "pdf":
      return "Place the PDF in a shared drive, attachment folder or repo where an intruder would look. Rename it to something tempting.";
    case "credentials":
      return "Plant the key material in config files, CI variables or a password vault entry. Detection relies on the key being used.";
    case "env-file":
      return "Leave the file where leaked secrets tend to surface — a repo, a backup, an unsecured share. Watch the tracking endpoint for hits.";
    default:
      return "Deploy this decoy where an intruder would be tempted to interact with it.";
  }
}

function bindResultActions(token) {
  bindCopyButtons($("#drawer-body"));

  $("#result-back")?.addEventListener("click", () => openConfigurator(token.type));
  $("#result-done")?.addEventListener("click", () => {
    closeDrawer();
    switchView("tokens");
  });
  $("#result-view-tokens")?.addEventListener("click", () => {
    closeDrawer();
    switchView("tokens");
  });

  $("#test-beacon")?.addEventListener("click", () => testBeacon(token));

  // Downloadable text files (env / credentials presets).
  $$("[data-download-file]", $("#drawer-body")).forEach((button) => {
    button.addEventListener("click", () => {
      const artifact = token.artifacts[Number(button.dataset.downloadFile)];
      if (!artifact) return;
      downloadBlob(new Blob([artifact.value], { type: "text/plain;charset=utf-8" }), artifact.filename || "canary.txt");
      toast(`Downloaded ${artifact.filename || "file"}`, { type: "success" });
    });
  });

  // Downloadable SVG images (QR canaries).
  $$("[data-download-image]", $("#drawer-body")).forEach((button) => {
    button.addEventListener("click", () => {
      const artifact = token.artifacts[Number(button.dataset.downloadImage)];
      if (!artifact) return;
      downloadBlob(
        new Blob([artifact.value], { type: "image/svg+xml;charset=utf-8" }),
        artifact.filename || "canary-qr.svg"
      );
      toast(`Downloaded ${artifact.filename || "QR code"}`, { type: "success" });
    });
  });

  // PDF generation (lazy-loads pdf-lib).
  $("#download-pdf")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-2" class="h-4 w-4 spinner"></i> Building PDF…`;
    refreshIcons();
    try {
      const { blob, filename, bytes } = await generatePdf(token);
      downloadBlob(blob, filename);
      toast(`Downloaded ${filename} (${formatBytes(bytes)})`, { type: "success" });
    } catch (error) {
      console.error("[app] PDF generation failed", error);
      toast("PDF generation failed. Check your connection and try again.", { type: "error" });
    } finally {
      button.disabled = false;
      button.innerHTML = original;
      refreshIcons();
    }
  });
}

async function testBeacon(token) {
  const status = $("#beacon-status");
  const button = $("#test-beacon");
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-2" class="h-4 w-4 spinner"></i> Sending…`;
    refreshIcons();
  }
  const result = await sendBeacon(token, { test: true });
  if (button) {
    button.disabled = false;
    button.innerHTML = `<i data-lucide="send" class="h-4 w-4"></i> Send test beacon`;
    refreshIcons();
  }

  if (status) {
    const tone = result.ok
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-rose-500/40 bg-rose-500/10 text-rose-200";
    status.className = `rounded-xl border p-3 text-xs ${tone}`;
    status.innerHTML = `<strong class="font-semibold">${escapeHtml(result.method)}</strong> — ${escapeHtml(result.note)}`;
    status.classList.remove("hidden");
  }
  toast(result.ok ? "Test beacon dispatched." : "Test beacon failed — see the panel.", {
    type: result.ok ? "success" : "error"
  });
}

/* ============================================================================
 * Dashboard — My Active Tokens
 * ========================================================================== */

function renderStats(tokens) {
  const container = $("#token-stats");
  if (!container) return;
  const summary = store.summarize(tokens);
  const cards = [
    { label: "Total tokens", value: summary.total, icon: "layers", tone: "text-cyan-300" },
    { label: "Web bugs", value: summary.byType["web-bug"] ?? 0, icon: "crosshair", tone: "text-cyan-300" },
    {
      label: "Documents & files",
      value: (summary.byType.pdf ?? 0) + (summary.byType["env-file"] ?? 0),
      icon: "file-stack",
      tone: "text-violet-300"
    },
    { label: "Credentials", value: summary.byType.credentials ?? 0, icon: "key-round", tone: "text-amber-300" }
  ];

  container.innerHTML = cards
    .map(
      (card) => `
      <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-wider text-slate-500">${card.label}</p>
          <i data-lucide="${card.icon}" class="h-4 w-4 ${card.tone}"></i>
        </div>
        <p class="mt-2 text-2xl font-semibold text-slate-100">${card.value}</p>
      </div>`
    )
    .join("");
}

function filteredTokens(tokens) {
  const query = state.query.trim().toLowerCase();
  return tokens.filter((token) => {
    if (state.filter && token.type !== state.filter) return false;
    if (!query) return true;
    return [token.label, token.id, token.type, token.endpoint, token.notes]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(query));
  });
}

function renderDashboard() {
  const all = store.readAll();
  renderStats(all);

  const list = $("#token-list");
  if (!list) return;

  const tokens = filteredTokens(all);
  if (!tokens.length) {
    list.innerHTML = `
      <div class="flex flex-col items-center gap-3 p-10 text-center">
        <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
          <i data-lucide="radar" class="h-6 w-6 text-slate-500"></i>
        </div>
        <p class="text-sm font-medium text-slate-300">
          ${all.length ? "No tokens match your filters." : "No tokens yet."}
        </p>
        <p class="max-w-sm text-xs text-slate-500">
          ${
            all.length
              ? "Try clearing the search or type filter."
              : "Generate your first decoy from the Generate Tokens tab — it will appear here."
          }
        </p>
        ${
          all.length
            ? ""
            : `<button type="button" class="btn-primary mt-1" id="empty-generate">
                 <i data-lucide="plus" class="h-4 w-4"></i> Generate a token
               </button>`
        }
      </div>`;
    $("#empty-generate")?.addEventListener("click", () => switchView("generate"));
    refreshIcons();
    return;
  }

  list.innerHTML = tokens.map(tokenRowMarkup).join("");
  list.querySelectorAll("[data-token-id]").forEach((row) => {
    const id = row.dataset.tokenId;
    row.querySelector("[data-row-copy]")?.addEventListener("click", async () => {
      const ok = await copyText(row.dataset.copyValue);
      toast(ok ? "Tracking URL copied." : "Clipboard unavailable.", { type: ok ? "success" : "error" });
    });
    row.querySelector("[data-row-delete]")?.addEventListener("click", async () => {
      const confirmed = await confirmDialog({
        title: "Delete this token?",
        message: `“${row.dataset.label}” will be removed from this browser. Deployed copies will keep pointing at the same URL.`,
        confirmText: "Delete"
      });
      if (confirmed) {
        store.removeToken(id);
        toast("Token deleted.", { type: "success" });
      }
    });
  });
  refreshIcons();
}

function tokenRowMarkup(token) {
  const type = TOKEN_TYPES[token.type];
  const accent = ACCENTS[type?.accent] ?? ACCENTS.cyan;
  let host = token.endpoint;
  try {
    host = new URL(token.endpoint).host;
  } catch {
    /* keep raw endpoint */
  }

  return `
    <div class="flex flex-col gap-3 p-4 transition hover:bg-slate-900/40 lg:flex-row lg:items-center"
      data-token-id="${escapeHtml(token.id)}"
      data-label="${escapeHtml(token.label)}"
      data-copy-value="${escapeHtml(token.beaconUrl)}">
      <div class="flex min-w-0 flex-1 items-start gap-3">
        <span class="rounded-lg border ${accent.chip} p-2">
          <i data-lucide="${type?.icon ?? "shield"}" class="h-4 w-4"></i>
        </span>
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-slate-100">${escapeHtml(token.label)}</p>
          <p class="mt-0.5 truncate font-mono text-xs text-slate-500">${escapeHtml(token.id)}</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="badge ${badgeClassFor(type?.accent)}">${escapeHtml(type?.name ?? token.type)}</span>
        <span class="badge">${escapeHtml(token.mode)}</span>
        <span class="badge" title="${escapeHtml(token.endpoint)}">
          <i data-lucide="globe" class="h-3 w-3"></i>${escapeHtml(host)}
        </span>
        <span class="text-slate-500" title="${escapeHtml(formatDate(token.createdAt))}">${escapeHtml(formatRelative(token.createdAt))}</span>
      </div>

      <div class="flex items-center gap-2 lg:justify-end">
        <button type="button" class="btn-secondary px-2 py-1.5" data-row-copy aria-label="Copy tracking URL">
          <i data-lucide="copy" class="h-4 w-4"></i>
          <span class="hidden sm:inline">Copy URL</span>
        </button>
        <button type="button" class="btn-danger px-2 py-1.5" data-row-delete aria-label="Delete token">
          <i data-lucide="trash-2" class="h-4 w-4"></i>
        </button>
      </div>
    </div>`;
}

function updateTokenCount(tokens) {
  const badge = $("#nav-token-count");
  if (!badge) return;
  if (tokens.length) {
    badge.textContent = String(tokens.length);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

/* ============================================================================
 * Export / import / clear
 * ========================================================================== */

async function handleBuildKit() {
  const tokens = store.readAll();
  if (!tokens.length) {
    toast("Generate at least one token before building a kit.", { type: "warning" });
    return;
  }

  const hasPdf = tokens.some((token) => token.type === "pdf");
  const confirmed = await confirmDialog({
    title: "Build deployment kit?",
    message: `Packages ${tokens.length} token(s) into a ZIP with snippets, decoy files${
      hasPdf ? ", generated PDFs" : ""
    } and a deployment guide.${hasPdf ? " Generating PDFs may take a moment." : ""}`,
    confirmText: "Build kit"
  });
  if (!confirmed) return;

  const button = $("#build-kit");
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-2" class="h-4 w-4 spinner"></i> Zipping…`;
    refreshIcons();
  }

  try {
    const result = await buildDeploymentKit(tokens, store.exportPayload(), { includePdfs: true });
    downloadBlob(result.blob, deploymentKitFilename());
    toast(`Deployment kit ready — ${result.fileCount} files (${formatBytes(result.bytes)}).`, {
      type: result.warnings.length ? "warning" : "success",
      title: result.warnings.length ? result.warnings[0] : undefined
    });
  } catch (error) {
    console.error("[app] Deployment kit build failed", error);
    toast("Could not build the deployment kit.", { type: "error" });
  } finally {
    if (button) {
      button.disabled = false;
      if (original) button.innerHTML = original;
      refreshIcons();
    }
  }
}

function handleExport() {
  const payload = store.exportPayload();
  if (!payload.count) {
    toast("No tokens to export yet.", { type: "warning" });
    return;
  }
  downloadJson(payload, `canary-tokens-${new Date().toISOString().slice(0, 10)}.json`);
  toast(`Exported ${payload.count} token${payload.count === 1 ? "" : "s"}.`, { type: "success" });
}

async function handleImport(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const result = store.importPayload(text);
    if (result.error) {
      toast(result.error, { type: "error" });
    } else {
      toast(`Imported ${result.added} token(s).`, {
        type: result.added ? "success" : "info",
        title:
          result.duplicates || result.skipped
            ? `${result.duplicates} duplicate(s), ${result.skipped} skipped`
            : undefined
      });
    }
  } catch (error) {
    console.error("[app] Import failed", error);
    toast("Could not read that file.", { type: "error" });
  } finally {
    input.value = "";
  }
}

async function handleClear() {
  const count = store.readAll().length;
  if (!count) {
    toast("There's nothing to clear.", { type: "info" });
    return;
  }
  const confirmed = await confirmDialog({
    title: "Clear all tokens?",
    message: `This removes all ${count} token record(s) from this browser. Deployed tokens keep working — you just lose the local register. Export first if you want a backup.`,
    confirmText: "Clear all"
  });
  if (confirmed) {
    store.clearTokens();
    toast("All tokens cleared.", { type: "success" });
  }
}

function populateFilterOptions() {
  const select = $("#token-filter");
  if (!select || select.dataset.populated === "true") return;
  Object.values(TOKEN_TYPES).forEach((type) => {
    const option = document.createElement("option");
    option.value = type.id;
    option.textContent = type.name;
    select.appendChild(option);
  });
  select.dataset.populated = "true";
}

/* ============================================================================
 * Docs
 * ========================================================================== */

function renderDocsView() {
  const container = $("#docs-content");
  if (container && !container.dataset.rendered) {
    container.innerHTML = renderDocs();
    container.dataset.rendered = "true";
  }
}

function openDocsSection(sectionId) {
  switchView("docs", { scroll: false });
  window.requestAnimationFrame(() => {
    const target = document.getElementById(sectionId);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/* ============================================================================
 * Bootstrap
 * ========================================================================== */

function init() {
  initDrawer();
  renderTokenCards();
  renderDocsView();
  populateFilterOptions();
  renderDashboard();

  // Navigation
  $$("#sidebar-nav .nav-item").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.view));
  });
  $("#sidebar-open")?.addEventListener("click", openSidebar);
  $("#sidebar-close")?.addEventListener("click", closeSidebar);
  $("#sidebar-backdrop")?.addEventListener("click", closeSidebar);

  // Quick actions
  $("#quick-refresh")?.addEventListener("click", () => {
    renderTokenCards();
    toast("Token types refreshed.", { type: "info", duration: 1800 });
  });

  // Dashboard controls
  $("#token-search")?.addEventListener(
    "input",
    debounce((event) => {
      state.query = event.target.value;
      renderDashboard();
    }, 150)
  );
  $("#token-filter")?.addEventListener("change", (event) => {
    state.filter = event.target.value;
    renderDashboard();
  });
  $("#export-tokens")?.addEventListener("click", handleExport);
  $("#build-kit")?.addEventListener("click", handleBuildKit);
  $("#import-tokens")?.addEventListener("change", handleImport);
  $("#clear-tokens")?.addEventListener("click", handleClear);

  // Docs deep links
  $$("[data-docs-link]").forEach((link) => {
    link.addEventListener("click", () => openDocsSection(link.dataset.docsLink));
  });

  // Keep the UI in sync with storage (including cross-tab? localStorage events
  // are not wired, but every mutation in this tab notifies subscribers).
  store.subscribe((tokens) => {
    updateTokenCount(tokens);
    if (state.view === "tokens") renderDashboard();
  });
  updateTokenCount(store.readAll());

  // Route from the URL hash when present.
  const initial = location.hash.replace("#", "");
  switchView(VIEWS[initial] ? initial : "generate", { scroll: false });

  // Redraw icons once the Lucide UMD bundle has definitely executed.
  window.addEventListener("load", refreshIcons);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
