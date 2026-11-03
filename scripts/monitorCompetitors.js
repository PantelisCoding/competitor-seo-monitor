
const fs = require('fs')
const path = require('path')
const { XMLParser } = require('fast-xml-parser')
const { chromium } = require('playwright')

const DATA_PATH = path.join(__dirname, '../static/data/competitor-monitor.json')
const CONCURRENCY = 8

const COMPETITORS = [
  {
    id: 'aiapply',
    name: 'AIApply',
    domain: 'aiapply.co',
    baseUrl: 'https://aiapply.co'
  },
  {
    id: 'teal',
    name: 'Teal',
    domain: 'tealhq.com',
    baseUrl: 'https://www.tealhq.com',
    sitemapIndex: 'https://www.tealhq.com/sitemap-index.xml',
    useBrowser: true
  }
]

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false
})

const normalizeArray = value => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

async function fetchText(url, browser = null) {
  if (browser) {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      viewport: {
        width: 1366,
        height: 768
      }
    })

    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })

      if (!response || !response.ok()) {
        throw new Error(`HTTP ${response?.status() || 'Unknown'}: ${url}`)
      }

      return (await response.body()).toString('utf8')
    } finally {
      await page.close()
    }
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
      Accept: 'application/xml,text/xml,*/*'
    },
    signal: AbortSignal.timeout(30000)
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`)
  }

  return response.text()
}

async function discoverSitemaps(competitor) {
  if (competitor.sitemapIndex) {
    return [competitor.sitemapIndex]
  }

  const robots = await fetchText(
    `${competitor.baseUrl}/robots.txt`
  ).catch(() => '')

  const declared = robots
    .split(/\r?\n/)
    .filter(line => /^sitemap:/i.test(line.trim()))
    .map(line => line.trim().replace(/^sitemap:\s*/i, ''))

  const fallback = [
    `${competitor.baseUrl}/sitemap.xml`,
    `${competitor.baseUrl}/sitemap-index.xml`,
    `${competitor.baseUrl}/sitemap_index.xml`,
    `${competitor.baseUrl}/sitemap-tools.xml`
  ]

  return [...new Set([...declared, ...fallback])]
}

function getCategory(url, sitemap) {
  const pathname = new URL(url).pathname.toLowerCase()
  const source = (sitemap || '').toLowerCase()

  if (
    source.includes('sitemap-teal-jobs-') ||
    /\/jobs?\/[^/?]+/.test(pathname) ||
    /\/job-listings?\/[^/?]+/.test(pathname)
  ) {
    return 'jobListings'
  }

  return 'seoPages'
}

async function readSitemap(url, results, visited, errors, browser = null, depth = 0) {
  if (visited.has(url) || depth > 5 || visited.size >= 500) return

  if (/sitemap-teal-jobs-/i.test(url)) return

  visited.add(url)
  console.log(`[${visited.size}] Processing: ${url}`)

  try {
    const xml = await fetchText(url, browser)
    const data = parser.parse(xml)

    if (data.sitemapindex) {
      const children = normalizeArray(data.sitemapindex.sitemap)
        .filter(child => child.loc)
        .filter(child => !/sitemap-teal-jobs-/i.test(child.loc))

      console.log(`Found ${children.length} SEO sitemap files`)

      for (let i = 0; i < children.length; i += CONCURRENCY) {
        const batch = children.slice(i, i + CONCURRENCY)

        await Promise.all(
          batch.map(child =>
            readSitemap(child.loc, results, visited, errors, browser, depth + 1)
          )
        )
      }

      return
    }

    if (data.urlset) {
      const urls = normalizeArray(data.urlset.url)
      let collected = 0

      for (const item of urls) {
        if (!item.loc) continue

        const category = getCategory(item.loc, url)

        if (category !== 'seoPages') continue

        results.set(item.loc, {
          lastmod: item.lastmod || null,
          sitemap: url,
          category
        })

        collected++
      }

      console.log(`Collected ${collected} SEO URLs. Total: ${results.size}`)
    }
  } catch (error) {
    errors.push({
      sitemap: url,
      message: error.message
    })

    console.log(`Failed: ${url} - ${error.message}`)
  }
}

async function collectUrls(competitor) {
  let browser = null

  try {
    if (competitor.useBrowser) {
      browser = await chromium.launch({ headless: true })
    }

    const sitemapUrls = await discoverSitemaps(competitor)
    const results = new Map()
    const visited = new Set()
    const errors = []

    for (let i = 0; i < sitemapUrls.length; i += CONCURRENCY) {
      const batch = sitemapUrls.slice(i, i + CONCURRENCY)

      await Promise.all(
        batch.map(url =>
          readSitemap(url, results, visited, errors, browser)
        )
      )
    }

    if (!results.size) {
      throw new Error(
        `No SEO URLs collected for ${competitor.name}. ${JSON.stringify(errors)}`
      )
    }

    return {
      urls: results,
      sitemapCount: visited.size,
      errors
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

function loadDatabase() {
  if (!fs.existsSync(DATA_PATH)) {
    return {
      lastChecked: null,
      competitors: {},
      history: []
    }
  }

  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
}

function canConfirmDeletions(competitor, errors) {
  return errors.every(error => {
    const expectedAiApply404s = [
      `${competitor.baseUrl}/sitemap-index.xml`,
      `${competitor.baseUrl}/sitemap_index.xml`
    ]

    return (
      competitor.id === 'aiapply' &&
      expectedAiApply404s.includes(error.sitemap) &&
      error.message.startsWith('HTTP 404:')
    )
  })
}

async function monitorCompetitor(competitor, database) {
  console.log(`Checking ${competitor.name}...`)

  const result = await collectUrls(competitor)
  const existing = database.competitors[competitor.id]

  const now = new Date().toISOString()

  const urls = Object.fromEntries(
    Object.entries(existing?.urls || {}).filter(
      ([url, metadata]) => getCategory(url, metadata.sitemap) === 'seoPages'
    )
  )

  const isInitialized = existing?.initialized === true
  let newSeoCount = 0

  for (const [url, metadata] of result.urls) {
    if (!urls[url]) {
      urls[url] = {
        firstSeen: now,
        lastSeen: now,
        lastmod: metadata.lastmod,
        sitemap: metadata.sitemap,
        category: 'seoPages'
      }

      if (isInitialized) {
        database.history.unshift({
          url,
          competitor: competitor.name,
          competitorId: competitor.id,
          category: 'seoPages',
          detectedAt: now,
          status: 'new'
        })

        newSeoCount++
      }
    } else {
      urls[url].lastSeen = now
      urls[url].lastmod = metadata.lastmod
      urls[url].sitemap = metadata.sitemap
      urls[url].category = 'seoPages'
    }
  }

  let removedSeoCount = 0

  if (canConfirmDeletions(competitor, result.errors)) {
    for (const url of Object.keys(urls)) {
      if (!result.urls.has(url)) {
        delete urls[url]

        database.history.unshift({
          url,
          competitor: competitor.name,
          competitorId: competitor.id,
          category: 'seoPages',
          detectedAt: now,
          status: 'removed'
        })

        removedSeoCount++
      }
    }
  }

  database.competitors[competitor.id] = {
    name: competitor.name,
    domain: competitor.domain,
    lastChecked: now,
    totalUrls: result.urls.size,
    sitemapCount: result.sitemapCount,
    seoPages: result.urls.size,
    jobListings: 0,
    newSeoPages: newSeoCount,
    newJobListings: 0,
    initialized: true,
    urls
  }

  console.log(`${competitor.name}:`)
  console.log(`  SEO pages: ${result.urls.size} (${newSeoCount} new)`)
  console.log(`  Removed SEO pages: ${removedSeoCount}`)
  console.log(`  Job listings: excluded`)
  console.log(`  Total SEO URLs: ${result.urls.size}`)
  console.log(`  Sitemaps checked: ${result.sitemapCount}`)

  if (result.errors.length) {
    console.log(`  Sitemap errors: ${result.errors.length}`)

    result.errors.slice(0, 5).forEach(error => {
      console.log(`  - ${error.message}`)
    })
  }

  return result.errors
}

async function main() {
  const database = loadDatabase()

  database.history = (database.history || []).filter(
    item => item.category !== 'jobListings'
  )

  for (const competitor of COMPETITORS) {
    try {
      await monitorCompetitor(competitor, database)
    } catch (error) {
      console.error(`${competitor.name}: ${error.message}`)
    }
  }

  database.lastChecked = new Date().toISOString()
  database.history = database.history.slice(0, 5000)

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true })

  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify(database, null, 2)
  )

  console.log('SEO monitoring completed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
