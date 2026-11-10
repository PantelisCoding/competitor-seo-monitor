'use strict'

const fs = require('node:fs')
const { normalizeCompetitor, readExtraCompetitors, assertUnique, CONFIG_PATH } = require('./competitorConfig.cjs')
const builtinCompetitors = require('./builtinCompetitors.cjs')

function issueField(body, label) {
  const matches = String(body || '').split(/\r?\n/).filter(line => line.startsWith(label + ': '))
  if (matches.length > 1) throw new Error('Duplicate field: ' + label)
  return matches.length ? matches[0].slice(label.length + 2).trim() : ''
}

async function run() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  const repoName = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  if (!eventPath || !repoName || !token) throw new Error('Missing GitHub Actions environment')
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
  const issue = event.issue
  if (!issue || !issue.title.startsWith('[Add Competitor] ')) return

  const [owner, repo] = repoName.split('/')
  if (!owner || !repo || !issue.user?.login) throw new Error('Invalid GitHub event')
  const response = await fetch(
    'https://api.github.com/repos/' + owner + '/' + repo +
      '/collaborators/' + encodeURIComponent(issue.user.login) + '/permission',
    {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  )
  if (!response.ok) throw new Error('Could not verify repository contributor permissions: HTTP ' + response.status)
  const { permission } = await response.json()
  if (!['admin', 'maintain', 'write'].includes(permission)) {
    console.log('Ignoring add request: issue author does not have write access.')
    return
  }

  const candidate = normalizeCompetitor({
    name: issueField(issue.body, 'Competitor name'),
    website: issueField(issue.body, 'Website URL'),
    sitemap: issueField(issue.body, 'Sitemap URL')
  })
  const extras = readExtraCompetitors(builtinCompetitors)
  assertUnique(candidate, builtinCompetitors.concat(extras))

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(extras.concat(candidate), null, 2) + '\n')
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'added=true\n')
  }
  console.log('Validated and staged competitor: ' + candidate.name + ' (' + candidate.domain + ')')
}

run().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
