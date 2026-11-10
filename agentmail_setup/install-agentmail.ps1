# Run from the root of the Loopcv monitor-competitors-sitemap local checkout.
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$workflow = Join-Path $root '.github/workflows/competitor.monitor.yml'
$destination = Join-Path $root 'scripts/sendEmailReport.js'
$source = Join-Path $PSScriptRoot 'sendEmailReport.js'

if (-not (Test-Path $workflow)) { throw "Workflow not found: $workflow. No files were changed." }
if (-not (Test-Path $source)) { throw "Email script not found next to installer: $source. No files were changed." }
if (-not (Test-Path (Join-Path $root 'scripts/monitorCompetitors.js'))) {
  throw 'Run this installer from the root of the competitor SEO monitor repository. No files were changed.'
}
if (Test-Path $destination) { throw "File already exists: $destination. Refusing to overwrite." }

$content = [IO.File]::ReadAllText($workflow)
if ($content -match 'sendEmailReport\.js|MONITOR_BEFORE_PATH') {
  throw 'Email reporting appears to be configured already; refusing to install twice.'
}

# Match only the scanner run line, preserving all surrounding workflow configuration.
$runPattern = '(?m)^(\s*)- name: Run competitor scanner\r?\n\s*run: node scripts/monitorCompetitors\.js\s*$'
$match = [regex]::Match($content, $runPattern)
if (-not $match.Success) {
  throw 'Expected scanner step not found; workflow left unchanged. Please share your current workflow.'
}
$indent = $match.Groups[1].Value
$before = @"
${indent}- name: Preserve previous monitoring snapshot
${indent}  shell: bash
${indent}  run: cp static/data/competitor-monitor.json "`$RUNNER_TEMP/competitor-monitor-before.json"

"@
$replacement = $before + $match.Value.TrimStart("`r", "`n")
$updated = $content.Substring(0, $match.Index) + $replacement + $content.Substring($match.Index + $match.Length)

# Email happens after the existing scan and commit step, without replacing existing steps.
$after = @"

${indent}- name: Email competitor changes with AgentMail
${indent}  env:
${indent}    AGENTMAIL_API_KEY: `${{ secrets.AGENTMAIL_API_KEY }}
${indent}    MONITOR_BEFORE_PATH: `${{ runner.temp }}/competitor-monitor-before.json
${indent}  run: node scripts/sendEmailReport.js
"@
$updated = $updated.TrimEnd("`r", "`n") + $after + "`n"

Copy-Item $source $destination
[IO.File]::WriteAllText($workflow, $updated, (New-Object System.Text.UTF8Encoding $false))
Write-Host 'Installed scripts/sendEmailReport.js and patched GitHub Actions workflow.' -ForegroundColor Green
Write-Host 'Review changes with: git diff -- .github/workflows/competitor.monitor.yml; git status --short'
