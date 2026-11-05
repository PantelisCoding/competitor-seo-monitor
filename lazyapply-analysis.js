const fs = require('fs')
const db = JSON.parse(fs.readFileSync('./static/data/competitor-monitor.json', 'utf8'))
const urls = Object.keys(db.competitors.lazyapply.urls)

const paths = {}

for (const url of urls) {
  const parts = new URL(url).pathname.split('/').filter(Boolean)
  const category = parts[0] || '(homepage)'
  paths[category] = (paths[category] || 0) + 1
}

console.log('Total URLs:', urls.length)
console.log('\nURLs by category:\n')

console.log(
  Object.entries(paths)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${category}: ${count}`)
    .join('\n')
)
