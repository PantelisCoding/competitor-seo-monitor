const fs = require('fs')
const db = JSON.parse(fs.readFileSync('./static/data/competitor-monitor.json', 'utf8'))

const urls = Object.keys(db.competitors.lazyapply.urls)
  .filter(url => new URL(url).pathname.startsWith('/cover-letter-examples/'))

console.log('Total:', urls.length)
console.log('\nFirst 30 URLs:\n')
console.log(urls.slice(0, 30).join('\n'))
