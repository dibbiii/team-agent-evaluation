#!/usr/bin/env bash
# Prepara in Ubuntu-26.04 (solo sotto $HOME, niente apt, niente root) gli ingredienti per Gas Town:
#  - Go 1.26.2 (tarball ufficiale go.dev, sha256 verificato contro l'elenco JSON di go.dev) in ~/gt-go
#  - Dolt 2.0.7 (tarball ufficiale GitHub, sha256 atteso = quello registrato in S00) in ~/gt-bin/dolt
#  - sorgente di gastown al commit 649b832 (tar creato con git archive dal clone Windows) in ~/gt-src/gastown
# NON compila (la compilazione di gt e bd avviene DENTRO bwrap: gastown-build.sh via gastown-sandboxed.sh --build).
# Questo script gira sull'host WSL fuori da bwrap: scarica e verifica soltanto, non esegue nulla di scaricato.
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
SRC_SHA=a3a4e36e529e9af8b4bc277cbe0c5156747af2fc6f24e9663da739eb50939e73
DOLT_SHA=8e09138596763896cbce0632cd6e779fa1df405334c6c148bc314539a3b9795a
mkdir -p "$HOME/gt-dl" "$HOME/gt-go" "$HOME/gt-bin" "$HOME/gt-gopath" "$HOME/gt-src"
cd "$HOME/gt-dl"

echo "== Go"
curl -fsSL 'https://go.dev/dl/?mode=json&include=all' -o go-dl.json
GOSHA=$(python3 - <<'PY'
import json
d = json.load(open('go-dl.json'))
for r in d:
    if r['version'] == 'go1.26.2':
        for f in r['files']:
            if f['os'] == 'linux' and f['arch'] == 'amd64' and f['kind'] == 'archive':
                print(f['sha256'])
PY
)
[ -n "$GOSHA" ] || { echo "STOP: sha256 di go1.26.2 non trovato"; exit 1; }
echo "sha256 atteso (go.dev): $GOSHA"
[ -f go1.26.2.linux-amd64.tar.gz ] || curl -fsSL https://go.dev/dl/go1.26.2.linux-amd64.tar.gz -o go1.26.2.linux-amd64.tar.gz
echo "$GOSHA  go1.26.2.linux-amd64.tar.gz" | sha256sum -c -
rm -rf "$HOME/gt-go/go"; tar -xzf go1.26.2.linux-amd64.tar.gz -C "$HOME/gt-go"
echo "Go estratto in ~/gt-go/go (non eseguito qui)"

echo "== Dolt 2.0.7"
[ -f dolt-linux-amd64.tar.gz ] || curl -fsSL -A dolt-installer https://github.com/dolthub/dolt/releases/download/v2.0.7/dolt-linux-amd64.tar.gz -o dolt-linux-amd64.tar.gz
echo "$DOLT_SHA  dolt-linux-amd64.tar.gz" | sha256sum -c -
rm -rf dolt-x; mkdir dolt-x; tar -xzf dolt-linux-amd64.tar.gz -C dolt-x
cp dolt-x/dolt-linux-amd64/bin/dolt "$HOME/gt-bin/dolt"; chmod 755 "$HOME/gt-bin/dolt"
sha256sum "$HOME/gt-bin/dolt"

echo "== sorgente gastown"
[ -f "$HOME/gt-src.tar" ] || { echo "STOP: manca ~/gt-src.tar"; exit 1; }
echo "$SRC_SHA  $HOME/gt-src.tar" | sha256sum -c -
rm -rf "$HOME/gt-src/gastown"; tar -xf "$HOME/gt-src.tar" -C "$HOME/gt-src"
ls "$HOME/gt-src/gastown" | head -5
du -sh "$HOME/gt-go" "$HOME/gt-bin" "$HOME/gt-src"
