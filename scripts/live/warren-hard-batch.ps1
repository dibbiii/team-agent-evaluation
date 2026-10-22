# Lotto di run Warren sulla fixture DIFFICILE, una alla volta. PRIMA e DOPO ogni run: RAM, ora, credenziali
# (solo ls -l e cmp con la copia di riferimento, MAI contenuto), rete in sandbox (solo prima del lotto).
# Valutazione held-out lato Windows (FIXTURE=hard), copia dei grezzi (incluso il codice prodotto), pulizia.
# Uso: powershell -NoProfile -File scripts\live\warren-hard-batch.ps1 -Issues HARD-4,HARD-5 -Tag p1 [-CapUsd 4.5] [-SpentSoFar 1.1]
# Regole di arresto: RAM < 1500 MB; dopo le 05:30; credenziali diverse dal riferimento; spesa oltre il tetto;
# 2 errori di esecuzione consecutivi. NON rilancia nulla da solo.
param([Parameter(Mandatory = $true)][string[]]$Issues, [string]$Tag = 'run', [double]$CapUsd = 4.5, [double]$SpentSoFar = 0, [switch]$SkipNetCheck, [int]$TimeoutS = 900)
$ErrorActionPreference = 'Continue'
$Issues = @($Issues | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
foreach ($i in $Issues) { if ($i -notmatch '^HARD-(4|5|6|9)$') { throw "Issue non nel sottoinsieme: '$i'" } }
$env:WSL_UTF8 = '1'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dst = '\\wsl.localhost\Ubuntu-26.04\home\dibbi'
$utf8 = New-Object System.Text.UTF8Encoding($false)
function NoBogus($x) { $x | Where-Object { $_ -notmatch 'screen size is bogus' } }
function InWsl($cmdArgs) { NoBogus (& wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- @cmdArgs 2>&1) }
function TimeStop() { $n = Get-Date; return (($n.Hour -eq 5 -and $n.Minute -ge 30) -or ($n.Hour -ge 6 -and $n.Hour -lt 12)) }

# deploy (solo copie dal lato Windows): script, prompt identici a quelli della baseline, tar della fixture difficile
New-Item -ItemType Directory -Force "$dst\live", "$dst\hard-prompts" | Out-Null
foreach ($n in 'warren-hard-fixture-setup.sh', 'warren-hard-run.sh', 'warren-s0-state.sh', 'cleanup-run.sh', 'sandbox-net-check.sh') {
  $t = [IO.File]::ReadAllText("$repo\scripts\live\$n").Replace("`r`n", "`n"); [IO.File]::WriteAllText("$dst\live\$n", $t, $utf8)
}
foreach ($k in 'HARD-4', 'HARD-5', 'HARD-6', 'HARD-9') {
  $tmp = Join-Path $env:TEMP "hardprompt-$k.txt"
  node "$repo\scripts\live\warren-hard-prompt.mjs" $k $tmp | Out-Null
  $t = [IO.File]::ReadAllText($tmp).Replace("`r`n", "`n"); [IO.File]::WriteAllText("$dst\hard-prompts\$k.txt", $t, $utf8); Remove-Item $tmp
}
if (Test-Path "$dst\seed-app-hard.tar") { Remove-Item "$dst\seed-app-hard.tar" }
tar -cf "$dst\seed-app-hard.tar" -C "$repo\fixtures\seed-app-hard" package.json src test docs

$spent = $SpentSoFar; $consecutiveErrors = 0; $n = 0
foreach ($issue in $Issues) {
  $n++
  $mem = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableMBytes
  if ($mem -lt 1500) { Write-Output "STOP: RAM disponibile $mem MB < 1500 (run $issue non avviata)"; break }
  if (TimeStop) { Write-Output "STOP: dopo le 05:30 (login vicino alla scadenza)"; break }
  if ($spent -ge $CapUsd) { Write-Output "STOP: spesa $spent USD >= tetto $CapUsd"; break }
  if ($consecutiveErrors -ge 2) { Write-Output "STOP: 2 errori di esecuzione consecutivi"; break }
  $label = "$Tag-$($issue.ToLower())-$n"
  Write-Output ("=== run {0}/{1} su {2} [{3}]  RAM {4} MB, ora {5}" -f $n, $Issues.Count, $issue, $label, $mem, (Get-Date -Format 'HH:mm:ss'))

  $pre = InWsl @('bash', 'live/warren-s0-state.sh', 'check')
  $pre | Select-String 'originale|riferimento|CRED' | ForEach-Object { "  PRIMA: " + $_.Line }
  if (($pre -join "`n") -notmatch 'CRED: IDENTICO') { Write-Output "STOP: credenziali diverse dal riferimento (PRIMA)"; break }
  if (-not $SkipNetCheck -and $n -eq 1) {
    Write-Output "  sandbox-net-check:"
    InWsl @('bash', 'live/sandbox-net-check.sh') | Select-String 'ESITO' | ForEach-Object { "    " + $_.Line }
  }

  $out = InWsl @('env', "RUN_TIMEOUT_S=$TimeoutS", 'bash', 'live/warren-hard-run.sh', $issue, $label)
  $rawDir = Join-Path $repo "results\raw\warren-hard-$label"
  New-Item -ItemType Directory -Force $rawDir | Out-Null
  $out | Out-File (Join-Path $rawDir 'console.txt') -Encoding utf8
  $out | Select-String 'modello init|result:|stato=|ATTENZIONE|VERO CLAUDE|^PR:|branch warren|commit |RIEPILOGO|budget|ERRORE|STOP' | ForEach-Object { "  " + $_.Line }

  $post = InWsl @('bash', 'live/warren-s0-state.sh', 'check')
  $post | Select-String 'originale|riferimento|CRED|copie|bwrap|bun |LISTEN' | ForEach-Object { "  DOPO: " + $_.Line }
  $credOk = (($post -join "`n") -match 'CRED: IDENTICO')
  if (-not $credOk) { Write-Output "STOP: credenziali DIVERSE dal riferimento (DOPO): riportare, non toccare" }

  $m = [regex]::Match(($out -join "`n"), 'RIEPILOGO issue=\S+ label=\S+ run=(\S+) state=(\S*)')
  if (-not $m.Success) { Write-Output "  ERRORE: riepilogo non trovato"; $consecutiveErrors++; if (-not $credOk) { break }; continue }
  $runId = $m.Groups[1].Value; $state = $m.Groups[2].Value

  $latest = Get-ChildItem "$dst\live-runs" | Where-Object { $_.Name -like "*-$label" } | Sort-Object Name | Select-Object -Last 1
  foreach ($f in 'run-flat.json', 'events.ndjson', 'prompt.txt', 'claude-procs.txt', 'fake-forge-state.json', 'readyz.json') { Copy-Item "$($latest.FullName)\$f" $rawDir -ErrorAction SilentlyContinue }
  Get-Content "$($latest.FullName)\serve.log" -ErrorAction SilentlyContinue | Select-Object -Last 100 | Out-File (Join-Path $rawDir 'serve-tail.log') -Encoding utf8
  if (Test-Path "$rawDir\run-flat.json") { $c = (Get-Content "$rawDir\run-flat.json" -Raw | ConvertFrom-Json).costUsd; if ($c) { $spent += [double]$c; Write-Output ("  costo run {0:N4} USD; spesa cumulata {1:N4} USD" -f $c, $spent) } }

  $tar = "$dst\out\$runId.tar"
  if ($state -eq 'succeeded' -and (Test-Path $tar)) {
    $consecutiveErrors = 0
    $ws = Join-Path $env:TEMP "tae-hard-eval-$runId"
    if (Test-Path $ws) { Remove-Item $ws -Recurse -Force }
    New-Item -ItemType Directory $ws | Out-Null
    tar -xf $tar -C $ws
    if (Test-Path "$ws\.claude") { Remove-Item "$ws\.claude" -Recurse -Force }
    # codice prodotto (src e test), conservato per diagnosticare i FAIL
    foreach ($sub in 'src', 'test') { if (Test-Path "$ws\$sub") { Copy-Item "$ws\$sub" (Join-Path $rawDir $sub) -Recurse -Force } }
    Push-Location $repo
    $env:FIXTURE = 'hard'
    $ev = (node scripts/evaluate.mjs $ws $issue 'warren-hard-live' 'S01' 'LIVE' 'claude-sonnet-5-5' 2>&1) -join "`n"
    Remove-Item Env:\FIXTURE
    $rf = [regex]::Match($ev, '"result_file":\s*"([^"]+)"').Groups[1].Value -replace '\\\\', '\'
    $st = [regex]::Match($ev, '"status":\s*"(\w+)"').Groups[1].Value
    Write-Output "  valutazione held-out $issue ($runId): $st"
    if ($rf) { node scripts/live/warren-hard-record.mjs $rf $rawDir $issue "results/raw/warren-hard-$label" } else { Write-Output "  nessun result_file: $ev" }
    if ($st -ne 'PASS' -and $rf) { (Get-Content $rf -Raw | ConvertFrom-Json).checks.heldout_failures | Select-Object -First 8 | ForEach-Object { "    FAIL> $_" } }
    Pop-Location
    Remove-Item $ws -Recurse -Force
  } else {
    $consecutiveErrors++
    Write-Output "  run non riuscita (stato $state) o nessun branch: nessuna valutazione; da riportare"
  }
  InWsl @('bash', 'live/cleanup-run.sh') | Select-String 'ATTENZIONE|copie|nessun' | ForEach-Object { "  pulizia: " + $_.Line.Trim() }
  # il bare repo della fixture difficile (cleanup-run.sh conosce solo quello della fixture facile); percorso esatto sotto $HOME
  InWsl @('rm', '-rf', '/home/dibbi/fixtures/seed-app-hard.git') | Out-Null
  if (-not $credOk) { break }
}
Write-Output ("=== lotto concluso. Spesa cumulata stimata (listino): {0:N4} USD" -f $spent)
