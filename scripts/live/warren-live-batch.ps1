# Serie di run LIVE di Warren (una dopo l'altra) con valutazione held-out lato Windows. Consuma uso del piano Claude.
# Uso: powershell -NoProfile -File scripts\live\warren-live-batch.ps1 -Issues ISSUE-1,ISSUE-1,ISSUE-6
# Regole di arresto: memoria disponibile < 1500 MB; 2 errori di esecuzione consecutivi; spesa Warren oltre il tetto.
param([Parameter(Mandatory = $true)][string[]]$Issues, [double]$CapUsd = 4.5)
$ErrorActionPreference = 'Continue'
# Con "powershell -File ... -Issues A,B" la lista arriva come UNA stringa "A,B": la si divide qui.
$Issues = @($Issues | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
foreach ($i in $Issues) { if ($i -notmatch '^ISSUE-\d+$') { throw "Nome di issue non valido: '$i'" } }
$env:WSL_UTF8 = '1'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$distroHome = '\\wsl.localhost\Ubuntu-26.04\home\dibbi'
$ledgerPath = Join-Path $repo 'results\budget-ledger.json'
$spentHere = 0.0
$consecutiveErrors = 0
$n = 0
foreach ($issue in $Issues) {
  $n++
  $mem = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableMBytes
  if ($mem -lt 1500) { Write-Output "STOP: memoria disponibile $mem MB < 1500"; break }
  if ($spentHere -ge $CapUsd) { Write-Output "STOP: spesa della serie $spentHere USD >= tetto $CapUsd"; break }
  if ($consecutiveErrors -ge 2) { Write-Output "STOP: 2 errori di esecuzione consecutivi"; break }
  Write-Output ("=== run {0}/{1} su {2}  (memoria disponibile {3} MB)" -f $n, $Issues.Count, $issue, $mem)

  $out = (& wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/warren-run.sh $issue live 2>&1) -join "`n"
  $m = [regex]::Match($out, 'RIEPILOGO mode=live issue=\S+ run=(\S+) state=(\S*)')
  if (-not $m.Success) { Write-Output "ERRORE: riepilogo non trovato"; $out.Substring([Math]::Max(0, $out.Length - 600)); $consecutiveErrors++; continue }
  $runId = $m.Groups[1].Value; $state = $m.Groups[2].Value
  Write-Output "run $runId stato $state"
  if ($out -match 'ATTENZIONE: file di stato') { Write-Output "ATTENZIONE: file di stato/credenziali nel branch (esclusi dal tar)" }

  $latest = Get-ChildItem "$distroHome\live-runs" | Sort-Object Name | Select-Object -Last 1
  $raw = Join-Path $repo "results\raw\warren-live-$issue-$runId"
  New-Item -ItemType Directory -Force $raw | Out-Null
  foreach ($f in 'run-flat.json', 'events.ndjson', 'prompt.txt', 'claude-procs.txt') { Copy-Item "$($latest.FullName)\$f" $raw -ErrorAction SilentlyContinue }

  $tar = "$distroHome\out\$runId.tar"
  if ($state -eq 'succeeded' -and (Test-Path $tar)) {
    $consecutiveErrors = 0
    $ws = Join-Path $env:TEMP "tae-warren-eval-$runId"
    if (Test-Path $ws) { Remove-Item $ws -Recurse -Force }
    New-Item -ItemType Directory $ws | Out-Null
    tar -xf $tar -C $ws
    if (Test-Path "$ws\.claude") { Remove-Item "$ws\.claude" -Recurse -Force }
    Push-Location $repo
    $ev = (node scripts/evaluate.mjs $ws $issue warren-live S01 LIVE claude-sonnet-5-5 2>&1) -join "`n"
    $rf = [regex]::Match($ev, '"result_file":\s*"([^"]+)"').Groups[1].Value -replace '\\\\', '\'
    if ($rf) { node scripts/live/record-warren-run.mjs $rf $raw $issue "Serie di run LIVE (run $n di $($Issues.Count))." } else { Write-Output "ERRORE: nessun result_file da evaluate: $ev" }
    Pop-Location
    Remove-Item $ws -Recurse -Force
  } else {
    $consecutiveErrors++
    Write-Output "run non riuscita (stato $state): nessuna valutazione; costo da run-flat.json"
  }
  if (Test-Path "$raw\run-flat.json") { $c = (Get-Content "$raw\run-flat.json" -Raw | ConvertFrom-Json).costUsd; if ($c) { $spentHere += [double]$c } }

  & wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/cleanup-run.sh 2>&1 | Select-String -Pattern 'ATTENZIONE|copie|nessun' | ForEach-Object { "  pulizia: " + $_.Line.Trim() }
}
Write-Output ("=== serie conclusa. Spesa stimata della serie: {0:N4} USD" -f $spentHere)
