# Copia, dal lato Windows, gli script gastown-*.sh|mjs in ~ di Ubuntu-26.04 e (quelli "inner", eseguiti dentro bwrap) in
# ~/gt-sbhome. LF, UTF-8 senza BOM. Non esegue nulla dentro la distribuzione.
# Uso: powershell -NoProfile -File scripts\live\gastown-deploy.ps1
$ErrorActionPreference = 'Stop'
$env:WSL_UTF8 = '1'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dst = '\\wsl.localhost\Ubuntu-26.04\home\dibbi'
if (-not (Test-Path $dst)) { throw "Distribuzione non raggiungibile: $dst" }
New-Item -ItemType Directory -Force "$dst\gt-sbhome" | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($f in Get-ChildItem "$repo\scripts\live" -Filter 'gastown-*' | Where-Object { $_.Extension -in '.sh', '.mjs' }) {
  $text = [IO.File]::ReadAllText($f.FullName).Replace("`r`n", "`n")
  [IO.File]::WriteAllText("$dst\$($f.Name)", $text, $utf8)
  if ($f.Name -match 'inner|build|probe-in|monitor') { [IO.File]::WriteAllText("$dst\gt-sbhome\$($f.Name)", $text, $utf8) }
  Write-Output "copiato $($f.Name)"
}
