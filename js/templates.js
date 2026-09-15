/**
 * templates.js — static documentation content
 * ----------------------------------------------------------------------------
 * Kept apart from app.js so the Docs view is copy-editable without touching
 * application logic. Content is authored as trusted HTML strings (no user input
 * is ever interpolated here).
 */

export const DOCS_SECTIONS = [
  {
    id: "overview",
    html: `
      <h1>How Canary Tokens Work</h1>
      <p>
        A <strong>canary token</strong> is a piece of digital bait. It looks like something valuable — a tracking
        link, a document, an API key — but it has no legitimate purpose. An alarm is raised the moment it is
        accessed, because <em>nothing in your environment should ever touch it</em>.
      </p>
      <div class="docs-callout docs-callout--info">
        <p><strong>One-line mental model:</strong> you plant a tripwire that only fires when an attacker — or a
        curious insider, or a misconfigured scanner — walks through it.</p>
      </div>
      <h2>The lifecycle</h2>
      <ol>
        <li><strong>Generate</strong> — this tool mints a unique canary id and binds it to a decoy.</li>
        <li><strong>Deploy</strong> — you place the decoy somewhere attractive but unused.</li>
        <li><strong>Monitor</strong> — your webhook / listener URL receives a beacon when the decoy is touched.</li>
        <li><strong>Respond</strong> — the beacon contains the canary id, timestamp and label so you can trace which
        trap fired.</li>
      </ol>
      <p>
        Everything on this page runs in your browser. No token, endpoint or secret is transmitted anywhere except to
        the webhook you configure.
      </p>
    `
  },
  {
    id: "token-types",
    html: `
      <h2>Token types</h2>
      <h3>Web Bug / Tracking Link</h3>
      <p>
        A unique URL embedded as a 1×1 image, Markdown pixel or cURL call. Ideal for email signatures, shared docs,
        wiki pages and CMS drafts. Any fetch of the URL fires the beacon.
      </p>
      <h3>Decoy PDF Document</h3>
      <p>
        A realistic document (invoice, CV, handbook or memo) generated in-browser with an embedded link to your
        beacon. Use it as a tempting file in a shared drive or attachment.
      </p>
      <div class="docs-callout docs-callout--warning">
        <p><strong>PDF limitation:</strong> modern viewers deliberately block documents from silently fetching remote
        assets, so a PDF cannot reliably beacon when merely <em>opened</em>. The tracking link fires when the reader
        clicks it. Treat the PDF as a click-triggered canary, not an open-triggered one.</p>
      </div>
      <h3>Fake Credentials / API Keys</h3>
      <p>
        Structurally realistic AWS key pairs, JWTs and database connection strings. Plant them in a config file, a
        repo, a CI variable list or a password vault. Unlike links, keys do not beacon on their own — they become
        detectable when someone <em>uses</em> them, so pair them with your cloud audit logs or a decoy service that
        logs access attempts.
      </p>
      <h3>Decoy .env / Config File</h3>
      <p>
        A downloadable secrets file that mixes plausible values with a hidden tracking endpoint
        (<code>INTERNAL_WEBHOOK_URL</code>, <code>endpoint_url</code>, SSH <code>RemoteCommand</code>). If someone
        copies the file and a tool homes the endpoint, the alarm fires.
      </p>
    `
  },
  {
    id: "webhooks",
    html: `
      <h2>Choosing a webhook endpoint</h2>
      <p>
        A canary is only as useful as its alerting. Point the endpoint at anything that can receive an HTTP request
        and notify you.
      </p>
      <h3>Webhook.site (fastest to test)</h3>
      <ol>
        <li>Open <a href="https://webhook.site" target="_blank" rel="noopener noreferrer">webhook.site</a> and copy your unique URL.</li>
        <li>Paste it into the configurator's endpoint field.</li>
        <li>Click <strong>Send test beacon</strong> to confirm the request arrives.</li>
      </ol>
      <h3>Discord / Slack</h3>
      <p>
        These providers do <strong>not</strong> send permissive CORS headers, so a browser <code>POST</code> from a
        static site is usually blocked (and their payload schema differs from ours). Reliable options:
      </p>
      <ul>
        <li>Use <a href="https://webhook.site" target="_blank" rel="noopener noreferrer">webhook.site</a> or a service
        like Pipedream/Zapier as a relay.</li>
        <li>Deploy a tiny serverless proxy (Cloudflare Worker, AWS Lambda Function URL, Supabase Edge Function) that
        accepts the JSON and forwards it to Discord/Slack with their expected shape.</li>
        <li>For <code>GET</code> tokens, a Discord webhook URL still receives the request; Discord will reject the
        content type but you will see the attempt in their audit tooling.</li>
      </ul>
      <h3>Custom serverless endpoint</h3>
      <p>The app posts JSON shaped like this, so your function can log or forward it:</p>
      <pre><code>{
  "event": "canary.triggered",
  "canaryId": "ct_…",
  "label": "Payroll Q3 draft",
  "type": "web-bug",
  "source": "canary-token-generator",
  "triggeredAt": "2026-09-15T12:00:00.000Z",
  "page": "https://…"
}</code></pre>
    `
  },
  {
    id: "cors",
    html: `
      <h2>Why some webhooks fail (CORS, briefly)</h2>
      <p>
        Browsers enforce the <strong>Same-Origin Policy</strong>. When this page sends a <code>POST</code> to another
        domain, the target must explicitly allow cross-origin requests via
        <code>Access-Control-Allow-Origin</code>. Sites like <em>webhook.site</em> and custom serverless functions
        generally do; Discord and Slack generally do not.
      </p>
      <p>
        When the CORS request fails, this tool automatically retries as a <code>no-cors</code> request so the beacon
        is still <em>delivered</em>, even though the browser hides the response. You will see a note in the result
        panel when that fallback was used. If your provider ignores the payload, use a proxy.
      </p>
      <div class="docs-callout docs-callout--info">
        <p><strong>GET tokens sidestep CORS entirely.</strong> A tracking pixel is loaded without reading a response,
        so it works cross-origin by design.</p>
      </div>
    `
  },
  {
    id: "placement",
    html: `
      <h2>Placement strategies</h2>
      <ul>
        <li><strong>Honeytoken documents</strong> — leave a file named <code>2026-salaries.xlsx</code> or
        <code>prod-credentials.txt</code> in a share that should be empty.</li>
        <li><strong>Source control</strong> — commit a fake <code>.env</code> or key into a private repo; any clone or
        exfiltration attempt will eventually use it.</li>
        <li><strong>Wiki &amp; email</strong> — add a web bug to low-traffic pages or signature blocks.</li>
        <li><strong>Cloud canaries</strong> — create an IAM user or access key that exists only to be used, then alert
        on <code>GetCallerIdentity</code>/<code>ConsoleLogin</code> events.</li>
        <li><strong>CI variables</strong> — plant decoy secrets in build settings; unexpected use signals a leak.</li>
      </ul>
      <h2>Best practices</h2>
      <ul>
        <li>Give every token a descriptive <strong>label</strong> so alerts are self-explanatory.</li>
        <li>Keep a register — use <strong>My Active Tokens</strong> and export it to JSON for backup.</li>
        <li>Rotate and retire tokens you no longer monitor; a stale trap is noise.</li>
        <li>Record a baseline: know which tokens are expected to fire during testing.</li>
      </ul>
    `
  },
  {
    id: "ethics",
    html: `
      <h2>Ethics &amp; legal notice</h2>
      <div class="docs-callout docs-callout--warning">
        <p><strong>Use canary tokens only on systems, accounts and data you own or are explicitly authorised to
        monitor.</strong> Deploying them elsewhere, or using them to track people without consent, may be illegal in
        your jurisdiction and is not a permitted use of this tool.</p>
      </div>
      <p>
        Canary tokens are a <strong>detection</strong> control. They complement — never replace — access control,
        logging, and incident response. They are not proof of intent on their own; correlate the beacon with other
        telemetry before acting.
      </p>
      <p>
        This project is provided under the MIT License, as-is, without warranty. You are responsible for how you use
        it.
      </p>
    `
  },
  {
    id: "privacydata",
    html: `
      <h2>Privacy &amp; data handling</h2>
      <ul>
        <li>No analytics, no accounts, no server-side storage.</li>
        <li>Generated tokens are stored only in your browser's <code>localStorage</code> and can be exported or
        cleared at any time.</li>
        <li>Your endpoint URL is used solely to send the beacons you trigger.</li>
        <li>Third-party code loaded: Tailwind Play CDN, Lucide icons and pdf-lib (only when generating a PDF).</li>
      </ul>
    `
  }
];

/** Render the full Docs view as an HTML string. */
export function renderDocs() {
  return DOCS_SECTIONS.map((section) => `<section id="${section.id}">${section.html}</section>`).join(
    `<hr />`
  );
}
