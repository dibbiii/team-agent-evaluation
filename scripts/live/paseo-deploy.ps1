# Copia, dal lato Windows, gli script paseo-* dentro Ubuntu-26.04 (~/paseo-*.sh, ~/ps/paseo-probe.mjs, ~/paseo-*.mjs).
# Fine riga LF, UTF-8 senza BOM. Non esegue nulla dentro la distribuzione.
# Uso: powershell -NoProfile -File scripts\live\paseo-deploy.ps1
$ErrorActionPreference = 'Stop'
$env:WSL_UTF8 = '1'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dst = '\\wsl.localhost\Ubuntu-26.04\home\dibbi'
if (-not (Test-Path $dst)) { throw "Distribuzione non raggiungibile: $dst" }
$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($f in Get-ChildItem "$repo\scripts\live" -Include 'paseo-*.sh', 'paseo-*.mjs' -Recurse) {
  $text = [IO.File]::ReadAllText($f.FullName).Replace("`r`n", "`n")
  $target = if ($f.Name -in @('paseo-probe.mjs', 'paseo-run.mjs')) { "$dst\ps\$($f.Name)" } else { "$dst\$($f.Name)" }
  [IO.File]::WriteAllText($target, $text, $utf8)
  Write-Output "copiato $($f.Name)"
}
