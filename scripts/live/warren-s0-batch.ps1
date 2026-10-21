# Lotto S09/S07/S04 su Warren: controlli pre/post (RAM, ora, credenziali, rete in sandbox), run, copia dei grezzi,
# valutazione held-out lato Windows, pulizia. NON legge mai ~/.claude/.credentials.json (solo ls -l e cmp).
# Uso: powershell -NoProfile -File scripts\live\warren-s0-batch.ps1 -Label s09-low -Mode live -Specs "ISSUE-1:0.01" [-Decoys] [-InjectAgents] [-Scenario S09]
param([Parameter(Mandatory)][string]$Label, [ValidateSet('live','stub')][string]$Mode = 'live',
      [Parameter(Mandatory)][string]$Specs, [string]$Scenario = 'S09', [switch]$Decoys, [switch]$InjectAgents, [switch]$SkipNetCheck, [int]$TimeoutS = 600)
$ErrorActionPreference = 'Continue'
$env:WSL_UTF8 = '1'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dst = '\\wsl.localhost\Ubuntu-26.04\home\dibbi'
$utf8 = New-Object System.Text.UTF8Encoding($false)
function NoBogus($x) { $x | Where-Object { $_ -notmatch 'screen size is bogus' } }

$mem = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableMBytes
if ($mem -lt 1500) { Write-Output "STOP: RAM disponibile $mem MB < 1500"; exit 4 }
$now = Get-Date
if (($now.Hour -eq 5 -and $now.Minute -ge 30) -or ($now.Hour -ge 6 -and $now.Hour -lt 12)) { Write-Output "STOP: dopo le 05:30, login vicino alla scadenza"; exit 5 }
Write-Output "RAM disponibile lato Windows: $mem MB; ora $($now.ToString('HH:mm:ss'))"

# deploy degli script e dei dati d'ingresso (solo copie dal lato Windows)
foreach ($n in 'fixture-setup.sh','stub-claude.sh','warren-s0-run.sh','warren-s0-state.sh','cleanup-run.sh','sandbox-net-check.sh') {
  $t = [IO.File]::ReadAllText("$repo\scripts\live\$n").Replace("`r`n","`n"); [IO.File]::WriteAllText("$dst\live\$n", $t, $utf8)
}
$cat = [IO.File]::ReadAllText("$repo\fixtures\issue-catalog\issues.json").Replace("`r`n","`n"); [IO.File]::WriteAllText("$dst\issue-catalog.json", $cat, $utf8)
if (Test-Path "$dst\seed-app.tar") { Remove-Item "$dst\seed-app.tar" }
tar -cf "$dst\seed-app.tar" -C "$repo\fixtures\seed-app" package.json src test

Write-Output "=== credenziali PRIMA"
$pre = NoBogus (& wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/warren-s0-state.sh check 2>&1)
$pre | Select-String 'ora:|originale|riferimento|CRED|copie' | ForEach-Object { $_.Line }
if (($pre -join "`n") -notmatch 'CRED: IDENTICO') { Write-Output "STOP: credenziali diverse dal riferimento"; exit 6 }

if (-not $SkipNetCheck -and $Mode -eq 'live') {
  Write-Output "=== sandbox-net-check (DNS/HTTPS in sandbox, senza credenziali)"
  NoBogus (& wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/sandbox-net-check.sh 2>&1) | Select-String 'ESITO|HTTP' | ForEach-Object { $_.Line }
}

$envs = @("RUN_TIMEOUT_S=$TimeoutS"); if ($Decoys) { $envs += 'DECOYS=1' }; if ($InjectAgents) { $envs += 'INJECT_AGENTS=1' }
$specArr = @($Specs -split ' ')
Write-Output "=== run: $Label $Mode $Specs  ($($envs -join ' '))"
$t0 = Get-Date
$out = NoBogus (& wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- env @envs bash live/warren-s0-run.sh $Label $Mode @specArr 2>&1)
$t1 = Get-Date
$rawDir = Join-Path $repo "results\raw\warren-s0-$Label"
New-Item -ItemType Directory -Force $rawDir | Out-Null
$out | Out-File (Join-Path $rawDir 'console.txt') -Encoding utf8
$out
Write-Output "=== durata totale del lotto lato Windows: $([int]($t1-$t0).TotalSeconds) s"

Write-Output "=== credenziali DOPO"
$post = NoBogus (& wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/warren-s0-state.sh check 2>&1)
$post | Select-String 'ora:|originale|riferimento|CRED|bwrap|bun |LISTEN|copie|^/home' | ForEach-Object { $_.Line }

# copia dei grezzi (solo file di log/stato, mai la data dir con i workspace)
$latest = Get-ChildItem "$dst\live-runs" | Where-Object { $_.Name -like "*-$Label" } | Sort-Object Name | Select-Object -Last 1
if ($latest) {
  foreach ($f in 'sampler.tsv','listener.log','dispatch.tsv','fake-forge-state.json','markers.txt','readyz.json','project.json') { Copy-Item "$($latest.FullName)\$f" $rawDir -ErrorAction SilentlyContinue }
  foreach ($pat in 'prompt-*.txt','post-*','run-*.ndjson','run-*.err') { Get-ChildItem $latest.FullName -Filter $pat | Copy-Item -Destination $rawDir }
  Copy-Item "$($latest.FullName)\runs" (Join-Path $rawDir 'runs') -Recurse -Force -ErrorAction SilentlyContinue
  Get-Content "$($latest.FullName)\serve.log" -ErrorAction SilentlyContinue | Select-Object -Last 200 | Out-File (Join-Path $rawDir 'serve-tail.log') -Encoding utf8
}

# valutazione held-out lato Windows
foreach ($rd in (Get-ChildItem (Join-Path $rawDir 'runs') -Directory -ErrorAction SilentlyContinue)) {
  $rid = $rd.Name; $flat = Get-Content (Join-Path $rd.FullName 'run-flat.json') -Raw | ConvertFrom-Json
  $m = [regex]::Match($flat.prompt, 'Issue (ISSUE-\d+)'); $issue = $m.Groups[1].Value
  $tar = "$dst\out\$rid.tar"
  if ($Mode -eq 'live' -and $issue -and (Test-Path $tar)) {
    $ws = Join-Path $env:TEMP "tae-s0-eval-$rid"; if (Test-Path $ws) { Remove-Item $ws -Recurse -Force }
    New-Item -ItemType Directory $ws | Out-Null; tar -xf $tar -C $ws
    if (Test-Path "$ws\.claude") { Remove-Item "$ws\.claude" -Recurse -Force }
    Push-Location $repo
    $ev = (node scripts/evaluate.mjs $ws $issue "warren-$Label" $Scenario LIVE claude-sonnet-5-5 2>&1) -join "`n"
    $rf = [regex]::Match($ev, '"result_file":\s*"([^"]+)"').Groups[1].Value -replace '\\\\','\'
    $st = [regex]::Match($ev, '"status":\s*"(\w+)"').Groups[1].Value
    Write-Output "valutazione held-out $rid ($issue): $st"
    if ($rf) { node scripts/live/warren-s0-record.mjs $rf $rd.FullName "$Label" } else { Write-Output "nessun result_file: $ev" }
    Pop-Location; Remove-Item $ws -Recurse -Force
  } else { Write-Output "valutazione $rid ($issue): saltata (modo $Mode o nessun branch esportato)" }
}
Write-Output "=== pulizia"
NoBogus (& wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/cleanup-run.sh 2>&1)
Write-Output "FINE lotto $Label"
