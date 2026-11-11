
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const DATA_FILE = path.join(ROOT, 'static', 'data', 'competitor-monitor.json')
const SENDER_INBOX = 'competitor-reports@agentmail.to'

const RECIPIENTS = [
  'g.avgenakis@loopcv.com',
  'lucas@loopcv.com',
  'prafull@outsmartt.com',
  'ayushi.roy@outsmartt.com',
  'pandelisan28@outlook.com'
]

const MAX_URLS_PER_SECTION = 30

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'))
}

function eventKey(entry) {
  return JSON.stringify([
    entry.competitorId || entry.competitor,
    entry.status,
    entry.url,
    entry.detectedAt
  ])
}

function newEvents(previous, current) {
  const known = new Set((previous.history || []).map(eventKey))

  return (current.history || []).filter(event =>
    (event.status === 'new' || event.status === 'removed') &&
    event.category !== 'jobListings' &&
    !known.has(eventKey(event))
  )
}

function formatUrls(title, events) {
  if (!events.length) return []

  const shown = events.slice(0, MAX_URLS_PER_SECTION)

  const lines = [
    `${title}: ${events.length}`,
    ...shown.map(event => `  - ${event.url}`)
  ]

  if (events.length > shown.length) {
    lines.push(`  ... and ${events.length - shown.length} more`)
  }

  return lines
}

function makeReport(previous, current) {
  const events = newEvents(previous, current)
  const added = events.filter(e => e.status === 'new')
  const removed = events.filter(e => e.status === 'removed')

  const competitors = Object.entries(current.competitors || {})
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const date = current.lastChecked || new Date().toISOString()

  const errors = competitors.flatMap(competitor =>
    (Array.isArray(competitor.sitemapErrors)
      ? competitor.sitemapErrors
      : []
    ).map(error => ({
      competitor: competitor.name,
      message: error && typeof error === 'object'
        ? error.message || 'Unknown sitemap error'
        : String(error)
    }))
  )

  const subject = `[Competitor SEO] Daily Report - ${date.slice(0, 10)} | ${added.length} new, ${removed.length} removed`

  const body = [
    'COMPETITOR SEO MONITORING - DAILY REPORT',
    `Scan completed: ${date}`,
    '',
    '========================================',
    'CHANGES BY COMPETITOR',
    '========================================'
  ]

  if (added.length === 0 && removed.length === 0) {
    body.push(
      '',
      'No SEO changes detected in the latest scan.'
    )
  }

  for (const competitor of competitors) {
    const competitorEvents = events.filter(event =>
      event.competitorId === competitor.id ||
      (
        !event.competitorId &&
        event.competitor === competitor.name
      )
    )

    const newPages = competitorEvents.filter(e => e.status === 'new')
    const removedPages = competitorEvents.filter(e => e.status === 'removed')

    const previousCompetitor = previous.competitors?.[competitor.id]
    const wasUpdated = competitor.lastChecked !== previousCompetitor?.lastChecked

    body.push(
      '',
      `${competitor.name} (${competitor.domain})`
    )

    if (!wasUpdated) {
      body.push('No new scan results available for this competitor.')
    } else if (!newPages.length && !removedPages.length) {
      body.push('No changes detected.')
    } else {
      body.push(...formatUrls('New SEO Pages', newPages))
      body.push(...formatUrls('Removed SEO Pages', removedPages))
    }

    const competitorErrors = Array.isArray(competitor.sitemapErrors)
      ? competitor.sitemapErrors
      : []

    if (competitorErrors.length) {
      body.push(`Sitemap Errors: ${competitorErrors.length}`)

      for (const error of competitorErrors.slice(0, 5)) {
        body.push(`  - ${error.message || String(error)}`)
      }

      if (competitorErrors.length > 5) {
        body.push(`  ... and ${competitorErrors.length - 5} more errors`)
      }
    }
  }

  const totalPages = competitors.reduce(
    (sum, competitor) =>
      sum + (Number(competitor.monitoredUrls) || 0),
    0
  )

  body.push(
    '',
    '========================================',
    'SUMMARY',
    '========================================',
    `Competitors with available results: ${competitors.length}`,
    `Total monitored SEO pages: ${totalPages}`,
    `New SEO pages: ${added.length}`,
    `Removed SEO pages: ${removed.length}`,
    `Sitemap errors: ${errors.length}`,
    '',
    '========================================',
    'ALL COMPETITORS WE TRACK',
    '========================================'
  )

  for (const competitor of competitors) {
    body.push(`- ${competitor.name} - ${competitor.domain}`)
  }

  body.push(
    '',
    '========================================',
    'HOW THIS REPORT WORKS',
    '========================================',
    'We compare competitor sitemaps with the previous scan to',
    'identify new and removed SEO URLs. Job listings are excluded.',
    '',
    'Changes that appear and disappear between scans may not be detected.',
    '',
    'Sent automatically via AgentMail.'
  )

  return {
    subject,
    text: body.join('\n'),
    added: added.length,
    removed: removed.length,
    errors: errors.length
  }
}

async function main() {
  const beforeFile = process.env.MONITOR_BEFORE_PATH

  if (!beforeFile || !fs.existsSync(beforeFile)) {
    throw new Error(
      'Missing previous-scan snapshot (MONITOR_BEFORE_PATH).'
    )
  }

  const previous = readJson(beforeFile)
  const current = readJson(DATA_FILE)
  const report = makeReport(previous, current)

  if (process.env.DRY_RUN === 'true') {
    console.log(report.subject)
    console.log(report.text)
    console.log('DRY_RUN: no email sent.')
    return
  }

  const key = process.env.AGENTMAIL_API_KEY

  if (!key) {
    throw new Error('AGENTMAIL_API_KEY is not set.')
  }

  const endpoint =
    `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(SENDER_INBOX)}/messages/send`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: RECIPIENTS,
      subject: report.subject,
      text: report.text
    }),
    signal: AbortSignal.timeout(30000)
  })

  if (!response.ok) {
    throw new Error(
      `AgentMail request failed (HTTP ${response.status}).`
    )
  }

  console.log(
    `AgentMail daily report sent to ${RECIPIENTS.length} recipients.`
  )
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Email report failed: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = { newEvents, makeReport }
