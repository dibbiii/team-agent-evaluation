#!/usr/bin/env bash
# Invia UN turno all'agente `main` del Gateway (client dentro bwrap, senza credenziali) e intanto campiona dall'host (ogni 0,2 s)
# i processi claude/bwrap/node: pid, ppid, catena dei padri, namespace (pid/mnt), cwd, NOMI (mai valori) delle variabili d'ambiente.
# Uso: bash ~/openclaw-turn.sh <etichetta> <file-prompt> [timeout-s]   Uscite: ~/oc-turn-<etichetta>.{json,sample.txt}
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
LAB="${1:?etichetta}"; PF="${2:?file prompt}"; TMO="${3:-300}"
OUT="$HOME/oc-turn-$LAB.json"; SAMP="$HOME/oc-turn-$LAB.sample.txt"; : > "$SAMP"
HOSTMNT="$(readlink /proc/self/ns/mnt)"; HOSTPID="$(readlink /proc/self/ns/pid)"
echo "host ns: $HOSTPID $HOSTMNT" >> "$SAMP"
touch "$HOME/.oc-sampling"
( declare -A seen
  while [ -f "$HOME/.oc-sampling" ]; do
    for d in /proc/[0-9]*; do
      p="${d#/proc/}"; c="$(tr '\0' ' ' < $d/cmdline 2>/dev/null | cut -c1-110)"
      case "$c" in *claude*|*bwrap*|*openclaw*|*"node "*) ;; *) continue;; esac
      [ -n "${seen[$p]:-}" ] && continue; seen[$p]=1
      parent="$(awk '{print $4}' $d/stat 2>/dev/null)"
      names="$(tr '\0' '\n' < $d/environ 2>/dev/null | cut -d= -f1 | sort | tr '\n' ' ')"
      echo "$(date -u +%T.%N | cut -c1-12) pid=$p ppid=$parent pidns=$(readlink $d/ns/pid) mntns=$(readlink $d/ns/mnt) cwd=$(readlink $d/cwd) cmd=[$c] envnames=[$names]" >> "$SAMP"
    done
    sleep 0.2
  done ) &
SP=$!

T0=$(date +%s.%N)
bash "$HOME/bin/oc-sandboxed" --ws ws1 -- timeout "$TMO" openclaw agent --agent main --session-key "agent:main:tae-${SESSION:-$LAB}" --message "$(cat "$PF")" --json --timeout "$TMO" > "$OUT" 2> "$HOME/oc-turn-$LAB.err"
RC=$?
T1=$(date +%s.%N)
rm -f "$HOME/.oc-sampling"; sleep 0.5; kill "$SP" 2>/dev/null
echo "exit=$RC durata=$(echo "$T1 - $T0" | bc 2>/dev/null || awk -v a=$T1 -v b=$T0 'BEGIN{print a-b}') s"
echo "== stdout (primi 3000 car)"; head -c 3000 "$OUT"; echo
echo "== stderr (primi 1500 car)"; head -c 1500 "$HOME/oc-turn-$LAB.err"; echo
echo "== campioni processi: $(wc -l < "$SAMP") righe (in $SAMP)"
