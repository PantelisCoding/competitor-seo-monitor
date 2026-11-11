AgentMail reporting for Loopcv/monitor-competitors-sitemap

From: competitor-reports@agentmail.to
To: g.avgenakis@loopcv.com, lucas@loopcv.com, prafull@outsmartt.com, ayushi.roy@outsmartt.com

The email is sent only when the latest scan has newly detected SEO pages, removed pages,
or sitemap errors. This avoids sending four emails every hour when nothing changed.

Install using Windows PowerShell:
  1. Extract this ZIP and keep both .js and .ps1 together.
  2. cd C:\Users\user\competitor-seo-monitor
  3. & "C:\path\to\extracted\install-agentmail.ps1"
     (If script execution is disabled, use PowerShell -ExecutionPolicy Bypass -File "C:\path\to\extracted\install-agentmail.ps1")
  4. git diff -- .github/workflows/competitor.monitor.yml
  5. git status --short
  6. git add scripts/sendEmailReport.js .github/workflows/competitor.monitor.yml
  7. git commit -m "Add AgentMail competitor SEO change reports"
  8. git push origin main

GitHub repository secret required: AGENTMAIL_API_KEY
IMPORTANT: Never paste the secret into git or ChatGPT. The workflow references the secret securely.

The installer changes only scripts/sendEmailReport.js and .github/workflows/competitor.monitor.yml.
It does not modify the scanner source or JSON dashboard data.
