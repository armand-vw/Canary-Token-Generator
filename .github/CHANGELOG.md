# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-09-15

### Added

- **QR-code canary tokens** — render the tracking URL as an SVG QR code with an inline preview
  and download.
- **Deployment Kit export** — package the register, deployment guide, snippets, decoy files, QR
  codes and generated PDFs into a single ZIP.
- **Installable PWA** — web app manifest, generated icons and a service worker that precaches the
  app shell for offline use.
- **Test suite** — 51 Vitest tests covering the token engine, store, UI helpers, PDF generation,
  QR rendering and the kit builder, including real PDF annotation and ZIP-content assertions.
- **CI** — GitHub Actions workflow running lint, formatting, JSDoc type-checking, tests and a
  compiled-CSS freshness check.
- **JSDoc type-checking** via `tsc --noEmit` and `checkJs`.
- **Repository docs** — contributing guide, code of conduct, security policy, changelog and
  issue/PR templates.

### Changed

- Tailwind is now compiled ahead of time into `assets/css/styles.css`; the Play CDN runtime is
  gone, so the browser console is clean.
- CDN dependencies are pinned in a single import map and shared with the test environment.
- `generateToken()` is asynchronous to support QR rendering.

## [1.0.0] - 2026-09-15

### Added

- Initial release: web bug / HTTP tracking links, decoy PDF documents, fake credentials
  (AWS, JWT, database connection strings) and decoy `.env` / config files.
- Local token register with search, filter, copy, delete and JSON export/import.
- GET tracking-pixel and POST JSON beacon delivery with automatic `no-cors` fallback.
- In-app documentation, webhook setup guidance and an ethics/legal notice.
- Deployment at <https://armand-vw.github.io/Canary-Token-Generator/>.

[Unreleased]: https://github.com/armand-vw/Canary-Token-Generator/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/armand-vw/Canary-Token-Generator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/armand-vw/Canary-Token-Generator/releases/tag/v1.0.0
