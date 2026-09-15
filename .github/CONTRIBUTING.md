# Contributing

Thanks for your interest in improving the Canary Token Generator. This project is a static,
client-side security tool — contributions that keep it fast, dependency-light and honest about
its limitations are very welcome.

## Prerequisites

- **Node.js 20+** (only needed for the dev tooling; the app itself has no runtime dependencies)
- A modern evergreen browser

## Getting started

```bash
git clone https://github.com/armand-vw/Canary-Token-Generator.git
cd Canary-Token-Generator
npm ci
```

Serve the folder over HTTP (ES modules and the service worker require it):

```bash
python3 -m http.server 8080
# or
npx serve .
```

Then open <http://localhost:8080>.

## Scripts

| Command                | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `npm run build:css`    | Compile Tailwind into `assets/css/styles.css` (committed) |
| `npm run watch:css`    | Rebuild the stylesheet on change during development       |
| `npm run test`         | Run the Vitest suite                                      |
| `npm run test:watch`   | Run tests in watch mode                                   |
| `npm run lint`         | ESLint (flat config)                                      |
| `npm run format`       | Format with Prettier                                      |
| `npm run format:check` | Verify formatting without writing                         |
| `npm run typecheck`    | Type-check JSDoc via `tsc -p ./config/tsconfig.json`      |
| `npm run verify`       | Lint + format check + typecheck + tests + CSS build       |

## Project layout

```
index.html                     Layout, import map, Tailwind link, drawer/toast mounts
assets/css/tailwind.input.css  Tailwind source (compiled to styles.css)
assets/css/styles.css          Committed compiled output — do not edit by hand
assets/img/                    Logo, icons and social preview
js/app.js                      Entry point: routing, configurator, dashboard
js/tokenEngine.js              Canary ids, decoy factories, beacon delivery
js/qrGenerator.js              QR SVG rendering
js/pdfGenerator.js             PDF construction (pdf-lib)
js/kitBuilder.js               Deployment-kit ZIP assembly (fflate)
js/store.js                    localStorage persistence
js/ui.js                       Toasts, drawer, clipboard, formatting
js/templates.js                In-app documentation content
tests/                         Vitest suites
config/                        Tooling config (eslint, tailwind, tsconfig, vitest)
.github/                       CI, issue/PR templates and project docs
```

## Architecture notes

- **No build step is required to run or deploy.** The only generated artifact is
  `assets/css/styles.css`, which is committed. If you change Tailwind classes, run
  `npm run build:css` and commit the result — CI checks that it is up to date.
- **Dependencies are pinned in `index.html`'s import map.** The same bare specifiers
  (`pdf-lib`, `qrcode`, `fflate`) resolve from the CDN in the browser and from `node_modules`
  under test. Keep the import-map versions and `package.json` versions in sync.
- **JSDoc is the type layer.** Add or update `@param`/`@returns`/`@typedef` annotations when you
  change a public function.

## Making a change

1. Create a branch: `git checkout -b feat/your-feature`.
2. Make your change and add/update tests in `tests/`.
3. Run `npm run verify` and make sure it passes.
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) — e.g.
   `feat: add DNS canary token` or `fix: correct beacon query encoding`.
5. Open a pull request and fill in the template. Keep PRs focused.

## Reporting security issues

Do **not** open a public issue for vulnerabilities. See [SECURITY.md](./SECURITY.md).

## Code of conduct

By participating you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).
