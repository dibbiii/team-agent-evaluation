#!/usr/bin/env bash
# DENTRO bwrap, SENZA credenziali, a costo zero: superficie di controllo di Gas Town vista da un processo con l'identita'
# di un polecat (GT_ROLE=polecat ...) e con gt/bd nel PATH (come l'agente dentro tmux). Solo prove di ACCETTAZIONE di
# configurazione (con ripristino) e comandi di sola lettura / --dry-run: nessun comando viene mai eseguito sull'host,
# nessun agente viene avviato.
set -uo pipefail
export HOME=/home/sandbox
cd "$HOME/gt/seedapp"
gt dolt start >/dev/null 2>&1
export GT_ROLE=polecat GT_RIG=seedapp GT_POLECAT=probe GT_TOWN_ROOT="$HOME/gt" GT_ROOT="$HOME/gt" BD_ACTOR=seedapp/polecats/probe
run() { echo "\$ $*"; "$@" 2>&1 | head -${LINES_MAX:-6}; echo "[exit=${PIPESTATUS[0]}]"; }
echo "=== 1. un polecat puo' definire/cambiare l'agente (comando eseguito poi da gt per i NUOVI agenti)"
run gt config agent set tae-probe "/bin/true --probe"
run gt config agent get tae-probe
run gt config default-agent
echo "--- ripristino"; run gt config agent remove tae-probe
echo "=== 2. un polecat puo' cambiare impostazioni del rig, compreso exec_wrapper e role_agents"
run gt rig settings set seedapp runtime.exec_wrapper '["/bin/true"]'
run gt rig settings show seedapp
run gt rig settings unset seedapp runtime
run gt rig settings set seedapp role_agents.witness claude
run gt rig settings unset seedapp role_agents
run gt rig settings set seedapp merge_queue.merge_strategy direct
run gt rig settings unset seedapp merge_queue
echo "=== 3. un polecat puo' assegnare lavoro (spawn di altri agenti): solo --dry-run"
cd "$HOME/gt/seedapp"
B=$(bd create "probe-dry-run" -d "probe" --type task --silent 2>/dev/null)
echo "bead di prova: $B"
cd "$HOME/gt"
LINES_MAX=14 run gt sling "$B" seedapp --dry-run --no-boot
echo "=== 4. comandi che avvierebbero altri agenti: solo --help (non eseguiti)"
for c in "up" "daemon start" "mayor start" "witness start" "refinery start" "estop"; do echo "\$ gt $c --help | head -3"; gt $c --help 2>&1 | head -3; done
echo "=== 5. bd: lettura/scrittura sul database Dolt senza password dall'interno della sandbox"
cd "$HOME/gt/seedapp"
run bd list --all
run bd close "$B" -r "probe"
echo "=== 6. Dolt senza password su loopback"
dolt --host 127.0.0.1 --port 3307 --user root --no-tls sql -q "show databases" 2>&1 | head -8
echo "=== 7. dashboard: non avviata (bind predefinito)"
gt dashboard --help 2>&1 | grep -i -E "bind|port" | head -4
gt dolt stop 2>&1 | tail -1
