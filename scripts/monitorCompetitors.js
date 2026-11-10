
const fs = require('fs')
const path = require('path')
const { XMLParser } = require('fast-xml-parser')
const { chromium } = require('playwright')
const { readExtraCompetitors, readDisabledCompetitors } = require('./competitorConfig.cjs')

const DATA_PATH = path.join(__dirname, '../static/data/competitor-monitor.json')
const CONCURRENCY = 5
const REQUEST_TIMEOUT = 45000
const MAX_SITEMAPS = 500
const MAX_DEPTH = 5
const MONITORING_CONFIG_VERSION = 1

const BUILTIN_COMPETITORS = require('./builtinCompetitors.cjs')
const DISABLED_COMPETITOR_IDS = new Set(readDisabledCompetitors())
const ADDITIONAL_COMPETITORS = readExtraCompetitors(BUILTIN_COMPETITORS)
  .filter(item => !DISABLED_COMPETITOR_IDS.has(item.id))
const COMPETITORS = BUILTIN_COMPETITORS
  .filter(item => !DISABLED_COMPETITOR_IDS.has(item.id))
  .concat(ADDITIONAL_COMPETITORS)

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
        timeout: REQUEST_TIMEOUT
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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`)
  }

  return response.text()
}

async function discoverSitemaps(competitor) {
  if (competitor.sitemapIndex) {
    return [
      {
        url: competitor.sitemapIndex,
        optional: false
      }
    ]
  }

  const robots = await fetchText(
    `${competitor.baseUrl}/robots.txt`
  ).catch(() => '')

  const declared = robots
    .split(/\r?\n/)
    .filter(line => /^sitemap:/i.test(line.trim()))
    .map(line => line.trim().replace(/^sitemap:\s*/i, ''))

  if (declared.length) {
    return [...new Set(declared)].map(url => ({
      url,
      optional: false
    }))
  }

  const fallback = [
    `${competitor.baseUrl}/sitemap.xml`,
    `${competitor.baseUrl}/sitemap-index.xml`,
    `${competitor.baseUrl}/sitemap_index.xml`,
    `${competitor.baseUrl}/sitemap-tools.xml`
  ]

  return [...new Set(fallback)].map(url => ({
    url,
    optional: true
  }))
}

function getCategory(url, sitemap) {
  let pathname

  try {
    pathname = new URL(url).pathname.toLowerCase()
  } catch {
    return 'jobListings'
  }

  const source = (sitemap || '').toLowerCase()

  if (
    /postings_\d+\.xml/i.test(source) ||
    /latest-jobs\.xml/i.test(source) ||
    /job-listings?\.xml/i.test(source) ||
    source.includes('sitemap-teal-jobs-') ||
    /\/jobs?\/[^/?]+/.test(pathname) ||
    /\/job-listings?\/[^/?]+/.test(pathname)
  ) {
    return 'jobListings'
  }

  return 'seoPages'
}

function getPageGroup(url) {
  try {
    const parts = new URL(url).pathname
      .toLowerCase()
      .split('/')
      .filter(Boolean)

    return parts[0] || 'homepage'
  } catch {
    return 'unknown'
  }
}

function getStableHash(value) {
  let hash = 2166136261

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function selectMonitoredUrls(discoveredUrls, competitor) {
  if (!competitor.sampleLimits) {
    return new Map(discoveredUrls)
  }

  const groups = new Map()

  for (const [url, metadata] of discoveredUrls) {
    const group = getPageGroup(url)

    if (!groups.has(group)) {
      groups.set(group, [])
    }

    groups.get(group).push([url, metadata])
  }

  const monitoredUrls = new Map()
  const groupCounts = {}

  for (const [group, entries] of groups) {
    const limit = competitor.sampleLimits[group]

    if (Number.isFinite(limit) && entries.length > limit) {
      entries.sort((a, b) => {
        return getStableHash(a[0]) - getStableHash(b[0])
      })

      entries.splice(limit)
    }

    groupCounts[group] = {
      discovered: groups.get(group).length,
      monitored: entries.length
    }

    for (const [url, metadata] of entries) {
      monitoredUrls.set(url, metadata)
    }
  }

  return {
    urls: monitoredUrls,
    groupCounts
  }
}

async function readSitemaps(initialSitemaps, results, errors, browser = null) {
  const queue = initialSitemaps.map(item => ({
    url: item.url,
    optional: item.optional,
    depth: 0
  }))

  const queued = new Set(queue.map(item => item.url))
  const visited = new Set()

  let successfulSitemaps = 0

  while (queue.length && visited.size < MAX_SITEMAPS) {
    const batch = []

    while (
      batch.length < CONCURRENCY &&
      queue.length &&
      visited.size + batch.length < MAX_SITEMAPS
    ) {
      const item = queue.shift()

      if (visited.has(item.url)) continue

      visited.add(item.url)
      batch.push(item)
    }

    const responses = await Promise.all(
      batch.map(async item => {
        console.log(`[${visited.size}] Processing: ${item.url}`)

        try {
          const xml = await fetchText(item.url, browser)
          const parsed = parser.parse(xml)

          successfulSitemaps++

          return {
            item,
            parsed
          }
        } catch (error) {
          const isOptional404 =
            item.optional &&
            error.message.startsWith('HTTP 404:')

          if (isOptional404) {
            console.log(`Optional sitemap not found: ${item.url}`)
          } else {
            errors.push({
              sitemap: item.url,
              message: error.message
            })

            console.log(`Failed: ${item.url} - ${error.message}`)
          }

          return null
        }
      })
    )

    for (const response of responses) {
      if (!response) continue

      const { item, parsed } = response

      if (parsed.sitemapindex) {
        const children = normalizeArray(parsed.sitemapindex.sitemap)
          .filter(child => child.loc)
          .filter(child => !/sitemap-teal-jobs-/i.test(child.loc))

        console.log(`Found ${children.length} sitemap files`)

        for (const child of children) {
          const childUrl = child.loc

          if (/\/blog\/sitemap\/(posts|tags|authors)\.xml/i.test(childUrl)) {
            continue
          }

          if (
            !queued.has(childUrl) &&
            !visited.has(childUrl) &&
            item.depth < MAX_DEPTH
          ) {
            queued.add(childUrl)

            queue.push({
              url: childUrl,
              optional: false,
              depth: item.depth + 1
            })
          }
        }
      }

      if (parsed.urlset) {
        const urls = normalizeArray(parsed.urlset.url)
        let collected = 0

        for (const entry of urls) {
          if (!entry.loc) continue

          const category = getCategory(entry.loc, item.url)

          if (category !== 'seoPages') continue

          results.set(entry.loc, {
            lastmod: entry.lastmod || null,
            sitemap: item.url,
            category
          })

          collected++
        }

        console.log(`Discovered ${collected} SEO URLs. Total: ${results.size}`)
      }
    }
  }

  if (queue.length) {
    errors.push({
      sitemap: 'Sitemap processing limit',
      message: `Maximum sitemap limit of ${MAX_SITEMAPS} reached. ${queue.length} sitemap files remain unprocessed.`
    })
  }

  return successfulSitemaps
}

async function collectUrls(competitor) {
  let browser = null

  try {
    if (competitor.useBrowser) {
      browser = await chromium.launch({
        headless: true
      })
    }

    const sitemapUrls = await discoverSitemaps(competitor)
    const discoveredUrls = new Map()
    const errors = []

    const sitemapCount = await readSitemaps(
      sitemapUrls,
      discoveredUrls,
      errors,
      browser
    )

    if (!discoveredUrls.size) {
      throw new Error(
        `No SEO URLs collected for ${competitor.name}. ${JSON.stringify(errors)}`
      )
    }

    const selection = selectMonitoredUrls(
      discoveredUrls,
      competitor
    )

    const monitoredUrls = selection.urls || selection

    return {
      urls: monitoredUrls,
      discoveredUrls,
      groupCounts: selection.groupCounts || {},
      sitemapCount,
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

  const database = JSON.parse(
    fs.readFileSync(DATA_PATH, 'utf8')
  )

  database.competitors = database.competitors || {}

  database.history = Array.isArray(database.history)
    ? database.history
    : []

  return database
}

function canConfirmDeletions(errors) {
  return errors.length === 0
}

async function monitorCompetitor(competitor, database) {
  console.log(`Checking ${competitor.name}...`)

  const result = await collectUrls(competitor)
  const existing = database.competitors[competitor.id]
  const now = new Date().toISOString()

  const previousUrls = existing?.urls || {}
  const existingUrlSet = new Set(Object.keys(previousUrls))
  const isInitialized = existing?.initialized === true

  const isSamplingMigration =
    Boolean(competitor.sampleLimits) &&
    existing?.monitoringConfigVersion !== MONITORING_CONFIG_VERSION

  const urls = {}
  const monitoredUrlSet = new Set(result.urls.keys())

  let newSeoCount = 0

  for (const [url, metadata] of result.urls) {
    const previous = previousUrls[url]

    if (!previous) {
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
      urls[url] = {
        ...previous,
        lastSeen: now,
        lastmod: metadata.lastmod,
        sitemap: metadata.sitemap,
        category: 'seoPages'
      }
    }
  }

  let removedSeoCount = 0

  if (isSamplingMigration) {
    console.log(
      `${competitor.name}: sampling configuration applied. Existing URLs outside the sample will not be reported as deleted.`
    )
  } else if (canConfirmDeletions(result.errors)) {
    for (const url of existingUrlSet) {
      if (
        !result.discoveredUrls.has(url) &&
        !isSamplingMigration
      ) {
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
  } else {
    console.log(
      `Deletion detection skipped for ${competitor.name} because sitemap errors occurred.`
    )
  }

  const competitorData = {
    name: competitor.name,
    domain: competitor.domain,
    lastChecked: now,
    totalUrls: result.discoveredUrls.size,
    sitemapCount: result.sitemapCount,
    seoPages: result.discoveredUrls.size,
    monitoredUrls: result.urls.size,
    jobListings: 0,
    newSeoPages: newSeoCount,
    newJobListings: 0,
    sitemapErrors: result.errors,
    initialized: true,
    urls
  }

  if (competitor.sampleLimits) {
    competitorData.monitoringConfigVersion = MONITORING_CONFIG_VERSION
    competitorData.samplingLimits = competitor.sampleLimits
    competitorData.urlCountsByGroup = result.groupCounts
  }

  database.competitors[competitor.id] = competitorData

  console.log(`${competitor.name}:`)
  console.log(`  Discovered SEO pages: ${result.discoveredUrls.size}`)
  console.log(`  Monitored SEO pages: ${result.urls.size} (${newSeoCount} new)`)
  console.log(`  Removed SEO pages: ${removedSeoCount}`)
  console.log(`  Job listings: excluded`)
  console.log(`  Sitemaps checked: ${result.sitemapCount}`)

  if (competitor.sampleLimits) {
    console.log('  Sampling by category:')

    for (const [group, counts] of Object.entries(result.groupCounts)) {
      console.log(
        `    ${group}: ${counts.monitored}/${counts.discovered}`
      )
    }
  }

  if (result.errors.length) {
    console.log(`  Sitemap errors: ${result.errors.length}`)

    result.errors.slice(0, 5).forEach(error => {
      console.log(`  - ${error.message}`)
    })
  }

  return result.errors
}

function saveDatabase(database) {
  fs.mkdirSync(path.dirname(DATA_PATH), {
    recursive: true
  })

  const temporaryPath = `${DATA_PATH}.tmp`

  fs.writeFileSync(
    temporaryPath,
    JSON.stringify(database, null, 2)
  )

  fs.renameSync(temporaryPath, DATA_PATH)
}

async function main() {
  const database = loadDatabase()

  // Newly approved competitors appear in the dashboard even if their first scan fails.
  for (const competitor of ADDITIONAL_COMPETITORS) {
    if (!database.competitors[competitor.id]) {
      database.competitors[competitor.id] = {
        name: competitor.name,
        domain: competitor.domain,
        initialized: false,
        lastChecked: null,
        urls: {},
        newSeoPages: 0,
        sitemapErrors: []
      }
    }
  }

  database.history = database.history.filter(
    item => item.category !== 'jobListings'
  )

  for (const competitor of COMPETITORS) {
    if (competitor.scanEnabled === false) {
      console.log(
        `${competitor.name}: automated scanning disabled pending permission.`
      )
      continue
    }

    try {
      await monitorCompetitor(competitor, database)
    } catch (error) {
      console.error(`${competitor.name}: ${error.message}`)
      if (ADDITIONAL_COMPETITORS.some(item => item.id === competitor.id)) {
        database.competitors[competitor.id].sitemapErrors = [error.message]
      }
    }
  }

  database.lastChecked = new Date().toISOString()

  saveDatabase(database)

  console.log('SEO monitoring completed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
