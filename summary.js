const fs = require('fs')
const db = JSON.parse(fs.readFileSync('./static/data/competitor-monitor.json', 'utf8'))

for (const [id, c] of Object.entries(db.competitors)) {
  console.log({
    competitor: c.name || id,
    seoPages: c.seoPages,
    sitemaps: c.sitemapCount,
    newPages: c.newSeoPages,
    errors: (c.sitemapErrors || []).length,
    errorDetails: (c.sitemapErrors || []).map(e => e.message).join('; ')
  })
}
