# Copia (lato Windows -> distribuzione Ubuntu-26.04) gli script della prova Warren+GitHub e i prompt HARD.
# Nessun token e' toccato qui. Uso: powershell -NoProfile -File scripts\live\warren-github-deploy.ps1
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dst = '\\wsl.localhost\Ubuntu-26.04\home\dibbi'
$utf8 = New-Object System.Text.UTF8Encoding($false)
New-Item -ItemType Directory -Force "$dst\live", "$dst\hard-prompts" | Out-Null
foreach ($n in 'warren-github-run.sh', 'warren-github-stub-claude.sh', 'warren-github-cleanup.sh', 'warren-github-merge-probe.sh', 'warren-s0-state.sh', 'sandbox-net-check.sh') {
  $p = "$repo\scripts\live\$n"; if (-not (Test-Path $p)) { continue }
  [IO.File]::WriteAllText("$dst\live\$n", [IO.File]::ReadAllText($p).Replace("`r`n", "`n"), $utf8)
}
[IO.File]::WriteAllText("$dst\live\warren-github-api.sh", [IO.File]::ReadAllText("$repo\scripts\live\warren-github-api.sh").Replace("`r`n", "`n"), $utf8)
foreach ($k in 'HARD-5', 'HARD-6') {
  $tmp = Join-Path $env:TEMP "hardprompt-$k.txt"
  node "$repo\scripts\live\warren-hard-prompt.mjs" $k $tmp | Out-Null
  [IO.File]::WriteAllText("$dst\hard-prompts\$k.txt", [IO.File]::ReadAllText($tmp).Replace("`r`n", "`n"), $utf8); Remove-Item $tmp
}
Write-Output 'deploy ok'
