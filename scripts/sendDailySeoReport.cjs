'use strict'
const fs = require('node:fs')
const path = require('node:path')
const dataPath = path.join(__dirname, '../static/data/competitor-monitor.json')
const inbox = 'competitor-reports@agentmail.to'
const recipients = ['g.avgenakis@loopcv.com','lucas@loopcv.com','prafull@outsmartt.com','ayushi.roy@outsmartt.com','pandelisan28@outlook.com']
const htmlEscape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function buildReport(data) {
  if (!data || !data.scanId || !data.competitors) throw Error('No completed scan found')
  const competitors = Object.entries(data.competitors).filter(([,c]) => c && c.scanId === data.scanId).sort((a,b) => String(a[1].name).localeCompare(String(b[1].name)))
  if (!competitors.length) throw Error('No competitors checked in latest scan')
  const events = (data.history || []).filter(e => e.scanId === data.scanId && e.category === 'seoPages')
  const countChanges = ([id,c]) => {
    const own = events.filter(e => e.competitorId === id || (!e.competitorId && e.competitor === c.name))
    return new Set(own.filter(e => e.status === 'new' || e.status === 'removed').map(e => e.status + ':' + e.url)).size
  }
  competitors.sort((a,b) => countChanges(a) - countChanges(b) || String(a[1].name).localeCompare(String(b[1].name)))
  let newTotal = 0, removedTotal = 0, errorsTotal = 0
  let changedCompetitors = 0
  const textLines = ['LoopCV Daily Competitor SEO Report','Scan: ' + (data.lastChecked || data.scanId),'']
  const htmlSections = []
  for (const [id,c] of competitors) {
    const changes = events.filter(e => e.competitorId === id || (!e.competitorId && e.competitor === c.name))
    const added = [...new Set(changes.filter(e => e.status === 'new').map(e => e.url))]
    const removed = [...new Set(changes.filter(e => e.status === 'removed').map(e => e.url))]
    const errors = (c.sitemapErrors || []).map(e => typeof e === 'string' ? e : e.message || JSON.stringify(e))
    newTotal += added.length; removedTotal += removed.length; errorsTotal += errors.length
    if (!added.length && !removed.length && !errors.length) continue
    changedCompetitors++
    textLines.push(c.name + ' — ' + (c.monitoredUrls ?? c.seoPages ?? 0) + ' monitored pages', 'Added (' + added.length + '):', ...(added.length ? added : ['None']), 'Removed (' + removed.length + '):', ...(removed.length ? removed : ['None']), 'Sitemap errors (' + errors.length + '):', ...(errors.length ? errors : ['None']), '')
    const links = urls => urls.length ? '<ul>' + urls.map(u => '<li><a href="' + htmlEscape(u) + '">' + htmlEscape(u) + '</a></li>').join('') + '</ul>' : '<p>None</p>'
    htmlSections.push('<section><h2>' + htmlEscape(c.name) + '</h2><p>Monitored SEO pages: ' + (c.monitoredUrls ?? c.seoPages ?? 0) + '</p><h3>Added (' + added.length + ')</h3>' + links(added) + '<h3>Removed (' + removed.length + ')</h3>' + links(removed) + '<h3>Sitemap errors (' + errors.length + ')</h3>' + (errors.length ? '<ul>' + errors.map(e => '<li>' + htmlEscape(e) + '</li>').join('') + '</ul>' : '<p>None</p>') + '</section>')
  }
  const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(data.lastChecked || data.scanId))
  if (!changedCompetitors) {
    textLines.push('No SEO changes or sitemap errors detected in the latest scan.')
    htmlSections.push('<p>No SEO changes or sitemap errors detected in the latest scan.</p>')
  }
  const summary = changedCompetitors + ' competitors with changes/errors (of ' + competitors.length + ' scanned) | ' + newTotal + ' added | ' + removedTotal + ' removed | ' + errorsTotal + ' sitemap errors'
  return {subject:'LoopCV | Daily Competitor SEO Report — ' + date, text:summary + '\n\n' + textLines.join('\n') + '\nLatest scan only. Job listings excluded.', html:'<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:800px;margin:auto"><h1>Daily Competitor SEO Report</h1><p>' + htmlEscape(data.lastChecked || data.scanId) + '</p><p><strong>' + summary + '</strong></p>' + htmlSections.join('<hr>') + '<hr><p>Latest scan only. Job listings excluded.</p></body></html>'}
}
async function main() {
  if (!process.env.AGENTMAIL_API_KEY) throw Error('Missing AGENTMAIL_API_KEY')
  const testMode = process.env.REPORT_TEST_MODE === 'true'
  let data = JSON.parse(fs.readFileSync(dataPath,'utf8'))
  if (testMode && (!data.scanId || !Object.values(data.competitors || {}).some(c => c.scanId === data.scanId))) {
    const scanId = new Date().toISOString()
    data = {
      scanId, lastChecked: scanId,
      competitors: {
        'test-competitor': {name:'TEST COMPETITOR — SAMPLE DATA', scanId, monitoredUrls:2, sitemapErrors:[]}
      },
      history: [
        {scanId, competitorId:'test-competitor', category:'seoPages', status:'new', url:'https://example.com/sample-added-page'},
        {scanId, competitorId:'test-competitor', category:'seoPages', status:'removed', url:'https://example.com/sample-removed-page'}
      ]
    }
    console.log('No completed scan on branch; using clearly labeled sample data for email delivery test.')
  }
  const report = buildReport(data)
  if (testMode) report.subject = '[TEST — NOT LIVE DATA] ' + report.subject
  const to = (testMode || process.env.REPORT_ONLY_ME === 'true') ? ['pandelisan28@outlook.com'] : recipients
  const response = await fetch('https://api.agentmail.to/v0/inboxes/' + encodeURIComponent(inbox) + '/messages/send',{method:'POST',headers:{Authorization:'Bearer ' + process.env.AGENTMAIL_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({...report,to})})
  if (!response.ok) throw Error('AgentMail HTTP ' + response.status + ': ' + (await response.text()).slice(0,500))
  console.log('AgentMail accepted report for ' + to.length + ' recipient(s)')
}
if (require.main === module) main().catch(e => {console.error(e);process.exitCode=1})
module.exports = {buildReport}
