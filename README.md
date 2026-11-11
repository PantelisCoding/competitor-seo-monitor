# Competitor SEO Monitor

Vue 2.7 / Vite dashboard and GitHub Actions scraper for competitor SEO activity, with manual Add/Delete and persistent monitoring history.

## Development

```powershell
npm ci
npm run dev
```

Use **+ Add Competitor** to add a domain and optional HTTPS sitemap; use **Delete** to disable monitoring without erasing the historical SEO report. On localhost, the Vite-only API saves configuration to `static/data/extra-competitors.json` and `static/data/disabled-competitors.json`. The scanner reads both files on startup.

The **New SEO pages** overview and competitor counters show only discoveries from the latest scan (using per-scan IDs and `newSeoPages`, not the entire history). The **New discoveries** tab also filters to the latest scan; previous historical events remain stored for reporting. Legacy JSON data without per-scan IDs will show the last stored per-competitor counter until the next updated scan, after which the new tab can display accurate per-run discoveries.

To scan all active competitors locally: `npm run scan` (may take time and uses Playwright). The GitHub Actions workflow `.github/workflows/competitor.monitor.yml` performs one automatic scan per day at 03:00 UTC and also supports explicitly initiated manual runs.

## Production preparation

This branch includes a **Netlify Functions API backed by GitHub**, GitHub OAuth administrator sign-in, allowlist/permission checks, signed sessions, CSRF protection, persistent config commits and automatic scan requests. Nothing has been deployed.

Read **[PRODUCTION-SETUP.md](PRODUCTION-SETUP.md)** before deploying: it lists required GitHub OAuth settings, server-only secrets, access control requirements, and acceptance tests.

Important: the hosted Add/Delete API requires Netlify Functions or an equivalent server runtime. A static-only host cannot write monitoring configuration. Static SEO JSON is public unless you separately protect the complete site.

## Automated validation

```powershell
node --test tests/*.test.cjs
npm run build
```

The tests cover local and production API behavior with mocked GitHub responses; a real hosted end-to-end test is still required before a production launch.

Project changes are currently on the draft branch `fix/add-competitor-dashboard-working` in `PantelisCoding/competitor-seo-monitor` and must be merged into the actual scanning repository to become active.
