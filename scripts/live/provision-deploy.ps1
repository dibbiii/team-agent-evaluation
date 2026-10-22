# Copia, dal lato Windows, gli script di provisioning dentro Ubuntu-26.04 con fine riga LF e UTF-8 senza BOM.
# Non esegue nulla dentro la distribuzione. Percorsi sempre UNC (\\wsl.localhost\...), verificati con Test-Path.
# Uso:  powershell -NoProfile -File scripts\live\provision-deploy.ps1 root   # -> /root (per l'utente root)
#       powershell -NoProfile -File scripts\live\provision-deploy.ps1 user   # -> /home/dibbi (richiede l'utente dibbi)
param([Parameter(Mandatory = $true)][ValidateSet('root', 'user')][string]$Target)
$ErrorActionPreference = 'Stop'
$env:WSL_UTF8 = '1'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Copy-Lf($src, $dstDir, $name) {
  if (-not (Test-Path $dstDir)) { throw "Destinazione non raggiungibile: $dstDir" }
  $text = [IO.File]::ReadAllText($src).Replace("`r`n", "`n")
  [IO.File]::WriteAllText("$dstDir\$name", $text, $utf8)
  Write-Output "copiato $name -> $dstDir"
}
if ($Target -eq 'root') {
  $d = '\\wsl.localhost\Ubuntu-26.04\root'
  Copy-Lf "$repo\scripts\wsl-isolate.sh" $d 'wsl-isolate.sh'
  Copy-Lf "$repo\scripts\live\provision-root.sh" $d 'provision-root.sh'
} else {
  $d = '\\wsl.localhost\Ubuntu-26.04\home\dibbi'
  if (-not (Test-Path $d)) { throw "Distribuzione o utente non raggiungibile: $d" }
  New-Item -ItemType Directory -Force "$d\live" | Out-Null
  foreach ($n in 'provision-user.sh', 'provision-verify.sh', 'warren-setup.sh', 'warren-boot-check.sh', 'sandbox-net-check.sh', 'model-pin-check.sh', 'fixture-setup.sh', 'stub-claude.sh', 'warren-run.sh') {
    Copy-Lf "$repo\scripts\live\$n" "$d\live" $n
  }
}
