'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeCompetitor, assertUnique, readExtraCompetitors } = require('../scripts/competitorConfig.cjs')

test('normalizes a manually added competitor', () => {
  assert.deepEqual(
    normalizeCompetitor({
      name: 'Rezi',
      website: 'https://www.rezi.ai/',
      sitemap: 'https://www.rezi.ai/sitemap.xml'
    }),
    {
      id: 'rezi-ai',
      name: 'Rezi',
      domain: 'rezi.ai',
      baseUrl: 'https://www.rezi.ai',
      sitemapIndex: 'https://www.rezi.ai/sitemap.xml'
    }
  )
})
test('accepts an omitted sitemap', () => {
  assert.equal(normalizeCompetitor({ name: 'Example', website: 'https://real-company.com' }).sitemapIndex, undefined)
})
test('rejects unsafe and unrelated domains', () => {
  for (const website of ['http://rezi.ai', 'https://localhost', 'https://127.0.0.1', 'https://a.local', 'https://test.invalid']) {
    assert.throws(() => normalizeCompetitor({ name: 'Blocked', website }))
  }
  assert.throws(() => normalizeCompetitor({
    name: 'Rezi', website: 'https://rezi.ai', sitemap: 'https://another.com/sitemap.xml'
  }))
})
test('rejects duplicate domains including www aliases', () => {
  assert.throws(() => assertUnique(
    { id: 'new-id', domain: 'www.rezi.ai' },
    [{ id: 'existing', domain: 'rezi.ai' }]
  ))
})
test('rejects duplicate and invalid names', () => {
  assert.throws(() => normalizeCompetitor({ name: 'Bad\nName', website: 'https://rezi.ai' }))
  assert.throws(() => normalizeCompetitor({ name: '', website: 'https://rezi.ai' }))
})
test('loads default extra-competitor config without overriding built-ins', () => {
  assert.deepEqual(readExtraCompetitors([{ id: 'aiapply', domain: 'aiapply.co' }]), [])
})
