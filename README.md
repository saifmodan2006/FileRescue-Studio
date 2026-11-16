# FileRescue Studio

**Recover What Matters.** Diagnose a PDF or MP4, attempt a supported repair, review the verification checks, and download the result. File handling runs in your browser. The local API provides feedback, announcements, consented usage counters and administration.

## Start locally

From the project root with Node.js 22.13 or later and npm:

```sh
npm ci
npm run migrate
npm run dev
```

Open [the workspace](http://127.0.0.1:5173/repair). The API listens on port 4310 by default. To run the frontend by itself, use `npm run dev:web`. The PDF and MP4 workflows are available with the API offline.

To add a local administrator:

```sh
npm run admin:create
```

Run this in an interactive terminal. Enter a username and a passphrase of at least 12 characters when prompted. Open [admin sign-in](http://127.0.0.1:5173/admin) with those credentials. The database starts without any admin users. Account setup is local and is disabled when `NODE_ENV=production`.

Optional settings are listed in `.env.example`. Copy it to `.env` to change the database path or port. Database migrations are transactional, idempotent, and also run when the API starts.

## Run the built application locally

```sh
npm run build
npm start
```

Open [the built app](http://127.0.0.1:4310/). Opening the workspace online lets the service worker prepare the offline cache. Once the browser has cached the build, the workspace can open again and process files offline. The API endpoints stay online-only. The browser may clear cached assets.

## Use the workspace

1. Pick or drop a PDF or MP4. The first file is analyzed immediately. If you selected a batch, choose the next file after reviewing the current result.
2. Read findings and select a supported recovery method. For a PDF, select the readable pages you want to keep.
3. Attempt recovery and review the verification checks. The output can be downloaded after those checks pass.
4. Open the report to view the findings, attempts and output details. Export structured JSON, or choose **Print / save PDF** and select the browser’s PDF destination.

The homepage sample is a real two-page PDF generated in the browser with its terminal marker removed.

## Architecture

| Area | Source |
| --- | --- |
| React routes and accessible controls | `src/shell.tsx`, `src/pages/`, `src/components/` |
| File signature checks, job time limits and cancellation | `src/engine/worker.ts`, `src/engine/client.ts` |
| PDF rendering, extraction and verification | `src/engine/pdf.ts` |
| MP4 box and media-offset inspection, trailer cleanup | `src/engine/mp4.ts` |
| Fastify endpoints, cookie sessions and input validation | `server/app.ts`, `server/auth.ts` |
| SQLite schema and transactional migrations | `server/schema.ts`, `server/db.ts` |
| Offline cache manifest | `scripts/build-offline.mjs` |

The workspace keeps the current file, report and output in tab memory, including when you open the report and return. Selecting another file replaces the active report. Optional history keeps format, size, time and outcome in memory. Preferences persist in local browser storage. Exports are explicit downloads. The server has no file-upload endpoint.

The worker is isolated from the UI and terminated on cancellation, completion, timeout or workspace exit. PDF.js renders into bounded canvases and pdf-lib rebuilds selected pages. The browser checks video decoding with a temporary object URL. Pages and video previews use local Blob URLs.

The API limits requests, validates mutation origin and requires a per-session CSRF token for protected mutations. Passwords are salted and hashed with scrypt. Sessions expire on the server and the cookie is HttpOnly and SameSite=Strict. Set `SECURE_COOKIES=true` for HTTPS. Usage statistics require both admin enablement and visitor consent.

## Check the project

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm audit
```

`npm run test:unit` runs parser and component tests. `npm run test:integration` runs Fastify and SQLite tests. The Playwright script also builds the app and runs against the real local API with a separate test database. [Fixture documentation](tests/fixtures/README.md) describes how each corruption case is produced. Use synthetic inputs for new regression tests.

See [Technical limitations](LIMITATIONS.md) for the recovery boundaries, verification semantics and browser requirements.
