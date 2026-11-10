'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Readable } = require('node:stream')
const localCompetitorApi = require('../scripts/localCompetitorApi.cjs')

function createApi(configPath) {
  let handler
  localCompetitorApi({
    configPath,
    disabledPath: path.join(path.dirname(configPath), 'disabled-competitors.json'),
    databasePath: path.join(path.dirname(configPath), 'monitor.json'),
    builtins: [{ id: 'aiapply', domain: 'aiapply.co' }]
  })
    .configureServer({ middlewares: { use(route, callback) {
      assert.equal(route, '/api/local-competitors')
      handler = callback
    } } })
  return async ({ method = 'POST', body = null, host = 'localhost:5173', origin = 'http://localhost:5173', contentType = 'application/json' } = {}) => {
    const req = Readable.from(body === null ? [] : [Buffer.from(JSON.stringify(body))])
    req.method = method
    req.headers = { host, origin, 'content-type': contentType }
    const response = { status: 200, data: '' }
    const res = {
      setHeader() {},
      writeHead(status) { response.status = status },
      end(data) { response.data = data }
    }
    await handler(req, res)
    response.json = JSON.parse(response.data)
    return response
  }
}

test('direct save persists, exposes GET, and rejects duplicates', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'competitor-test-'))
  try {
    const configPath = path.join(dir, 'extra-competitors.json')
    fs.writeFileSync(configPath, '[]\n')
    const request = createApi(configPath)
    const candidate = { name: 'Rezi', website: 'https://www.rezi.ai', sitemap: 'https://rezi.ai/sitemap.xml' }
    const save = await request({ body: candidate })
    assert.equal(save.status, 201)
    assert.equal(save.json.competitor.id, 'rezi-ai')
    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    assert.equal(persisted.length, 1)
    assert.equal(persisted[0].name, 'Rezi')
    const all = await request({ method: 'GET' })
    assert.equal(all.status, 200)
    assert.equal(all.json.competitors.length, 1)
    const duplicate = await request({ body: candidate })
    assert.equal(duplicate.status, 409)
    assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).length, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('rejects browser cross-origin submission and invalid inputs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'competitor-test-'))
  try {
    const configPath = path.join(dir, 'extra-competitors.json')
    fs.writeFileSync(configPath, '[]\n')
    const request = createApi(configPath)
    assert.equal((await request({
      origin: 'https://attacker.example',
      body: { name: 'Rezi', website: 'https://rezi.ai' }
    })).status, 403)
    assert.equal((await request({
      body: { name: 'Invalid', website: 'https://127.0.0.1' }
    })).status, 422)
    assert.equal((await request({
      body: { name: 'AIApply', website: 'https://aiapply.co' }
    })).status, 409)
    assert.equal((await request({
      contentType: 'text/plain',
      body: { name: 'Rezi', website: 'https://rezi.ai' }
    })).status, 415)
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})


test('deleting a manually added competitor removes it from active monitoring', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'competitor-delete-test-'))
  try {
    const configPath = path.join(dir, 'extra-competitors.json')
    const disabledPath = path.join(dir, 'disabled-competitors.json')
    const dbPath = path.join(dir, 'monitor.json')
    fs.writeFileSync(configPath, '[]\n')
    fs.writeFileSync(dbPath, JSON.stringify({
      competitors: { 'loopcv-pro': { name: 'LoopCV', urls: { 'https://www.loopcv.pro/': { firstSeen: '2026-01-01' } } } },
      history: [{ competitorId: 'loopcv-pro', status: 'new', url: 'https://www.loopcv.pro/' }]
    }))
    const snapshot = fs.readFileSync(dbPath, 'utf8')
    const request = createApi(configPath)
    const candidate = { name: 'LoopCV', website: 'https://www.loopcv.pro', sitemap: 'https://www.loopcv.pro/sitemap.xml' }

    assert.equal((await request({ body: candidate })).status, 201)
    const removed = await request({ method: 'DELETE', body: { id: 'loopcv-pro' } })
    assert.equal(removed.status, 200)
    assert.match(removed.json.message, /preserved/)
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), [])
    assert.deepEqual(JSON.parse(fs.readFileSync(disabledPath, 'utf8')), ['loopcv-pro'])
    assert.equal(fs.readFileSync(dbPath, 'utf8'), snapshot)
    const active = await request({ method: 'GET' })
    assert.equal(active.status, 200)
    assert.deepEqual(active.json.competitors, [])
    assert.deepEqual(active.json.disabledIds, ['loopcv-pro'])
    assert.equal((await request({ method: 'DELETE', body: { id: 'loopcv-pro' } })).status, 404)

    const restored = await request({ body: candidate })
    assert.equal(restored.status, 201)
    assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).length, 1)
    assert.deepEqual(JSON.parse(fs.readFileSync(disabledPath, 'utf8')), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a built-in competitor can be disabled and restored without deleting its settings', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'builtin-delete-test-'))
  try {
    const configPath = path.join(dir, 'extra-competitors.json')
    const disabledPath = path.join(dir, 'disabled-competitors.json')
    fs.writeFileSync(configPath, '[]\n')
    const request = createApi(configPath)
    assert.equal((await request({ method: 'DELETE', body: { id: 'aiapply' } })).status, 200)
    assert.deepEqual(JSON.parse(fs.readFileSync(disabledPath, 'utf8')), ['aiapply'])
    const restored = await request({ body: { name: 'AIApply', website: 'https://aiapply.co' } })
    assert.equal(restored.status, 200)
    assert.match(restored.json.message, /restored/)
    assert.deepEqual(JSON.parse(fs.readFileSync(disabledPath, 'utf8')), [])
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('deletion validates competitor identities', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-identity-test-'))
  try {
    const configPath = path.join(dir, 'extra-competitors.json')
    fs.writeFileSync(configPath, '[]\n')
    const request = createApi(configPath)
    assert.equal((await request({ method: 'DELETE', body: { id: '../something' } })).status, 400)
    assert.equal((await request({ method: 'DELETE', body: { id: 'not-tracked' } })).status, 404)
    assert.equal((await request({ method: 'DELETE', body: { id: 'aiapply', unexpected: true }, origin: 'https://attacker.example' })).status, 403)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
