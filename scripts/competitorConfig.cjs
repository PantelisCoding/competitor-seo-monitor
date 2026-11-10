'use strict'

const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')

const CONFIG_PATH = path.join(__dirname, '../static/data/extra-competitors.json')

function parseHttpsUrl(value, label) {
  let url
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new Error(label + ' must be a valid HTTPS URL')
  }
  const host = url.hostname.toLowerCase()
  const hostLabels = host.split('.')
  const blocked = new Set(['local', 'localhost', 'internal', 'test', 'invalid', 'example'])
  if (
    url.protocol !== 'https:' ||
    url.username || url.password || url.port ||
    net.isIP(host) ||
    hostLabels.length < 2 ||
    hostLabels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    blocked.has(hostLabels[hostLabels.length - 1])
  ) {
    throw new Error(label + ' must use a public HTTPS domain')
  }
  return url
}

function normalizeCompetitor({ name, website, sitemap = '' }) {
  const competitorName = String(name || '').trim()
  if (!competitorName || competitorName.length > 80 || /[\u0000-\u001f\u007f]/.test(competitorName)) {
    throw new Error('Competitor name must be 1-80 characters on one line')
  }
  const site = parseHttpsUrl(website, 'Website URL')
  const domain = site.hostname.toLowerCase().replace(/^www\./, '')
  const id = domain.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!id || id.length > 90) throw new Error('Invalid competitor domain')

  const result = { id, name: competitorName, domain, baseUrl: site.origin }
  if (sitemap && String(sitemap).trim() !== 'auto') {
    const siteMapUrl = parseHttpsUrl(sitemap, 'Sitemap URL')
    const sitemapHost = siteMapUrl.hostname.toLowerCase().replace(/^www\./, '')
    if (sitemapHost !== domain && !sitemapHost.endsWith('.' + domain)) {
      throw new Error('Sitemap URL must belong to the competitor domain')
    }
    result.sitemapIndex = siteMapUrl.href
  }
  return result
}

function assertUnique(candidate, existing) {
  const candidateDomain = candidate.domain.replace(/^www\./, '').toLowerCase()
  if (existing.some(entry =>
    entry.id === candidate.id ||
    String(entry.domain || '').replace(/^www\./, '').toLowerCase() === candidateDomain
  )) {
    throw new Error('Competitor already exists: ' + candidate.domain)
  }
}

function readExtraCompetitors(existing = [], configPath = CONFIG_PATH) {
  if (!fs.existsSync(configPath)) return []
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  if (!Array.isArray(parsed)) throw new Error('extra-competitors.json must be an array')
  const extras = []
  for (const entry of parsed) {
    const canonical = normalizeCompetitor({
      name: entry.name,
      website: entry.baseUrl,
      sitemap: entry.sitemapIndex || ''
    })
    if (canonical.id !== entry.id || canonical.domain !== entry.domain) {
      throw new Error('Invalid saved competitor configuration: ' + entry.id)
    }
    assertUnique(canonical, existing.concat(extras))
    extras.push(canonical)
  }
  return extras
}

module.exports = { CONFIG_PATH, normalizeCompetitor, assertUnique, readExtraCompetitors }
