#!/usr/bin/env bash
# Host WSL (git/tar su file di prova miei): esporta package.json, src/, test/ del worktree del polecat in ~/out/<tag>.tar
# SENZA .claude/, .beads/, CLAUDE.md, .runtime. Stampa stato git, log (autore|committer) e rami dell'origin.
# Uso: bash ~/gastown-export.sh <polecat> <tag>
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP"; exit 3; }
WS="$HOME/gt-sbhome/gt/seedapp/polecats/${1:?polecat}/seedapp"; TAG="${2:?tag}"
[ -d "$WS" ] || { echo "worktree assente"; exit 1; }
mkdir -p "$HOME/out"
G=(env GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null git -c safe.directory='*' -C "$WS")
echo "== status"; "${G[@]}" status --short
echo "== branch $("${G[@]}" branch --show-current)"
echo "== log"; "${G[@]}" log --format='%h | %an <%ae> | %cn <%ce> | %s' | cat
echo "== diff vs baseline"; "${G[@]}" diff --stat 73f78fa HEAD | cat
tar -cf "$HOME/out/$TAG.tar" -C "$WS" package.json src test
echo "== tar: $(tar -tf "$HOME/out/$TAG.tar" | tr '\n' ' ')"
echo "== origin rami"; git --git-dir="$HOME/gt-sbhome/origin/seed-app.git" branch -a
