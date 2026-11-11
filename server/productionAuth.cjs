'use strict'
const crypto = require('node:crypto')
const {
  SESSION_COOKIE, STATE_COOKIE, settings, json, redirect, cookie, cookies,
  createSession, readSession, requireSameOrigin, canEdit
} = require('./productionBackend.cjs')

async function handleAuth(request, env = process.env, fetcher = fetch) {
  let config
  try { config = settings(env) }
  catch { return json(503, { error: 'GitHub admin login is not configured.' }) }

  const url = new URL(request.url)
  const route = url.pathname.split('/').pop()

  if (route === 'login') {
    if (request.method !== 'GET') return json(405, { error: 'Use GET' })
    const state = crypto.randomBytes(32).toString('base64url')
    const authorize = new URL('https://github.com/login/oauth/authorize')
    authorize.searchParams.set('client_id', config.clientId)
    authorize.searchParams.set('redirect_uri', config.base + '/api/auth/callback')
    authorize.searchParams.set('scope', 'read:user')
    authorize.searchParams.set('state', state)
    return redirect(authorize.toString(), cookie(STATE_COOKIE, state, 600))
  }

  if (route === 'callback') {
    if (request.method !== 'GET') return json(405, { error: 'Use GET' })
    const supplied = url.searchParams.get('state') || ''
    const saved = cookies(request)[STATE_COOKIE] || ''
    if (!supplied || !saved || supplied.length !== saved.length ||
      !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(saved))) {
      return json(403, { error: 'Invalid sign-in session. Start again.' })
    }
    const code = url.searchParams.get('code')
    if (!code || code.length > 1024) return json(400, { error: 'GitHub did not return an authorization code' })

    try {
      const tokenRes = await fetcher('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.clientId, client_secret: config.clientSecret,
          code, redirect_uri: config.base + '/api/auth/callback'
        })
      })
      if (!tokenRes.ok) return json(502, { error: 'GitHub sign-in is unavailable' })
      const tokenData = await tokenRes.json()
      if (!tokenData.access_token || tokenData.error) return json(403, { error: 'GitHub authorization was not granted' })
      const userRes = await fetcher('https://api.github.com/user', {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': 'Bearer ' + tokenData.access_token,
          'User-Agent': 'competitor-seo-monitor-backend'
        }
      })
      if (!userRes.ok) return json(403, { error: 'Could not verify GitHub account' })
      const user = await userRes.json()
      if (!Number.isSafeInteger(user.id) || !/^[a-z0-9-]+$/i.test(user.login || '') ||
        !(await canEdit(user.login, config, fetcher))) {
        return json(403, { error: 'GitHub account is not an authorized administrator' })
      }
      const response = redirect(config.base + '/')
      response.headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0))
      response.headers.append('Set-Cookie', cookie(SESSION_COOKIE, createSession(user, config.secret), 28800))
      return response
    } catch {
      return json(502, { error: 'GitHub authentication failed' })
    }
  }

  if (route === 'session') {
    if (request.method !== 'GET') return json(405, { error: 'Use GET' })
    const user = readSession(request, config.secret)
    if (!user) return json(200, { authenticated: false })
    try {
      const authorized = await canEdit(user.login, config, fetcher)
      return json(200, { authenticated: authorized, ...(authorized ? { login: user.login } : {}) })
    } catch { return json(503, { error: 'Could not verify admin access' }) }
  }

  if (route === 'logout') {
    if (request.method !== 'POST') return json(405, { error: 'Use POST' })
    if (!requireSameOrigin(request, config.base)) return json(403, { error: 'Cross-origin request refused' })
    return json(200, { authenticated: false }, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) })
  }

  return json(404, { error: 'Unknown authentication endpoint' })
}

module.exports = { handleAuth }
