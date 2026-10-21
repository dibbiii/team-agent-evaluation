#!/usr/bin/env bash
# DENTRO bwrap (gastown-sandboxed.sh [--creds]): crea il bead con il prompt di ISSUE-N, lo assegna con `gt sling ... --no-boot`
# (solo un polecat; NIENTE witness/refinery/mayor/deacon avviati da noi), osserva tutto con un campionatore e ferma tutto allo
# scadere del tempo (arresto manuale = kill del server tmux per nome del socket + stop di dolt).
# Uso: gastown-monitor-inner.sh <etichetta> <secondi-max> <ISSUE-N> [argomenti extra di gt sling...]
# Uscite: ~/obs/<etichetta>/ (campioni di processo con namespace, pane tmux catturati, stato bead/git, eventi).
set -uo pipefail
export HOME=/home/sandbox
LABEL="${1:?etichetta}"; MAX="${2:?secondi}"; ISSUE="${3:?ISSUE-N}"; shift 3
OBS="$HOME/obs/$LABEL"; mkdir -p "$OBS"; cd "$HOME/gt"
T0=$(date +%s)
ts() { date -u +%FT%TZ; }
log() { printf '%s %s\n' "$(ts)" "$*" | tee -a "$OBS/events.txt"; }
MYPID_NS=$(readlink /proc/self/ns/pid); MYMNT_NS=$(readlink /proc/self/ns/mnt)
log "inizio etichetta=$LABEL max=${MAX}s issue=$ISSUE ns-pid-sandbox=$MYPID_NS ns-mnt-sandbox=$MYMNT_NS"
sockets() { ls /tmp/tmux-1000 2>/dev/null; }
sampler() {
  local n=0
  while :; do
    local now; now=$(ts)
    {
      echo "### $now t+$(( $(date +%s) - T0 ))s"
      ps -eo pid,ppid,etimes,rss,args --no-headers | grep -E ' (claude|node|tmux|dolt|gt|bd|bwrap)( |$)|claude|tmux|dolt|/gt |gt (sling|done|prime|hook|nudge|mail|daemon)' | grep -v grep | grep -v 'ps -eo' | cut -c1-200
      for s in $(sockets); do echo "tmux[$s]: $(tmux -L "$s" list-sessions -F '#{session_name}(#{session_windows}w)' 2>/dev/null | tr '\n' ' ')"; done
      for p in $(pgrep -x claude; pgrep -f '/claude( |$)'); do :; done
    } >> "$OBS/sample.txt"
    # namespace e nomi delle variabili d'ambiente dei processi claude (una volta per pid)
    for p in $(pgrep -f 'claude' 2>/dev/null); do
      [ -r "/proc/$p/environ" ] || continue
      [ -e "$OBS/env-$p.txt" ] && continue
      c=$(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | cut -c1-300)
      case "$c" in *claude*) ;; *) continue;; esac
      { echo "pid=$p cmd=$c"; echo "ns-pid=$(readlink /proc/$p/ns/pid) ns-mnt=$(readlink /proc/$p/ns/mnt) cwd=$(readlink /proc/$p/cwd)"
        echo "--- NOMI delle variabili d'ambiente (mai i valori):"; tr '\0' '\n' < /proc/$p/environ | cut -d= -f1 | sort | tr '\n' ' '; echo; } > "$OBS/env-$p.txt" 2>/dev/null
    done
    n=$((n+1))
    if [ $((n % 5)) -eq 0 ]; then
      for s in $(sockets); do
        for sess in $(tmux -L "$s" list-sessions -F '#{session_name}' 2>/dev/null); do
          { echo "### $now $sess"; tmux -L "$s" capture-pane -p -t "$sess" -S -60 2>/dev/null; } >> "$OBS/pane-$sess.txt"
        done
      done
    fi
    sleep 3
  done
}
# Guardia di budget: somma i token dalle trascrizioni di Claude Code (~/.claude/projects/**/*.jsonl, messaggi assistant unici)
# e stima il costo a listino (sonnet-5-5: 2/10 USD per MTok in/out, cache read 0,20, cache write ASSUNTO 2,50). Se supera il tetto
# (file ~/obs-cap, default 0.9 USD) o se compare un modello diverso da claude-sonnet-5-5 ferma tutto (kill-server tmux).
CAP=$(cat "$HOME/obs-cap" 2>/dev/null || echo 0.9)
budget_stop() {
  touch "$OBS/stop.flag"
  for s in $(sockets); do tmux -L "$s" kill-server 2>/dev/null; done
}
cost_check() {
  local files; files=$(find "$HOME/.claude/projects" -name '*.jsonl' 2>/dev/null)
  [ -n "$files" ] || { echo "t+$(( $(date +%s) - T0 ))s nessuna trascrizione" >> "$OBS/cost.txt"; return 0; }
  # shellcheck disable=SC2086
  cat $files | jq -s -r '[.[]|select(.type=="assistant" and .message.usage and .message.model!="<synthetic>")]|unique_by(.message.id)|
    {n:length, models:(map(.message.model)|unique|join(",")), i:(map(.message.usage.input_tokens//0)|add//0), o:(map(.message.usage.output_tokens//0)|add//0),
     cr:(map(.message.usage.cache_read_input_tokens//0)|add//0), cw:(map(.message.usage.cache_creation_input_tokens//0)|add//0)}|
    "\(.n) \(.models) \(.i) \(.o) \(.cr) \(.cw) \((.i*2+.o*10+.cr*0.2+.cw*2.5)/1000000)"' 2>/dev/null > "$OBS/cost.last"
  local line; line=$(cat "$OBS/cost.last"); echo "t+$(( $(date +%s) - T0 ))s msgs/modelli/in/out/cr/cw/costoUSD: $line" >> "$OBS/cost.txt"
  local usd models; usd=$(echo "$line" | awk '{print $NF}'); models=$(echo "$line" | awk '{print $2}')
  case "$models" in *opus*) log "STOP BUDGET: modello costoso inatteso '$models'"; budget_stop; return 1;; esac
  if awk -v u="${usd:-0}" -v c="$CAP" 'BEGIN{exit !(u>c)}'; then log "STOP BUDGET: costo stimato $usd > tetto $CAP"; budget_stop; return 1; fi
}
budget_watch() {
  local n=0
  while :; do
    n=$((n+1)); [ $((n % 3)) -eq 0 ] && cost_check
    sleep 6
  done
}
sampler & SP=$!
budget_watch & CP=$!
cleanup() {
  kill "$SP" "$CP" 2>/dev/null
  for s in $(sockets); do tmux -L "$s" kill-server 2>/dev/null; done
}
trap 'cleanup' EXIT

log "gt dolt start"; gt dolt start 2>&1 | tail -3 | tee -a "$OBS/events.txt"
cd "$HOME/gt/seedapp"
BEAD=$(bd create "$ISSUE (benchmark)" --body-file "$HOME/prompt-$ISSUE.txt" --type task --silent 2>"$OBS/bd-create.err")
log "bead=$BEAD ($(cat "$OBS/bd-create.err" | head -2 | tr '\n' ' '))"
[ -n "$BEAD" ] || { log "STOP: bead non creato"; exit 1; }
echo "$BEAD" > "$OBS/bead.txt"
cd "$HOME/gt"
log "gt sling $BEAD seedapp --no-boot $*"
( gt sling "$BEAD" seedapp --no-boot "$@" > "$OBS/sling.out" 2>&1; echo "sling-exit=$?" >> "$OBS/sling.out" ) &
SL=$!
DEAD_SINCE=""
while :; do
  el=$(( $(date +%s) - T0 ))
  if [ -e "$OBS/stop.flag" ]; then log "arresto per guardia di budget (vedi sopra)"; break; fi
  if [ "$el" -ge "$MAX" ]; then log "LIMITE DI TEMPO ${MAX}s raggiunto: arresto manuale"; break; fi
  nsess=0; for s in $(sockets); do nsess=$((nsess + $(tmux -L "$s" list-sessions 2>/dev/null | wc -l))); done
  nclaude=$(pgrep -f '(^|/)claude( |$)' 2>/dev/null | wc -l)
  if ! kill -0 "$SL" 2>/dev/null && [ "$nsess" -eq 0 ] && [ "$el" -gt 20 ]; then
    [ -z "$DEAD_SINCE" ] && DEAD_SINCE=$(date +%s) && log "nessuna sessione tmux dopo il termine di sling"
    [ $(( $(date +%s) - DEAD_SINCE )) -ge 10 ] && { log "fine: nessuna sessione"; break; }
  else DEAD_SINCE=""; fi
  sleep 3
done
log "raccolta finale"
{
  echo "== sling.out"; cat "$OBS/sling.out"
  echo "== sessioni tmux"; for s in $(sockets); do echo "[$s]"; tmux -L "$s" list-sessions 2>&1; done
  echo "== bd show $BEAD"; (cd "$HOME/gt/seedapp" && bd show "$BEAD" 2>&1 | head -60)
  echo "== bd list (rig)"; (cd "$HOME/gt/seedapp" && bd list --all 2>&1 | head -40)
  echo "== bd list (town)"; (cd "$HOME/gt" && bd list --all 2>&1 | head -40)
  echo "== gt status"; (cd "$HOME/gt" && gt status 2>&1 | head -40)
  echo "== origin: rami"; git --git-dir="$HOME/origin/seed-app.git" branch -a 2>&1
  echo "== origin: log di tutti i rami (autore | committer | oggetto)"; git --git-dir="$HOME/origin/seed-app.git" log --all --format='%h %D | %an <%ae> | %cn <%ce> | %s' 2>&1 | head -20
  echo "== polecats"; ls -la "$HOME/gt/seedapp/polecats" 2>&1
  for d in "$HOME"/gt/seedapp/polecats/*/; do [ -d "$d" ] && { echo "-- $d"; ls "$d"; for w in "$d"*/; do [ -e "$w/.git" ] && { echo "worktree $w"; git -C "$w" status --short 2>&1 | head; git -C "$w" branch --show-current; git -C "$w" log --format='%h | %an <%ae> | %cn <%ce> | %s' -5 2>&1; }; done; }; done
  echo "== gt costs"; (cd "$HOME/gt" && gt costs 2>&1 | head -30)
} > "$OBS/final.txt" 2>&1
cp "$HOME/gt/.events.jsonl" "$OBS/town-events.jsonl" 2>/dev/null
cp "$HOME/gt/seedapp/.events.jsonl" "$OBS/rig-events.jsonl" 2>/dev/null
cleanup
sleep 2
log "gt dolt stop"; gt dolt stop 2>&1 | tail -2 | tee -a "$OBS/events.txt"
log "processi residui nella sandbox:"; ps -eo pid,args --no-headers | grep -E 'claude|tmux|dolt|node' | grep -v grep | cut -c1-120 | tee -a "$OBS/events.txt"
log "fine (durata $(( $(date +%s) - T0 ))s)"
