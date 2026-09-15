/**
 * ui.js — presentation helpers: toasts, drawer, clipboard, formatting, downloads.
 */

const DRAWER_ANIM_MS = 300;

/** Escape a value for safe interpolation into an HTML template string. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Replace every data-lucide placeholder with its SVG; no-op if Lucide failed to load. */
export function refreshIcons() {
  const lucide = /** @type {any} */ (window).lucide;
  if (typeof lucide?.createIcons !== "function") return;
  try {
    lucide.createIcons({ attrs: { "stroke-width": 2 } });
  } catch {
    /* Icon hydration is non-critical; never let it break a render. */
  }
}

/**
 * Shorthand for querySelector.
 * @param {string} selector
 * @param {ParentNode} [scope]
 * @returns {any}
 */
export const $ = (selector, scope = document) => scope.querySelector(selector);

/**
 * Shorthand for querySelectorAll returning a real array.
 * @param {string} selector
 * @param {ParentNode} [scope]
 * @returns {any[]}
 */
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatRelative(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Validate a user-supplied endpoint URL.
 * @returns {{ok: boolean, message?: string, url?: URL}}
 */
export function validateUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: false, message: "A webhook / endpoint URL is required." };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: "That doesn't look like a valid URL." };
  }
  if (!/^https?:$/.test(url.protocol)) {
    return { ok: false, message: "Only http:// and https:// endpoints are supported." };
  }
  if (url.protocol === "http:" && !/^localhost$|^127\.0\.0\.1$/.test(url.hostname)) {
    return { ok: false, message: "Use https:// for non-local endpoints — http:// leaks alert traffic." };
  }
  return { ok: true, url };
}

export function isValidJson(value) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy text to the clipboard, falling back to a hidden textarea when the
 * async Clipboard API is unavailable (e.g. non-secure contexts).
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("clipboard-api-unavailable");
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Wire copy-to-clipboard onto any button carrying data-copy, with inline feedback. */
export function bindCopyButtons(scope = document) {
  $$("[data-copy]", scope).forEach((button) => {
    if (button.dataset.copyBound === "true") return;
    button.dataset.copyBound = "true";
    button.addEventListener("click", async () => {
      const text = button.getAttribute("data-copy") ?? "";
      const ok = await copyText(text);
      if (!ok) {
        toast("Couldn't access the clipboard. Select and copy manually.", { type: "error" });
        return;
      }
      button.classList.add("is-copied");
      const icon = $("[data-lucide]", button);
      const original = icon?.getAttribute("data-lucide");
      if (icon && original) {
        icon.setAttribute("data-lucide", "check");
        refreshIcons();
      }
      const label = button.getAttribute("data-copied-label");
      if (label) toast(label, { type: "success" });
      window.setTimeout(() => {
        button.classList.remove("is-copied");
        if (icon && original) {
          icon.setAttribute("data-lucide", original);
          refreshIcons();
        }
      }, 1400);
    });
  });
}

const TOAST_STYLES = {
  success: { border: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-200", icon: "check-circle" },
  error: { border: "border-rose-500/40", bg: "bg-rose-500/10", text: "text-rose-200", icon: "x-circle" },
  warning: { border: "border-amber-500/40", bg: "bg-amber-500/10", text: "text-amber-200", icon: "triangle-alert" },
  info: { border: "border-cyan-500/40", bg: "bg-cyan-500/10", text: "text-cyan-200", icon: "info" }
};

/**
 * Show a transient notification.
 * @param {string} message
 * @param {{type?: 'success'|'error'|'warning'|'info', title?: string, duration?: number}} [options]
 */
export function toast(message, options = {}) {
  const container = $("#toast-container");
  if (!container) return;
  const type = TOAST_STYLES[options.type] ? options.type : "info";
  const style = TOAST_STYLES[type];
  const duration = options.duration ?? 3600;

  const el = document.createElement("div");
  el.className = `pointer-events-auto flex items-start gap-3 rounded-xl border ${style.border} ${style.bg} p-3 shadow-lg backdrop-blur animate-toast-in`;
  el.innerHTML = `
    <i data-lucide="${style.icon}" class="mt-0.5 h-4 w-4 shrink-0 ${style.text}"></i>
    <div class="min-w-0 flex-1">
      ${options.title ? `<p class="text-sm font-semibold ${style.text}">${escapeHtml(options.title)}</p>` : ""}
      <p class="text-sm leading-snug ${style.text}">${escapeHtml(message)}</p>
    </div>
    <button type="button" class="icon-btn -m-1 p-1" aria-label="Dismiss notification">
      <i data-lucide="x" class="h-3.5 w-3.5"></i>
    </button>`;

  const dismiss = () => {
    el.style.transition = "opacity .18s ease, transform .18s ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    window.setTimeout(() => el.remove(), 190);
  };
  $("[aria-label='Dismiss notification']", el).addEventListener("click", dismiss);

  container.appendChild(el);
  refreshIcons();
  window.setTimeout(dismiss, duration);
}

/**
 * Promise-based confirmation dialog.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title = "Are you sure?", message = "", confirmText = "Confirm" } = {}) {
  const root = $("#confirm");
  const okButton = $("#confirm-ok");
  const cancelButton = $("#confirm-cancel");
  if (!root || !okButton || !cancelButton) return Promise.resolve(window.confirm(message || title));

  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  okButton.textContent = confirmText;

  root.classList.remove("hidden");
  root.classList.add("flex");
  okButton.focus();

  return new Promise((resolve) => {
    const cleanup = () => {
      root.classList.add("hidden");
      root.classList.remove("flex");
      okButton.removeEventListener("click", onOk);
      cancelButton.removeEventListener("click", onCancel);
      $("#confirm-backdrop")?.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKey);
    };
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") onCancel();
    };
    okButton.addEventListener("click", onOk);
    cancelButton.addEventListener("click", onCancel);
    $("#confirm-backdrop")?.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKey);
  });
}

let drawerCloseHandler = null;

export function setDrawerCloseHandler(handler) {
  drawerCloseHandler = handler;
}

export function openDrawer() {
  const root = $("#drawer");
  const panel = $("#drawer-panel");
  if (!root || !panel) return;
  root.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  // Next frame so the transform transition actually animates.
  requestAnimationFrame(() => {
    panel.classList.remove("translate-x-full");
  });
  window.setTimeout(() => $("#drawer-close")?.focus(), 60);
}

export function closeDrawer() {
  const root = $("#drawer");
  const panel = $("#drawer-panel");
  if (!root || !panel || root.classList.contains("hidden")) return;
  panel.classList.add("translate-x-full");
  window.setTimeout(() => {
    root.classList.add("hidden");
    document.body.style.overflow = "";
  }, DRAWER_ANIM_MS);
}

export function initDrawer() {
  $("#drawer-close")?.addEventListener("click", () => {
    closeDrawer();
    drawerCloseHandler?.();
  });
  $("#drawer-backdrop")?.addEventListener("click", () => {
    closeDrawer();
    drawerCloseHandler?.();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#drawer")?.classList.contains("hidden")) {
      closeDrawer();
      drawerCloseHandler?.();
    }
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has time to start.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(data, filename) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function truncate(text, max = 64) {
  const str = String(text ?? "");
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}
