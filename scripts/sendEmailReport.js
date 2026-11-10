'use strict'

// Sends a change-based competitor SEO monitoring report using AgentMail.
// No third-party Node dependency is required (Node.js 20+).
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
  return JSON.stringify([entry.competitorId || entry.competitor, entry.status, entry.url, entry.detectedAt])
}

function newEvents(previous, current) {
  const known = new Set((previous.history || []).map(eventKey))
  return (current.history || []).filter(event =>
    (event.status === 'new' || event.status === 'removed') &&
    event.category !== 'jobListings' &&
    !known.has(eventKey(event))
  )
}

function formatSection(title, events) {
  if (!events.length) return `${title}: 0`
  const shown = events.slice(0, MAX_URLS_PER_SECTION)
  const lines = shown.map(event => `- ${event.competitor || event.competitorId || 'Unknown'}: ${event.url}`)
  if (events.length > shown.length) lines.push(`... and ${events.length - shown.length} more`)
  return `${title}: ${events.length}\n${lines.join('\n')}`
}

function makeReport(previous, current) {
  const events = newEvents(previous, current)
  const added = events.filter(event => event.status === 'new')
  const removed = events.filter(event => event.status === 'removed')
  const competitors = Object.values(current.competitors || {})
  const errors = competitors.flatMap(c =>
    (Array.isArray(c.sitemapErrors) ? c.sitemapErrors : []).map(e => ({
      competitor: c.name || c.domain || 'Unknown',
      message: (typeof e === 'object' && e !== null ? e.message : String(e)) || 'Unknown sitemap error'
    }))
  )
  const date = current.lastChecked || new Date().toISOString()
  const subject = `[Competitor SEO] ${added.length} new, ${removed.length} removed${errors.length ? `, ${errors.length} errors` : ''} — ${date.slice(0, 10)}`
  const body = [
    'Competitor SEO Monitoring Report',
    `Scan completed: ${date}`,
    `Competitors scanned (available results): ${competitors.length}`,
    `Total monitored SEO pages: ${competitors.reduce((sum, c) => sum + (Number(c.monitoredUrls) || 0), 0)}`,
    '',
    formatSection('New SEO pages', added),
    '',
    formatSection('Removed SEO pages', removed),
    '',
    `Sitemap errors: ${errors.length}`,
    ...errors.slice(0, 15).map(e => `- ${e.competitor}: ${e.message}`),
    ...(errors.length > 15 ? [`... and ${errors.length - 15} more errors`] : []),
    '',
    'This report is based on changes detected by the latest automated sitemap scan.',
    'Sent automatically via AgentMail.'
  ].join('\n')
  return { subject, text: body, added: added.length, removed: removed.length, errors: errors.length }
}

async function main() {
  const beforeFile = process.env.MONITOR_BEFORE_PATH
  if (!beforeFile || !fs.existsSync(beforeFile)) {
    throw new Error('Missing previous-scan snapshot (MONITOR_BEFORE_PATH). Refusing to send a potentially inaccurate report.')
  }
  const previous = readJson(beforeFile)
  const current = readJson(DATA_FILE)
  const report = makeReport(previous, current)

  if (!report.added && !report.removed && !report.errors && process.env.FORCE_EMAIL_REPORT !== 'true') {
    console.log('No new/removed SEO pages or sitemap errors; skipping email.')
    return
  }

  // Run locally without transmitting messages: DRY_RUN=true node scripts/sendEmailReport.js
  if (process.env.DRY_RUN === 'true') {
    console.log(report.subject)
    console.log(report.text)
    console.log('DRY_RUN: no email sent.')
    return
  }

  const key = process.env.AGENTMAIL_API_KEY
  if (!key) throw new Error('AGENTMAIL_API_KEY is not set.')

  const endpoint = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(SENDER_INBOX)}/messages/send`
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
    // Don't dump response bodies, which could contain sensitive account information.
    throw new Error(`AgentMail request failed (HTTP ${response.status}).`)
  }
  console.log(`AgentMail report sent to ${RECIPIENTS.length} recipients.`)
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Email report failed: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = { newEvents, makeReport }

