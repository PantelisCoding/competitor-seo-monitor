'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const vue = fs.readFileSync(path.join(__dirname, '../pages/admin/competitor-monitoring.vue'), 'utf8')
const script = vue.match(/<script>([\s\S]*?)<\/script>/)?.[1]
if (!script) throw new Error('Dashboard Vue script not found')
const component = new Function(
  script.replace('export default', 'return')
    .replaceAll('import.meta.env', "({ env: { DEV: true, BASE_URL: '/' } }).env")
)()

function view(data) {
  const scope = { data, competitors: Object.keys(data.competitors).map(id => ({ id })) }
  scope.getCompetitorNew = id => component.methods.getCompetitorNew.call(scope, id)
  scope.getHistoryDate = item => component.methods.getHistoryDate.call(scope, item)
  scope.getNewUrls = id => component.methods.getNewUrls.call(scope, id)
  return scope
}

test('the New SEO pages metric counts only latest-scan totals, not all history', () => {
  const scope = view({
    scanId: '2026-11-11T03:00:00.000Z',
    competitors: {
      example: { scanId: '2026-11-11T03:00:00.000Z', newSeoPages: 2 },
      other: { scanId: '2026-11-10T03:00:00.000Z', newSeoPages: 800 },
      failed: { scanId: '2026-11-11T03:00:00.000Z', newSeoPages: 0 }
    },
    history: Array.from({length: 955}, (_, i) => ({
      url: 'https://example.com/' + i,
      competitorId: 'example',
      category: 'seoPages',
      status: 'new',
      detectedAt: '2026-11-10T03:00:00.000Z'
    }))
  })
  assert.equal(component.computed.totalNewSeo.call(scope), 2)
  assert.equal(scope.getCompetitorNew('other'), 0)
  assert.equal(scope.getCompetitorNew('failed'), 0)
  assert.equal(scope.getNewUrls('example').length, 0)
})

test('latest new-discoveries tab lists only events tagged with latest scan', () => {
  const current = '2026-11-11T03:00:00.000Z'
  const previous = '2026-11-10T03:00:00.000Z'
  const scope = view({
    scanId: current,
    competitors: {
      example: {
        scanId: current, newSeoPages: 1,
        urls: { 'https://example.com/new': { firstSeen: current } }
      }
    },
    history: [
      { competitorId: 'example', category: 'seoPages', status: 'new', url: 'https://example.com/old', scanId: previous, detectedAt: previous },
      { competitorId: 'example', category: 'seoPages', status: 'new', url: 'https://example.com/new', scanId: current, detectedAt: current },
      { competitorId: 'example', category: 'seoPages', status: 'removed', url: 'https://example.com/removed', scanId: current, detectedAt: current }
    ]
  })
  assert.equal(scope.getCompetitorNew('example'), 1)
  assert.deepEqual(scope.getNewUrls('example').map(item => item.url), ['https://example.com/new'])
  assert.equal(component.computed.totalNewSeo.call(scope), 1)
})

test('legacy scan data uses per-competitor latest counts, never total historic events', () => {
  const scope = view({
    lastChecked: '2026-11-10T03:00:00.000Z',
    competitors: { example: { newSeoPages: 3 } },
    history: Array.from({ length: 955 }, () => ({competitorId: 'example', status: 'new', category: 'seoPages'}))
  })
  assert.equal(component.computed.totalNewSeo.call(scope), 3)
  // Historical events cannot be safely assigned to the latest run until rescanned.
  assert.deepEqual(scope.getNewUrls('example'), [])
})
