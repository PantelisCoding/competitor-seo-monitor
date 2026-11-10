# Live deployment readiness (no deployment required to finish development)

This project is prepared for **Netlify hosting with Netlify Functions**, **GitHub OAuth** for administrator login, and the existing **GitHub Actions** sitemap scanner. The main dashboard remains Vue 2.7 / Vite. No production site, OAuth app, server token, or secrets are created automatically.

## Architecture

- Browser frontend at the Netlify site URL: Vue dashboard, refresh button, admin Sign in/Sign out, Add and Delete buttons shown only to administrators.
- Authentication: `/api/auth/login`, `/api/auth/callback`, `/api/auth/session`, `/api/auth/logout`. GitHub OAuth verifies identity; allowlisted GitHub usernames **and** repository write permissions are required.
- Serverless CRUD: `/api/competitors` (GET, POST, DELETE) verifies the signed, expiring HttpOnly/Secure/SameSite=Lax session on **every request**. Mutations require same-origin browser requests. Secrets and GitHub tokens are never passed to the client.
- Persistence: GitHub Contents API writes `static/data/extra-competitors.json` (new custom competitors) or `static/data/disabled-competitors.json` (deletions / restorations), **on `GITHUB_BRANCH`**. An existing competitor's scan history stays in `static/data/competitor-monitor.json`. Optimistic SHA conflict detection protects repository edits.
- Scanner: GitHub Actions `.github/workflows/competitor.monitor.yml` runs on schedule and accepts workflow dispatch. On a new configuration change, the backend requests a scan through GitHub REST API. It may take time for a scan and subsequent site build to finish. Dashboard checks the GitHub-backed config directly to show pending/disabled entries before the next deployment.
- Netlify updates the hosted dashboard after commits if continuous deployment is enabled. The scanner's optional GitHub Pages workflow has been disabled by default; set the repo variable `DEPLOY_GITHUB_PAGES=true` only if you actually configure that deployment route.
- Local development: Vite's local `/api/local-competitors` saves to the JSON files on disk. No OAuth/production credentials required for local Add/Delete testing.

## Before first live deployment

1. Make sure this work is merged into the **actual repository running the scheduled monitor**. Currently, the work is on the draft branch `fix/add-competitor-dashboard-working` of `PantelisCoding/competitor-seo-monitor`. Do not assume this also updates `Loopcv/monitor-competitors-sitemap`.
2. Decide the final URL and create a Netlify site connected to the correct GitHub repository. `netlify.toml` configures `npm run build`, output `dist`, Node 20 and Netlify Functions. Netlify builds use Vite base `/`, while local Vite retains the previous project base.
3. Register a **GitHub OAuth App** in your GitHub account's Developer Settings. Set the Homepage URL to `https://YOUR-SITE/` and the **Authorization callback URL** to `https://YOUR-SITE/api/auth/callback`. Save its Client ID and Client Secret.
4. Create a **fine-grained GitHub token** scoped **only to the target monitoring repository**, with repository **Contents: Read and write**, **Actions: Read and write** (to dispatch scanner), and the mandatory **Metadata: Read** (for checking collaborator permissions). Give it to the **Netlify Functions runtime**, not the frontend. Check any organization-specific approval requirements.
5. In Netlify environment settings, configure the following for Functions (all kept server-side):

   | Variable | Example / purpose |
   | --- | --- |
   | `PUBLIC_BASE_URL` | `https://YOUR-SITE/` — final HTTPS origin with trailing slash |
   | `GITHUB_REPO` | `OWNER/REPO` — repository with the scanner and JSON files |
   | `GITHUB_BRANCH` | `main` — branch that runs scans |
   | `GITHUB_TOKEN` | The repository-scoped token created above |
   | `GITHUB_OAUTH_CLIENT_ID` | OAuth App client ID |
   | `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App client secret |
   | `SESSION_SECRET` | 32+ unpredictable characters, preferably 64 random bytes in hex |
   | `ADMIN_GITHUB_LOGINS` | Comma-separated approved GitHub usernames (e.g. `lead-dev,seo-admin`) |

   To generate a session secret locally: `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`

6. Keep the JSON config files committed to the target branch. Ensure GitHub Actions is enabled and workflows are permitted to write scan results to `main` as needed by the repository rules. The scanner must have Chromium available (the workflow installs Playwright Chromium).
7. **Access/privacy consideration:** The production API protects editing, **not** the static `/data/competitor-monitor.json` SEO reports. If this dashboard is meant to be confidential, protect the **whole Netlify site and its static files** using an appropriate site-level access control before publishing. Merely hiding Add/Delete does not protect public HTML or JSON.
8. On the eventual hosted site, sign in, add a safe test domain, confirm the GitHub config commit, inspect the GitHub Action scan, verify new SEO data, delete the competitor and check the disabled config, then restore it. Confirm site deploys are enabled.

## Local checks without deployment

```powershell
npm ci
node --test tests/*.test.cjs
npm run build
npm run dev
```

The automated tests simulate GitHub API reads, writes, OAuth code exchange, permissions, CSRF checks, and scan dispatch. They **do not** replace a real Netlify+GitHub end-to-end test. For now, local Add/Delete can be tested fully through Vite.

## Expected production behavior

- Anonymous visitor: can see only static dashboard data, not change competitor configuration; Sign in with GitHub is shown.
- Authorized administrator: Add/Delete actions enabled.
- Add: immediately creates or restores a competitor configuration. Repeated additions are rejected as duplicates.
- Delete: confirms, then disables both built-in or manually added competitors without deleting past SEO reports.
- Re-add: removes the disable flag and resumes monitoring; past SEO history remains available.
- If GitHub/API/scanner is unavailable: saving fails clearly or succeeds with `scanRequested=false`; the next scheduled scan still reads configuration from the repository. Monitor GitHub Actions for failures.

## Security limits and operation

- Login authorizes only members listed in `ADMIN_GITHUB_LOGINS` **who also have write permissions** in `GITHUB_REPO`. Changes in repo permissions take effect at the next API check.
- Session cookies expire after eight hours and are HMAC-signed. The backend rejects invalid/expired sessions and cross-origin mutations.
- Do not add `GITHUB_TOKEN`, OAuth secrets, or `SESSION_SECRET` to a Vite variable prefixed `VITE_` or commit them to Git.
- Restrict production access to the final canonical HTTPS domain; the OAuth callback and `PUBLIC_BASE_URL` must match.
- `netlify.toml` provides an optional deployment *configuration*, not a deployment. No workflow should create a production Netlify site automatically.
