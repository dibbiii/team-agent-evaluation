#!/usr/bin/env bash
# Da eseguire DENTRO bwrap con gastown-sandboxed.sh --build. Compila:
#  - bd v1.0.5 (go install, CGO_ENABLED=0, come il CI di Gas Town: versione di go.mod)
#  - gt dal commit 649b832 con CGO_ENABLED=0 e tag gms_pure_go (NON c'e' gcc ne' ICU di sviluppo nella distribuzione: ICU4C
#    serve solo a go-icu-regex via cgo; il tag gms_pure_go usa l'implementazione Go pura). Stessi -ldflags del Makefile
#    (BuiltProperly=1), Version = "1.2.1+649b832".
set -euo pipefail
export PATH="$PATH"
cd /home/dibbi/gt-src/gastown
go version
echo "== bd v1.0.5"
time go install github.com/steveyegge/beads/cmd/bd@v1.0.5
ls -la /home/dibbi/gt-gopath/bin/bd
cp /home/dibbi/gt-gopath/bin/bd /home/dibbi/gt-bin/bd
echo "== gt"
LD="-s -w -X github.com/steveyegge/gastown/internal/cmd.Version=1.2.1+649b832 -X github.com/steveyegge/gastown/internal/cmd.Commit=649b832b7672bc7a2dbef26f5983aba6198b819b -X github.com/steveyegge/gastown/internal/cmd.BuildTime=$(date -u +%FT%TZ) -X github.com/steveyegge/gastown/internal/cmd.BuiltProperly=1"
time go build -buildvcs=false -tags gms_pure_go -ldflags "$LD" -o /home/dibbi/gt-bin/gt ./cmd/gt
ls -la /home/dibbi/gt-bin
/home/dibbi/gt-bin/gt version || true
/home/dibbi/gt-bin/bd version || true
/home/dibbi/gt-bin/dolt version || true
sha256sum /home/dibbi/gt-bin/gt /home/dibbi/gt-bin/bd /home/dibbi/gt-bin/dolt
