const fs = require('fs')
const db = JSON.parse(fs.readFileSync('./static/data/competitor-monitor.json', 'utf8'))

const urls = Object.keys(db.competitors.lazyapply.urls)
  .filter(url => new URL(url).pathname.startsWith('/cover-letter-examples/'))

const uniquePaths = new Set(
  urls.map(url => new URL(url).pathname.toLowerCase())
)

console.log('Total URLs:', urls.length)
console.log('Unique paths:', uniquePaths.size)
console.log('Duplicate paths:', urls.length - uniquePaths.size)
