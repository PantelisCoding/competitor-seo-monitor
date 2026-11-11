'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function file(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
}

test('the automatic GitHub scan schedule runs exactly once daily', () => {
  const workflow = file('.github/workflows/competitor.monitor.yml')
  const schedules = [...workflow.matchAll(/^\s*- cron:\s*["']([^"']+)["']/gm)]
  assert.equal(schedules.length, 2)
  assert.deepEqual(schedules.map(s => s[1]).sort(), ['0 8 * * *', '0 9 * * *'])
})

test('adding, deleting or restoring competitors does not dispatch extra scans', () => {
  const issueWorkflow = file('.github/workflows/add-competitor.yml')
  const backend = file('server/productionBackend.cjs')
  assert.doesNotMatch(issueWorkflow, /gh workflow run competitor\.monitor\.yml/)
  assert.doesNotMatch(backend, /actions\/workflows\/competitor\.monitor\.yml\/dispatches/)
  assert.doesNotMatch(backend, /dispatchScan\(/)
})

