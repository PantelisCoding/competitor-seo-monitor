## Competitor SEO Monitor

A competitor SEO monitoring platform designed to automatically track competitor websites, analyze sitemap changes, and identify newly discovered SEO pages.

The project combines an interactive administration dashboard, automated monitoring, and daily email reporting to help LoopCV track competitor activity and identify SEO opportunities.

### Key Features

- **Automated Competitor Monitoring:** Scans competitor sitemaps and tracks newly discovered SEO pages.
- **Admin Dashboard:** Displays competitor data, monitoring results, and historical activity.
- **Competitor Management:** Allows authorized administrators to add, remove, disable, and restore competitors.
- **Daily Email Reports:** Generates automated SEO monitoring reports at 11:00 AM Greece time using GitHub Actions and AgentMail.
- **SEO Change Tracking:** Identifies new pages and distinguishes recent discoveries from historical results.
- **Authentication & Security:** Includes GitHub OAuth authentication and protected administration endpoints.
- **Deployment Support:** Includes configurations for Netlify, GitHub Actions, and production backend functionality.

### Technology Stack

Vue.js 2, Vite, Node.js, GitHub Actions, GitHub OAuth, Netlify, and AgentMail.

### Testing & Compatibility

- 23 automated tests passing.
- Production build completed successfully.
- Existing LoopCV monitoring data preserved.

**Deployment note:** Production authentication, environment variables, GitHub permissions, and scheduled email delivery still require verification after deployment.
