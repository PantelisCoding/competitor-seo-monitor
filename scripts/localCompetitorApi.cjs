'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
  CONFIG_PATH,
  DISABLED_PATH,
  normalizeCompetitor,
  assertUnique,
  readExtraCompetitors,
  readDisabledCompetitors
} = require('./competitorConfig.cjs')
const builtInCompetitors = require('./builtinCompetitors.cjs')

function reply(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(JSON.stringify(body))
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = file + '.tmp-' + process.pid
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n')
    fs.renameSync(temp, file)
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp)
  }
}

function sameCompetitor(a, b) {
  const domain = value => String(value.domain || '').replace(/^www\./, '').toLowerCase()
  return a.id === b.id || domain(a) === domain(b)
}

// Local-only Vite endpoint. It is not bundled or deployed to GitHub Pages.
function localCompetitorApi(options = {}) {
  const configPath = options.configPath || CONFIG_PATH
  const disabledPath = options.disabledPath || DISABLED_PATH
  const databasePath = options.databasePath ||
    path.join(__dirname, '../static/data/competitor-monitor.json')
  const builtins = options.builtins || builtInCompetitors

  return {
    name: 'competitor-local-save-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/local-competitors', async (req, res) => {
        const host = req.headers.host || ''
        if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) {
          return reply(res, 403, { error: 'Local requests only' })
        }
        const origin = req.headers.origin
        if (origin) {
          let parsed
          try {
            parsed = new URL(origin)
          } catch {
            return reply(res, 403, { error: 'Invalid request origin' })
          }
          if (parsed.protocol !== 'http:' || parsed.host !== host) {
            return reply(res, 403, { error: 'Cross-origin requests are blocked' })
          }
        }

        if (req.method === 'GET') {
          try {
            const inactive = readDisabledCompetitors(disabledPath)
            const extras = readExtraCompetitors(builtins, configPath)
            return reply(res, 200, {
              competitors: extras.filter(item => !inactive.includes(item.id)),
              disabledIds: inactive
            })
          } catch (error) {
            return reply(res, 500, { error: error.message })
          }
        }

        if (!['POST', 'DELETE'].includes(req.method)) {
          res.setHeader('Allow', 'GET, POST, DELETE')
          return reply(res, 405, { error: 'Unsupported request method' })
        }
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
          return reply(res, 415, { error: 'Expected JSON request body' })
        }

        try {
          let size = 0
          const chunks = []
          for await (const chunk of req) {
            size += chunk.length
            if (size > 8192) return reply(res, 413, { error: 'Request too large' })
            chunks.push(chunk)
          }
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return reply(res, 400, { error: 'Invalid competitor request' })
          }
          const disabled = readDisabledCompetitors(disabledPath)
          const extras = readExtraCompetitors(builtins, configPath)

          if (req.method === 'DELETE') {
            const id = payload.id
            if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
              return reply(res, 400, { error: 'Invalid competitor ID' })
            }
            let known = builtins.some(item => item.id === id) || extras.some(item => item.id === id)
            if (!known && fs.existsSync(databasePath)) {
              const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'))
              known = Object.prototype.hasOwnProperty.call(db.competitors || {}, id)
            }
            if (!known || disabled.includes(id)) {
              return reply(res, 404, { error: 'Competitor is not actively tracked' })
            }

            // Keep historical scan data; remove from the active list and future scans.
            writeJson(disabledPath, disabled.concat(id))
            if (extras.some(item => item.id === id)) {
              writeJson(configPath, extras.filter(item => item.id !== id))
            }
            return reply(res, 200, {
              id,
              message: 'Competitor removed from monitoring. Historical SEO data was preserved.'
            })
          }

          const competitor = normalizeCompetitor(payload)
          const existing = builtins.concat(extras).find(item => sameCompetitor(item, competitor))
          if (existing && !disabled.includes(existing.id)) {
            return reply(res, 409, { error: 'Competitor already exists: ' + competitor.domain })
          }
          if (existing && disabled.includes(existing.id)) {
            writeJson(disabledPath, disabled.filter(id => id !== existing.id))
            return reply(res, 200, {
              competitor: existing,
              message: 'Competitor restored to monitoring.'
            })
          }
          try {
            assertUnique(competitor, builtins.concat(extras))
          } catch (error) {
            return reply(res, 409, { error: error.message })
          }
          writeJson(configPath, extras.concat(competitor))
          if (disabled.includes(competitor.id)) {
            writeJson(disabledPath, disabled.filter(id => id !== competitor.id))
          }
          return reply(res, 201, {
            competitor,
            message: 'Saved locally. The next scanner run will include this competitor.'
          })
        } catch (error) {
          return reply(res, error instanceof SyntaxError ? 400 : 422, {
            error: error.message || 'Unable to update competitor'
          })
        }
      })
    }
  }
}

module.exports = localCompetitorApi
