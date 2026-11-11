'use strict'

// Runtime-only server code. Never import this module into the Vite client bundle.
const crypto = require('node:crypto')
const { normalizeCompetitor, assertUnique } = require('../scripts/competitorConfig.cjs')
const builtins = require('../scripts/builtinCompetitors.cjs')

const EXTRAS_FILE = 'static/data/extra-competitors.json'
const DISABLED_FILE = 'static/data/disabled-competitors.json'
const SESSION_COOKIE = 'competitor_admin_session'
const STATE_COOKIE = 'competitor_oauth_state'

function settings(env = process.env) {
  const required = [
    'PUBLIC_BASE_URL', 'GITHUB_REPO', 'GITHUB_TOKEN',
    'GITHUB_OAUTH_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_SECRET',
    'SESSION_SECRET', 'ADMIN_GITHUB_LOGINS'
  ]
  for (const key of required) {
    if (!env[key]) throw new Error('Missing server setting: ' + key)
  }
  if (env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters')
  const base = new URL(env.PUBLIC_BASE_URL)
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('PUBLIC_BASE_URL must be an HTTPS origin with a trailing slash')
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO)) throw new Error('Invalid GITHUB_REPO')
  const admins = env.ADMIN_GITHUB_LOGINS.split(',').map(name => name.trim().toLowerCase()).filter(Boolean)
  if (!admins.length) throw new Error('No administrator GitHub logins configured')
  return {
    base: base.origin, repo: env.GITHUB_REPO,
    branch: env.GITHUB_BRANCH || 'main', token: env.GITHUB_TOKEN,
    clientId: env.GITHUB_OAUTH_CLIENT_ID,
    clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
    secret: env.SESSION_SECRET, admins
  }
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  })
}
function redirect(url, cookie) {
  return new Response(null, {
    status: 302,
    headers: { Location: url, 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) }
  })
}
function cookie(name, value, lifetime) {
  return name + '=' + value + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + lifetime
}
function cookies(req) {
  const result = {}
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0) result[part.slice(0, index).trim()] = part.slice(index + 1).trim()
  }
  return result
}
function signature(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}
function createSession(user, secret, now = Date.now()) {
  const value = Buffer.from(JSON.stringify({
    id: user.id, login: user.login, exp: now + 8 * 60 * 60 * 1000
  })).toString('base64url')
  return value + '.' + signature(value, secret)
}
function readSession(req, secret, now = Date.now()) {
  const session = cookies(req)[SESSION_COOKIE]
  if (!session) return null
  const [body, mac, ...more] = session.split('.')
  if (!body || !mac || more.length) return null
  const expected = Buffer.from(signature(body, secret))
  const received = Buffer.from(mac)
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (!Number.isSafeInteger(data.id) || !/^[a-z0-9-]+$/i.test(data.login) ||
      !Number.isSafeInteger(data.exp) || now >= data.exp) return null
    return data
  } catch { return null }
}
function requireSameOrigin(req, base) {
  const origin = req.headers.get('origin')
  return origin === base
}
async function github(path, options, config, fetcher = fetch) {
  const response = await fetcher('https://api.github.com' + path, {
    method: options.method || 'GET',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + (options.token || config.token),
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'competitor-seo-monitor-backend',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  })
  const text = await response.text()
  let value
  try { value = text ? JSON.parse(text) : {} } catch { value = {} }
  return { status: response.status, ok: response.ok, body: value }
}
async function canEdit(login, config, fetcher = fetch) {
  if (!config.admins.includes(login.toLowerCase())) return false
  const r = await github('/repos/' + config.repo + '/collaborators/' +
    encodeURIComponent(login) + '/permission', {}, config, fetcher)
  return r.ok && ['admin', 'write', 'maintain'].includes(r.body.permission)
}
async function requireAdmin(req, config, fetcher = fetch) {
  const user = readSession(req, config.secret)
  if (!user || !(await canEdit(user.login, config, fetcher))) return null
  return user
}
async function readConfig(file, config, fetcher = fetch) {
  const p = '/repos/' + config.repo + '/contents/' + file + '?ref=' + encodeURIComponent(config.branch)
  const response = await github(p, {}, config, fetcher)
  if (!response.ok) throw new Error('Cannot load GitHub config ' + file + ': ' + response.status)
  const data = response.body
  if (!data.sha || data.encoding !== 'base64' || typeof data.content !== 'string') {
    throw new Error('GitHub returned an unsupported config file')
  }
  const entries = JSON.parse(Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8'))
  if (!Array.isArray(entries)) throw new Error('Invalid GitHub config file format')
  return { sha: data.sha, entries }
}
async function updateConfig(file, change, config, fetcher = fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await readConfig(file, config, fetcher)
    const updated = change(latest.entries)
    if (updated === null) return { unchanged: true }
    const response = await github('/repos/' + config.repo + '/contents/' + file, {
      method: 'PUT',
      body: {
        message: 'Update competitors via authenticated dashboard',
        branch: config.branch,
        sha: latest.sha,
        content: Buffer.from(JSON.stringify(updated, null, 2) + '\n').toString('base64')
      }
    }, config, fetcher)
    if (response.ok) return { unchanged: false }
    if (![409, 422].includes(response.status)) {
      throw new Error('GitHub rejected config update: ' + response.status)
    }
  }
  throw new Error('Concurrent changes detected; retry the operation')
}
function validateDisabled(entries) {
  if (entries.some(x => typeof x !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x))) {
    throw new Error('Invalid disabled competitor configuration')
  }
  return [...new Set(entries)]
}
function validateExtras(entries) {
  const result = []
  for (const item of entries) {
    const valid = normalizeCompetitor({
      name: item.name, website: item.baseUrl, sitemap: item.sitemapIndex || ''
    })
    if (item.id !== valid.id || item.domain !== valid.domain) throw new Error('Invalid competitor configuration')
    assertUnique(valid, builtins.concat(result))
    result.push(valid)
  }
  return result
}
async function handleCompetitors(req, env = process.env, fetcher = fetch) {
  try {
    const config = settings(env)
    const user = await requireAdmin(req, config, fetcher)
    if (!user) return json(401, { error: 'Sign in with an authorized GitHub account.' })
    const method = req.method.toUpperCase()
    if (method === 'GET') {
      const [extras, disabled] = await Promise.all([
        readConfig(EXTRAS_FILE, config, fetcher),
        readConfig(DISABLED_FILE, config, fetcher)
      ])
      const excluded = validateDisabled(disabled.entries)
      return json(200, { competitors: validateExtras(extras.entries).filter(x => !excluded.includes(x.id)), disabledIds: excluded })
    }
    if (!['POST', 'DELETE'].includes(method)) return json(405, { error: 'Unsupported method' }, { Allow: 'GET, POST, DELETE' })
    if (!requireSameOrigin(req, config.base)) return json(403, { error: 'Cross-origin request refused' })
    if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
      return json(415, { error: 'Expected JSON body' })
    }
    const raw = await req.text()
    if (raw.length > 8192) return json(413, { error: 'Request too large' })
    let payload
    try { payload = JSON.parse(raw) } catch { return json(400, { error: 'Invalid JSON' }) }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json(400, { error: 'Invalid request' })

    if (method === 'DELETE') {
      const id = payload.id
      if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return json(400, { error: 'Invalid competitor ID' })
      const extras = validateExtras((await readConfig(EXTRAS_FILE, config, fetcher)).entries)
      if (![...builtins, ...extras].some(entry => entry.id === id)) {
        return json(404, { error: 'Competitor not found in configuration' })
      }
      const result = await updateConfig(DISABLED_FILE, items => {
        const disabled = validateDisabled(items)
        return disabled.includes(id) ? null : [...disabled, id]
      }, config, fetcher)
      if (result.unchanged) return json(409, { error: 'Competitor already removed' })
      return json(200, {
        id,
        message: 'Competitor removed. Historical SEO data was preserved. The next scheduled daily scan will exclude it.'
      })
    }

    let candidate
    try { candidate = normalizeCompetitor(payload) }
    catch (error) { return json(400, { error: error.message }) }
    const extras = validateExtras((await readConfig(EXTRAS_FILE, config, fetcher)).entries)
    const disabled = validateDisabled((await readConfig(DISABLED_FILE, config, fetcher)).entries)
    const same = [...builtins, ...extras].find(x =>
      x.id === candidate.id || x.domain.replace(/^www\./, '') === candidate.domain
    )
    if (same && !disabled.includes(same.id)) return json(409, { error: 'Competitor already monitored' })
    if (same) {
      await updateConfig(DISABLED_FILE, items => validateDisabled(items).filter(id => id !== same.id), config, fetcher)
      return json(200, {
        competitor: same,
        message: 'Competitor restored. Monitoring resumes with the next daily scan.'
      })
    }
    await updateConfig(EXTRAS_FILE, items => {
      const latest = validateExtras(items)
      assertUnique(candidate, builtins.concat(latest))
      return [...latest, candidate]
    }, config, fetcher)
    // A locally removed competitor may have been committed with its configuration
    // removed but its ID still in the disabled list. Re-adding it restores scanning.
    if (disabled.includes(candidate.id)) {
      await updateConfig(DISABLED_FILE, items =>
        validateDisabled(items).filter(id => id !== candidate.id), config, fetcher)
    }
    return json(201, {
      competitor: candidate,
      message: 'Competitor saved to GitHub. It will be scanned on the next scheduled daily run.'
    })
  } catch (error) {
    // Avoid returning credentials, upstream bodies or other internal errors to clients.
    if (error.message.startsWith('Missing server setting') || error.message.includes('SESSION_SECRET')) {
      return json(503, { error: 'Admin API is not configured yet.' })
    }
    if (error.message.startsWith('Competitor already exists')) return json(409, { error: error.message })
    return json(503, { error: 'Cannot update monitoring right now. Check function logs.' })
  }
}

module.exports = {
  SESSION_COOKIE, STATE_COOKIE, settings, json, redirect, cookie, cookies,
  signature, createSession, readSession, requireSameOrigin,
  github, canEdit, requireAdmin, readConfig, updateConfig,
  handleCompetitors, validateExtras, validateDisabled
}
