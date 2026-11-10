'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const backend = require('../server/productionBackend.cjs')
const auth = require('../server/productionAuth.cjs')

function env() {
  return {
    PUBLIC_BASE_URL: 'https://monitor.example/',
    GITHUB_REPO: 'example/seo-monitor',
    GITHUB_BRANCH: 'main',
    GITHUB_TOKEN: 'test-server-token',
    GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
    GITHUB_OAUTH_CLIENT_SECRET: 'test-client-secret',
    SESSION_SECRET: 'a-long-random-test-secret-that-is-32-characters-minimum',
    ADMIN_GITHUB_LOGINS: 'testadmin'
  }
}

function mockGithub() {
  const files = {
    'static/data/extra-competitors.json': [],
    'static/data/disabled-competitors.json': []
  }
  const sha = { 'static/data/extra-competitors.json': 'sha-1', 'static/data/disabled-competitors.json': 'sha-2' }
  let commits = 0, scans = 0
  const paths = []
  const handler = async (url, options = {}) => {
    const u = new URL(url)
    const method = options.method || 'GET'
    paths.push([method, u.pathname])
    const response = (status, body = {}) => new Response(status === 204 ? null : JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' }
    })
    if (u.hostname === 'github.com' && u.pathname === '/login/oauth/access_token') {
      return response(200, { access_token: 'oauth-test-token' })
    }
    if (u.pathname === '/user') {
      return response(200, { id: 123, login: 'testadmin' })
    }
    if (u.pathname.endsWith('/collaborators/testadmin/permission')) {
      return response(200, { permission: 'admin' })
    }
    if (u.pathname.endsWith('/actions/workflows/competitor.monitor.yml/dispatches')) {
      scans++
      return response(204)
    }
    const p = '/repos/example/seo-monitor/contents/'
    if (u.pathname.startsWith(p)) {
      const path = u.pathname.slice(p.length)
      if (!Object.prototype.hasOwnProperty.call(files, path)) return response(404)
      if (method === 'GET') return response(200, {
        sha: sha[path], encoding: 'base64',
        content: Buffer.from(JSON.stringify(files[path])).toString('base64')
      })
      if (method === 'PUT') {
        const incoming = JSON.parse(options.body)
        if (incoming.sha !== sha[path]) return response(409)
        files[path] = JSON.parse(Buffer.from(incoming.content, 'base64').toString())
        sha[path] = 'sha-' + ++commits
        return response(200, { commit: { sha: sha[path] } })
      }
    }
    throw new Error('Unexpected fetch: ' + method + ' ' + url)
  }
  return { handler, files, paths, get scans() { return scans }, get commits() { return commits } }
}

function authCookie() {
  return backend.SESSION_COOKIE + '=' +
    backend.createSession({ id: 123, login: 'testadmin' }, env().SESSION_SECRET)
}
function request(method, body, { cookie = authCookie(), origin = 'https://monitor.example' } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie }
  return new Request('https://monitor.example/api/competitors', {
    method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify(body) })
  })
}

test('production backend rejects unauthenticated users and cross-origin writes', async () => {
  const mock = mockGithub()
  const anonymous = await backend.handleCompetitors(request('GET', null, { cookie: '' }), env(), mock.handler)
  assert.equal(anonymous.status, 401)
  const noAdmin = await backend.handleCompetitors(request('POST', { name: 'LoopCV', website: 'https://loopcv.pro' }, {
    cookie: backend.SESSION_COOKIE + '=tampered'
  }), env(), mock.handler)
  assert.equal(noAdmin.status, 401)
  const csrf = await backend.handleCompetitors(request('DELETE', { id: 'aiapply' }, { origin: 'https://attacker.example' }), env(), mock.handler)
  assert.equal(csrf.status, 403)
  assert.equal(mock.commits, 0)
  assert.equal(mock.scans, 0)
})

test('production add, delete, persistence and restore use GitHub commits', async () => {
  const mock = mockGithub()
  const candidate = { name: 'LoopCV', website: 'https://www.loopcv.pro', sitemap: 'https://www.loopcv.pro/sitemap.xml' }

  const added = await backend.handleCompetitors(request('POST', candidate), env(), mock.handler)
  assert.equal(added.status, 201)
  assert.equal((await added.json()).competitor.id, 'loopcv-pro')
  assert.equal(mock.files['static/data/extra-competitors.json'].length, 1)
  assert.equal(mock.scans, 1)
  assert.equal(mock.commits, 1)

  const duplicate = await backend.handleCompetitors(request('POST', candidate), env(), mock.handler)
  assert.equal(duplicate.status, 409)
  assert.equal(mock.commits, 1)

  const removed = await backend.handleCompetitors(request('DELETE', { id: 'loopcv-pro' }), env(), mock.handler)
  assert.equal(removed.status, 200)
  assert.deepEqual(mock.files['static/data/disabled-competitors.json'], ['loopcv-pro'])
  assert.equal(mock.files['static/data/extra-competitors.json'].length, 1)
  const visible = await backend.handleCompetitors(request('GET', null), env(), mock.handler)
  assert.equal(visible.status, 200)
  const view = await visible.json()
  assert.deepEqual(view.competitors, [])
  assert.deepEqual(view.disabledIds, ['loopcv-pro'])

  const restored = await backend.handleCompetitors(request('POST', candidate), env(), mock.handler)
  assert.equal(restored.status, 200)
  assert.equal((await restored.json()).message, 'Competitor restored.')
  assert.deepEqual(mock.files['static/data/disabled-competitors.json'], [])
  assert.equal(mock.files['static/data/extra-competitors.json'].length, 1)
  assert.equal(mock.commits, 3)
  assert.equal(mock.scans, 3)
})

test('built-in competitors can be disabled, and invalid inputs rejected', async () => {
  const mock = mockGithub()
  const invalid = await backend.handleCompetitors(request('POST', {
    name: 'Internal', website: 'https://127.0.0.1/'
  }), env(), mock.handler)
  assert.equal(invalid.status, 400)
  const missing = await backend.handleCompetitors(request('DELETE', { id: 'nonexistent' }), env(), mock.handler)
  assert.equal(missing.status, 404)
  const blocked = await backend.handleCompetitors(request('DELETE', { id: '../unsafe' }), env(), mock.handler)
  assert.equal(blocked.status, 400)
  const removed = await backend.handleCompetitors(request('DELETE', { id: 'aiapply' }), env(), mock.handler)
  assert.equal(removed.status, 200)
  assert.deepEqual(mock.files['static/data/disabled-competitors.json'], ['aiapply'])
})

test('GitHub OAuth login, callback, signed session, and logout', async () => {
  const mock = mockGithub()
  const login = await auth.handleAuth(new Request('https://monitor.example/api/auth/login'), env(), mock.handler)
  assert.equal(login.status, 302)
  const url = new URL(login.headers.get('location'))
  assert.equal(url.hostname, 'github.com')
  assert.equal(url.searchParams.get('client_id'), 'test-client-id')
  const state = url.searchParams.get('state')
  assert.ok(state.length >= 32)
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/)

  const rejected = await auth.handleAuth(new Request(
    'https://monitor.example/api/auth/callback?code=abc&state=bad',
    { headers: { Cookie: backend.STATE_COOKIE + '=' + state } }
  ), env(), mock.handler)
  assert.equal(rejected.status, 403)

  const callback = await auth.handleAuth(new Request(
    'https://monitor.example/api/auth/callback?code=abc&state=' + state,
    { headers: { Cookie: backend.STATE_COOKIE + '=' + state } }
  ), env(), mock.handler)
  assert.equal(callback.status, 302)
  assert.equal(callback.headers.get('location'), 'https://monitor.example/')
  const cookieValue = callback.headers.get('set-cookie').match(/competitor_admin_session=([^;\s]+)/)?.[1]
  assert.ok(cookieValue)
  const savedCookie = backend.SESSION_COOKIE + '=' + cookieValue
  const session = await auth.handleAuth(new Request('https://monitor.example/api/auth/session', {
    headers: { Cookie: savedCookie }
  }), env(), mock.handler)
  assert.equal(session.status, 200)
  assert.deepEqual(await session.json(), { authenticated: true, login: 'testadmin' })

  const signout = await auth.handleAuth(new Request('https://monitor.example/api/auth/logout', {
    method: 'POST', headers: { Origin: 'https://monitor.example', Cookie: savedCookie }
  }), env(), mock.handler)
  assert.equal(signout.status, 200)
  assert.match(signout.headers.get('set-cookie'), /Max-Age=0/)
})

test('sessions expire and production endpoints fail closed without configuration', async () => {
  const token = backend.createSession({ id: 123, login: 'testadmin' }, env().SESSION_SECRET, Date.now() - 9 * 60 * 60 * 1000)
  const expired = new Request('https://monitor.example/api/auth/session', {
    headers: { Cookie: backend.SESSION_COOKIE + '=' + token }
  })
  const mock = mockGithub()
  const session = await auth.handleAuth(expired, env(), mock.handler)
  assert.deepEqual(await session.json(), { authenticated: false })
  const noConfig = await backend.handleCompetitors(request('GET', null), {}, mock.handler)
  assert.equal(noConfig.status, 503)
})


test('a previously locally removed competitor is re-enabled when first added on live API', async () => {
  const mock = mockGithub()
  mock.files['static/data/disabled-competitors.json'] = ['loopcv-pro']
  const candidate = { name: 'LoopCV', website: 'https://www.loopcv.pro' }
  const response = await backend.handleCompetitors(request('POST', candidate), env(), mock.handler)
  assert.equal(response.status, 201)
  assert.equal(mock.files['static/data/extra-competitors.json'].length, 1)
  assert.deepEqual(mock.files['static/data/disabled-competitors.json'], [])
  assert.equal(mock.scans, 1)
})
