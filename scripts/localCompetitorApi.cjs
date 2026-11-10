'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { CONFIG_PATH, normalizeCompetitor, assertUnique, readExtraCompetitors } = require('./competitorConfig.cjs')
const builtInCompetitors = require('./builtinCompetitors.cjs')

function reply(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(JSON.stringify(body))
}

// Localhost-only API for the Vite development server. It is never bundled into
// the browser or deployed to GitHub Pages.
function localCompetitorApi(options = {}) {
  const configPath = options.configPath || CONFIG_PATH
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
          let parsedOrigin
          try {
            parsedOrigin = new URL(origin)
          } catch {
            return reply(res, 403, { error: 'Invalid request origin' })
          }
          if (parsedOrigin.protocol !== 'http:' || parsedOrigin.host !== host) {
            return reply(res, 403, { error: 'Cross-origin requests are blocked' })
          }
        }

        if (req.method === 'GET') {
          try {
            return reply(res, 200, { competitors: readExtraCompetitors(builtins, configPath) })
          } catch (error) {
            return reply(res, 500, { error: error.message })
          }
        }
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'GET, POST')
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
            if (size > 8192) {
              return reply(res, 413, { error: 'Request too large' })
            }
            chunks.push(chunk)
          }
          const raw = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return reply(res, 400, { error: 'Invalid competitor request' })
          }

          const competitor = normalizeCompetitor(raw)
          const extras = readExtraCompetitors(builtins, configPath)
          try {
            assertUnique(competitor, builtins.concat(extras))
          } catch (error) {
            return reply(res, 409, { error: error.message })
          }
          const temporaryPath = configPath + '.tmp-' + process.pid
          fs.mkdirSync(path.dirname(configPath), { recursive: true })
          try {
            fs.writeFileSync(temporaryPath, JSON.stringify([...extras, competitor], null, 2) + '\n')
            fs.renameSync(temporaryPath, configPath)
          } finally {
            if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
          }
          return reply(res, 201, {
            competitor,
            message: 'Saved locally. The next scanner run will include this competitor.'
          })
        } catch (error) {
          return reply(res, error instanceof SyntaxError ? 400 : 422, {
            error: error.message || 'Unable to save competitor'
          })
        }
      })
    }
  }
}

module.exports = localCompetitorApi
