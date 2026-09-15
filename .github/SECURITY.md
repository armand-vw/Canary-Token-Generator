# Security Policy

## Intended use

Canary Token Generator is a **defensive security tool**. Canary tokens are bait designed to
detect unauthorized access. They may only be deployed on systems, accounts and data that you own
or are explicitly authorized to monitor. Misuse to track individuals without consent is
prohibited and may be unlawful.

## Architecture & data handling

- The application is **100% client-side** and can be self-hosted as static files.
- There is **no backend, no analytics and no telemetry**.
- Generated tokens are stored only in the browser's `localStorage`.
- The only outbound network requests are:
  - Loading pinned third-party libraries from public CDNs (Tailwind, Lucide, pdf-lib).
  - Beacons sent to the **webhook endpoint you configure**.

## Reporting a vulnerability

If you discover a security issue in this project, please **do not open a public issue**. Instead:

1. Email **armand.vanwyk001@gmail.com** with a description and reproduction steps.
2. Allow a reasonable window for a fix before public disclosure.

You can expect an acknowledgement within a few days. Please act in good faith and avoid privacy
violations, data destruction, or service disruption while testing.

## Scope

In scope: this repository's client-side code and its handling of token data.
Out of scope: third-party CDN dependencies and the webhook/notification services you choose to
integrate with.
