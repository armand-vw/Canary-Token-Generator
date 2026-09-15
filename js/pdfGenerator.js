/**
 * pdfGenerator.js — client-side decoy PDF construction
 * ----------------------------------------------------------------------------
 * Builds realistic PDF documents with pdf-lib and embeds a link annotation
 * pointing at the canary beacon. pdf-lib is lazy-loaded the first time a PDF is
 * requested, so the rest of the app never pays for its ~1 MB.
 *
 * The bare "pdf-lib" specifier is resolved by the browser via the import map in
 * index.html and by Node/Vitest via node_modules, so this same module is
 * testable without a bundler.
 *
 * IMPORTANT / HONEST LIMITATION
 * Modern PDF viewers do not auto-fetch remote assets embedded in documents
 * (that behaviour is treated as a tracking vulnerability). There is therefore
 * no reliable way to beacon on *open*. Instead we embed a clickable link: the
 * alert fires when a reader follows it. The in-app UI states this plainly.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 54;

/** @type {Promise<typeof import("pdf-lib")> | null} */
let pdfLibPromise = null;

/** Lazily import pdf-lib once and cache the module promise. */
function loadPdfLib() {
  if (!pdfLibPromise) {
    pdfLibPromise = import("pdf-lib").catch((error) => {
      pdfLibPromise = null; // allow a retry on the next attempt
      throw error;
    });
  }
  return pdfLibPromise;
}

/** Greedy word-wrap using the measured width of the active font. */
function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* ============================================================================
 * Decoy document content by preset
 * ========================================================================== */

function contentFor(preset, token) {
  const ref = token.id.toUpperCase();
  const date = new Date(token.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  switch (preset) {
    case "resume":
      return {
        brand: "CONFIDENTIAL",
        title: "Curriculum Vitae",
        meta: [`Prepared: ${date}`, `Reference: ${ref}`],
        blocks: [
          {
            heading: "Professional Summary",
            body:
              "Senior platform engineer with 9+ years designing resilient distributed systems. " +
              "Leads infrastructure modernisation, observability and security engineering across multi-cloud estates."
          },
          {
            heading: "Experience",
            body:
              "Principal Infrastructure Engineer — Northwind Systems (2021–present). Owned the internal developer " +
              "platform serving 400+ engineers, cut deployment lead time by 63%, and introduced zero-trust service identity.\n\n" +
              "Site Reliability Engineer — Contoso Cloud (2017–2021). Built multi-region Kubernetes with automated " +
              "failover, reducing p99 latency by 41% and annual downtime below 12 minutes."
          },
          {
            heading: "Skills",
            body: "Kubernetes · Terraform · Go · Python · PostgreSQL · Observability · Threat Detection"
          },
          {
            heading: "References",
            body: `Available on request. Verify this document at the link below.`
          }
        ]
      };

    case "handbook":
      return {
        brand: "INTERNAL",
        title: "Employee Handbook",
        meta: [`Revision: ${ref}`, `Issued: ${date}`],
        blocks: [
          {
            heading: "1. Purpose",
            body:
              "This handbook summarises company policy for all full-time and contract staff. It is reviewed annually " +
              "by the People and Compliance teams."
          },
          {
            heading: "2. Information Security",
            body:
              "All personnel must use hardware security keys for privileged access. Credentials must never be shared " +
              "or committed to source control. Report suspected incidents to security@contoso.internal within one hour."
          },
          {
            heading: "3. Remote Work",
            body:
              "Devices must be enrolled in MDM and encrypted at rest. Public networks require the corporate VPN. " +
              "Confidential material may not be stored on personal cloud accounts."
          },
          {
            heading: "4. Acceptable Use",
            body: "Company systems are monitored. Access to systems without authorisation is prohibited."
          }
        ]
      };

    case "memo":
      return {
        brand: "CONFIDENTIAL",
        title: "Internal Memorandum",
        meta: [`Ref: ${ref}`, `Date: ${date}`],
        blocks: [
          { heading: "To", body: "Engineering Leadership" },
          { heading: "From", body: "Platform Security" },
          {
            heading: "Subject",
            body: "Planned credential rotation and audit schedule."
          },
          {
            heading: "Summary",
            body:
              "As part of our quarterly access review we will rotate all long-lived production credentials and " +
              "retire unused service accounts. Teams should migrate to short-lived, workload-issued identity."
          },
          {
            heading: "Actions",
            body:
              "1. Inventory credentials in scope by the 14th.\n2. Confirm owners for each service account.\n" +
              "3. Complete migration to workload identity before the next release freeze."
          }
        ]
      };

    case "invoice":
    default:
      return {
        brand: "ACME CLOUD SERVICES",
        title: "INVOICE",
        meta: [`Invoice: INV-2043-${ref.slice(-5)}`, `Issued: ${date}`, "Terms: Net 30"],
        blocks: [
          {
            heading: "Billed to",
            body: "Contoso Ltd.\n100 Harbour Street\nCape Town, 8001\nSouth Africa"
          },
          {
            heading: "Line items",
            body:
              "Managed Kubernetes — 12 nodes            $ 4,320.00\n" +
              "Object storage — 48 TB                    $ 1,152.00\n" +
              "Observability platform — 40 hosts         $   880.00\n" +
              "Priority support (Gold)                   $ 1,500.00"
          },
          {
            heading: "Total due",
            body: "USD $ 7,852.00"
          },
          {
            heading: "Payment",
            body: "Bank transfer to ACME-Cloud, reference INV-2043. A signed copy is available via the link below."
          }
        ]
      };
  }
}

/* ============================================================================
 * PDF assembly
 * ========================================================================== */

/**
 * Build the decoy PDF.
 * @param {import('./store.js').CanaryToken} token
 * @returns {Promise<{blob: Blob, filename: string, bytes: number}>}
 */
export async function generatePdf(token) {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  const preset = token.meta?.preset ?? "invoice";
  const content = contentFor(preset, token);

  const doc = await PDFDocument.create();
  doc.setTitle(token.meta?.title || content.title);
  doc.setAuthor("Acme Cloud Services");
  doc.setSubject(content.title);
  doc.setProducer("Canary Token Generator");
  doc.setCreator("Canary Token Generator");

  const page = doc.addPage([A4.width, A4.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const ink = rgb(0.09, 0.11, 0.15);
  const muted = rgb(0.42, 0.45, 0.5);
  const accent = rgb(0.04, 0.45, 0.6);
  const hairline = rgb(0.85, 0.87, 0.9);
  const maxWidth = A4.width - MARGIN * 2;

  // --- Header band -----------------------------------------------------------
  page.drawRectangle({ x: 0, y: A4.height - 96, width: A4.width, height: 96, color: rgb(0.06, 0.09, 0.16) });
  page.drawText(content.brand, { x: MARGIN, y: A4.height - 50, size: 10, font: bold, color: rgb(0.55, 0.7, 0.8) });
  page.drawText(content.title, { x: MARGIN, y: A4.height - 80, size: 26, font: bold, color: rgb(1, 1, 1) });

  // --- Meta line -------------------------------------------------------------
  let y = A4.height - 128;
  content.meta.forEach((line, index) => {
    page.drawText(line, { x: MARGIN, y, size: 9, font, color: muted });
    y -= 14;
    if (index === content.meta.length - 1) y -= 8;
  });

  // --- Body blocks -----------------------------------------------------------
  for (const block of content.blocks) {
    if (y < 170) break; // keep the footer + tracking link on page one

    page.drawText(block.heading.toUpperCase(), { x: MARGIN, y, size: 9, font: bold, color: accent });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + maxWidth, y },
      thickness: 0.6,
      color: hairline
    });
    y -= 16;

    for (const paragraph of String(block.body).split("\n")) {
      if (!paragraph) {
        y -= 8;
        continue;
      }
      for (const line of wrapText(paragraph, font, 10.5, maxWidth)) {
        if (y < 170) break;
        page.drawText(line, { x: MARGIN, y, size: 10.5, font, color: ink });
        y -= 15;
      }
    }
    y -= 14;
  }

  // --- Tracking footer (visible link + URI annotation) -----------------------
  const footerY = 96;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 44 },
    end: { x: MARGIN + maxWidth, y: footerY + 44 },
    thickness: 0.6,
    color: hairline
  });
  page.drawText("Verify this document", { x: MARGIN, y: footerY + 28, size: 10, font: bold, color: accent });

  const linkLabel = token.beaconUrl.length > 78 ? `${token.beaconUrl.slice(0, 75)}...` : token.beaconUrl;
  page.drawText(linkLabel, { x: MARGIN, y: footerY + 12, size: 8, font: mono, color: accent });
  page.drawText(`Canary reference: ${token.id}`, { x: MARGIN, y: footerY - 4, size: 7.5, font, color: muted });

  // Attach a real /Link annotation so clicking the footer URL opens the beacon.
  try {
    const { PDFName, PDFString } = await loadPdfLib();
    const linkAnnotation = doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [MARGIN, footerY + 8, MARGIN + maxWidth, footerY + 24],
      Border: [0, 0, 0],
      F: 4,
      A: {
        Type: "Action",
        S: PDFName.of("URI"),
        URI: PDFString.of(token.beaconUrl)
      }
    });
    page.node.addAnnot(doc.context.register(linkAnnotation));
  } catch (error) {
    console.warn("[pdf] Could not attach link annotation", error);
  }

  const bytes = await doc.save();
  return {
    blob: new Blob([bytes], { type: "application/pdf" }),
    filename: token.meta?.filename || `${slugify(token.label)}.pdf`,
    bytes: bytes.byteLength
  };
}

/** Turn a label into a filesystem-safe filename. */
export function slugify(value) {
  return (
    String(value ?? "canary-document")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "canary-document"
  );
}
