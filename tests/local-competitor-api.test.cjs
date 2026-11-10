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
  localCompetitorApi({ configPath, builtins: [{ id: 'aiapply', domain: 'aiapply.co' }] })
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
