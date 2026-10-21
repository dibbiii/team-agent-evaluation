#!/usr/bin/env bash
# Esporta src/ e test/ (e package.json) del workspace ~/pc-ws/<nome> in ~/out/<tag>.tar, SENZA .claude/ e senza .git.
# Stampa stato git, log e identita' dei commit per il report. Uso: bash ~/paperclip-export.sh <workspace> <tag>
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
WS="$HOME/pc-ws/${1:?workspace}"; TAG="${2:?tag}"
[ -d "$WS" ] || { echo "workspace assente"; exit 1; }
mkdir -p "$HOME/out"
G=(env GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null git -C "$WS")
echo "== git status"; "${G[@]}" status --short
echo "== branch: $("${G[@]}" branch --show-current)  HEAD: $("${G[@]}" rev-parse --short HEAD)"
echo "== log (autore | committer | oggetto)"; "${G[@]}" log --format='%h | %an <%ae> | %cn <%ce> | %s' | cat
echo "== file cambiati rispetto al baseline"; "${G[@]}" diff --stat HEAD~$("${G[@]}" rev-list --count HEAD~1..HEAD 2>/dev/null || echo 0) 2>/dev/null | tail -8
echo "== file non tracciati/ignorati notevoli"; ls -A "$WS"
echo "== .claude/ nel ramo? $("${G[@]}" ls-files .claude | tr '\n' ' ')"
tar -cf "$HOME/out/$TAG.tar" -C "$WS" package.json src test
echo "== tar: $(tar -tf "$HOME/out/$TAG.tar" | tr '\n' ' ')"
