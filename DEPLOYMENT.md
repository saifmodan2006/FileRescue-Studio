# Free-tier deployment

Cloudflare Pages serves the Vite build from `dist`. A Pages Function handles `/api/*` and forwards requests to Fastify on Render. The browser calls the same origin for pages and API requests, so admin sign-in works without third-party cookies or credentialed CORS. The gateway secret stays between Pages and Render. Render uses Neon PostgreSQL for admins, sessions, feedback, usage events and settings. File recovery stays in the browser.

## Free-tier limits checked November 16, 2026

- Cloudflare Pages Free includes 500 builds per account per month, a 20,000-file site limit and a 25 MiB maximum asset size. Only `/api/*` invokes the Pages Function. Workers Free allows 100,000 requests per day across the account. Use Workers Free and skip paid add-ons. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- Render Free gives each workspace 750 instance hours per month. Services sleep after 15 minutes without inbound traffic and can take about one minute to wake. Storage is ephemeral, and Render's Free PostgreSQL expires after 30 days. Free services also share monthly bandwidth and build allowances. Render documents suspension or disabled builds at relevant limits when no payment method is on file. Use a workspace without a payment method to avoid overage billing under these rules. [Render Free](https://render.com/docs/free)
- Neon Free is $0, has no time limit or card requirement, and currently includes 1 GB of storage and 100 compute-unit hours per project each month. Provision a database near the Render region and use its pooled connection string. [Neon pricing](https://neon.com/pricing) · [Connection pooling](https://neon.com/docs/connect/connection-pooling)

Verify the plan and any billing or verification screen in each account before creating a resource. Choose the free defaults and skip trials, upgrades and paid add-ons.

## 1. GitHub and Neon

1. Use the existing [FileRescue Studio repository](https://github.com/saifmodan2006/FileRescue-Studio) with production branch `main`. Check that it contains the deployment changes before connecting it to a host.
2. In the Neon console, create one project on **Free**. Choose a region near the intended Render region. Use its dedicated project database and select **Pooled connection** in the Connect dialog.
3. Keep the connection string in a secret manager or provider secret field. PostgreSQL uses TLS with certificate verification for remote connections. The PostgreSQL schema is initialized automatically on first backend startup, and deployment retries reuse the migration record.

For the workspace initially inspected, admin, session, feedback and usage tables were empty, and the SQLite settings row held defaults. A clean Neon database starts with the same settings. Check those counts again at deployment if you have used the local admin or feedback features since the inspection. Preserve the SQLite file and make a backup before planning a transfer of any new data.

## 2. Create a Cloudflare Pages project

1. Open **Workers & Pages → Create application → Pages → Connect to Git**. Approve access only to the existing repository. Use its `main` branch and choose an available project name. Prefer using the assigned Pages HTTPS origin so this deployment does not need a domain purchase or changes to existing DNS.
2. Set these build options.

   | Setting | Value |
   | --- | --- |
   | Framework preset | None |
   | Root directory | Repository root |
   | Build command | `npm run build:web` |
   | Build output directory | `dist` |
   | Build environment variable | `NODE_VERSION=24.21.0` |

3. After the static build, copy the assigned production HTTPS origin for Render's `PUBLIC_ORIGIN`. Leave preview API bindings empty. Production API bindings are added after Render supplies its origin. The workspace can recover files before the API is configured.
4. Keep Pages on the free plan. `_headers` controls static security headers, and Cloudflare's Pages SPA fallback serves routes such as `/repair`, `/report` and `/admin`. Only `/api/*` runs the function. Configure fail-closed behavior if the dashboard offers a function quota fallback setting. [Pages Git setup](https://developers.cloudflare.com/pages/configuration/git-integration/) · [Functions routing](https://developers.cloudflare.com/pages/functions/routing/)

## 3. Create the Render API

1. On a workspace with free usage available and no payment method, select **New → Web Service**, connect only the FileRescue Studio repository, and select **Free**. Choose the region close to Neon. The repository also includes a matching `render.yaml` Blueprint.
2. Set these options if using the manual service form.

   | Setting | Value |
   | --- | --- |
   | Branch | `main` |
   | Runtime | Node |
   | Root directory | Repository root |
   | Build command | `npm ci --include=dev && npm run build:server` |
   | Start command | `npm start` |
   | Instance type | Free |
   | Health check path | `/healthz` |
   | Automatic deploys | Off for the initial setup |

3. Set the Render variables in the table below. For the proxy secret, generate 32 random bytes represented as 64 lowercase hexadecimal characters. Enter the same value in an encrypted Pages secret. The following PowerShell command puts a new value on the clipboard without printing it to the terminal.

   ```powershell
   node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | Set-Clipboard
   ```

4. Deploy and copy the HTTPS origin assigned by Render. `/healthz` checks process liveness without querying PostgreSQL on every platform probe. The real database-backed readiness check runs through Pages at `/api/health`. [Render web services](https://render.com/docs/web-services) · [Blueprint reference](https://render.com/docs/blueprint-spec)

## 4. Add the Pages production bindings

Open the Pages project's **Settings → Variables and Secrets** and enter the bindings in the table. Trigger a fresh production deployment after setting them. A relative browser API path is used in production and local development, so the frontend build needs no API origin variable. Keep the database URL and gateway secret out of `VITE_*` variables, the repository and any public logs. [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/)

| Destination | Variable | Value |
| --- | --- | --- |
| Pages build | `NODE_VERSION` | `24.21.0` |
| Pages production binding | `STUDIO_API_ORIGIN` | The assigned Render HTTPS origin, with no trailing slash or path |
| Pages production secret | `STUDIO_PROXY_SECRET` | The generated shared secret |
| Render | `NODE_VERSION` | `24.21.0` |
| Render | `NODE_ENV` | `production` |
| Render | `STUDIO_HOSTED` | `true` |
| Render | `PUBLIC_ORIGIN` | The assigned Pages HTTPS origin, with no trailing slash or path |
| Render secret | `STUDIO_PROXY_SECRET` | The matching shared secret |
| Render secret | `DATABASE_URL` | The Neon pooled PostgreSQL connection string |
| Render platform | `PORT` | Supplied by Render. The hosted API binds to `0.0.0.0`. |
| Local | `HOST`, `PORT`, `DATABASE_PATH` | Optional overrides. Defaults are loopback, 4310 and `./data/studio.sqlite`. |
| Local | `DATABASE_URL` | Optional PostgreSQL connection string. Leave unset to use SQLite. |
| Local | `PUBLIC_ORIGIN`, `SECURE_COOKIES` | Optional exact custom browser origin and HTTPS cookie setting. Hosted mode always uses secure cookies. |

## 5. Initialize the hosted administrator

Run this in a trusted local PowerShell 7 terminal from the repository root. Enter the Neon connection string at the masked prompt. Admin creation reads the username and passphrase interactively and stores only the salted password hash. Keep admin credentials in your own password manager. The setup command has no HTTP equivalent.

```powershell
$env:DATABASE_URL = Read-Host 'Neon PostgreSQL connection string' -MaskInput
try {
  npm run migrate
  if ($LASTEXITCODE -eq 0) { npm run admin:create }
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
```

## 6. Verify before sharing the Pages URL

- Check that the Render service shows **Free**, the Cloudflare account uses **Workers Free**, and the Neon project shows **Free**. Check that no trial or paid add-on was enabled.
- Refresh `/repair` and `/admin` on the Pages domain. Verify that the Pages origin returns a JSON 200 at `/api/health` with `database: ready`. A direct request to Render's `/api/config` should return 403 once the service has woken. Render's `/healthz` should return 200.
- Sign into Pages `/admin`, verify the host-only `studio_session` cookie has Secure, HttpOnly and SameSite=Strict, and confirm it is cleared on sign-out. Check that admin data requires a valid session. If the backend is waking, wait and try again.
- Submit clearly labeled synthetic feedback and confirm it appears in admin. Check that disabling analytics keeps the events endpoint closed. Reopen admin after a Render restart to confirm the feedback and settings persisted.
- Recover the built-in sample PDF. Check the download and JSON report. Use the synthetic MP4 fixture in `tests/fixtures/trailing-box.mp4` for the supported trailing-data repair. Verify both formats still work with the API unavailable.
- With the workspace open online, allow its service worker to cache the build. Then test offline recovery. There are no FFmpeg or WebAssembly assets in the current pipeline. The app uses PDF.js workers with bundled fonts and character maps and the browser's own video decoder.

## Local verification commands

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm audit
```

For the hosted-path persistence test, start a disposable local PostgreSQL instance and create a database with a name beginning with `studio_test_`. Give `STUDIO_TEST_DATABASE_URL` a loopback connection string for that database and run `npx vitest run tests/postgres.test.ts`. The test writes synthetic admin, session, settings, feedback and usage records, closes Fastify, and starts a new instance to check persistence. Clear the variable after the test.
