# Copia, dal lato Windows, gli script live e i dati d'ingresso dentro Ubuntu-26.04 (~/live, ~/seed-app.tar,
# ~/issue-catalog.json). Fine riga LF e UTF-8 senza BOM. Non esegue nulla dentro la distribuzione.
# Uso (da qualunque cartella):  powershell -NoProfile -File scripts\live\deploy-to-wsl.ps1
$ErrorActionPreference = 'Stop'
$env:WSL_UTF8 = '1'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dst = '\\wsl.localhost\Ubuntu-26.04\home\dibbi'
if (-not (Test-Path $dst)) { throw "Distribuzione non raggiungibile: $dst" }
New-Item -ItemType Directory -Force "$dst\live" | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($name in 'fixture-setup.sh', 'stub-claude.sh', 'warren-run.sh') {
  $text = [IO.File]::ReadAllText("$repo\scripts\live\$name").Replace("`r`n", "`n")
  [IO.File]::WriteAllText("$dst\live\$name", $text, $utf8)
  Write-Output "copiato live/$name"
}
$cat = [IO.File]::ReadAllText("$repo\fixtures\issue-catalog\issues.json").Replace("`r`n", "`n")
[IO.File]::WriteAllText("$dst\issue-catalog.json", $cat, $utf8)
Write-Output 'copiato issue-catalog.json'
if (Test-Path "$dst\seed-app.tar") { Remove-Item "$dst\seed-app.tar" }
tar -cf "$dst\seed-app.tar" -C "$repo\fixtures\seed-app" package.json src test
Write-Output 'creato seed-app.tar'
