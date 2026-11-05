const fs = require('fs')
const db = JSON.parse(fs.readFileSync('./static/data/competitor-monitor.json', 'utf8'))
const simplify = db.competitors.simplify

console.log('Simplify sitemap errors:')
for (const error of simplify.sitemapErrors || []) {
  console.log(error.sitemap)
  console.log(error.message)
  console.log('---')
}
