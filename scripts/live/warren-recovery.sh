#!/usr/bin/env bash
# S06 (crash, recovery, continuita') su Warren, SENZA modello, SENZA credenziali, costo 0.
# Uso (dentro Ubuntu-26.04, utente dibbi):  bash ~/live/warren-recovery.sh <1|2|3|4|5|all> ["[wip_commit=1]"]  (2o argomento opzionale: marcatori aggiunti al prompt)
#   1  kill -9 del server (control plane) a meta' di una run, poi riavvio sulla STESSA data dir
#   2  kill -9 del solo processo dell'agente (stub) durante la run, server vivo
#   3  SIGTERM (arresto pulito) del server durante la run, poi riavvio
#   4  watchdog: stub che si blocca senza output + WARREN_RUN_HEARTBEAT_TIMEOUT_MS breve
#   5  (extra) rescue: il bare repo rifiuta il push di warren/run_* -> salvage (warren/rescue/<id>) -> `warren run --rescue-from`
# Ogni prova parte da stato pulito: nuovo bare repo, nuova data dir, nuovo progetto.
# Lo stub e' ~/stub-bin-slow/claude (scritto da questo script): applica la correzione di ISSUE-1 SENZA committare,
# poi attende N secondi (marcatore nel prompt "[slow=N]", default 25), poi committa e termina.
#   [hang=1]       dopo la modifica si blocca per 3600 s senza output e senza commit
#   [wip_commit=1] prima dell'attesa committa un "wip" (lavoro parziale GIA' committato)
# Il vero `claude` NON viene mai eseguito: il server ha PATH con ~/stub-bin-slow in testa e HOME fittizio.
# Variabili: EXTRA_MARKERS (es. "[wip_commit=1]" aggiunto al prompt), WARREN_LIVE_PORT (18080), SLOW_S (25), POLL_TIMEOUT_S (150), KEEP=1 (non cancella le cartelle di prova)
# Processi: si uccidono SOLO PID avviati da questo script (server, CLI) e i discendenti registrati per PID+starttime.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
WHICH="${1:-}"; EXTRA_MARKERS="${2:-${EXTRA_MARKERS:-}}"
case "$WHICH" in 1|2|3|4|5|all) ;; *) echo "uso: warren-recovery.sh 1|2|3|4|5|all"; exit 2;; esac

RH="$HOME"
PORT="${WARREN_LIVE_PORT:-18080}"
SLOW_S="${SLOW_S:-25}"
POLL_TIMEOUT_S="${POLL_TIMEOUT_S:-150}"
TOKEN="tae-dummy-token"
BARE="$RH/fixtures/recovery-seed.git"
URL="http://127.0.0.1:$PORT"
FAKE_URL="fake://tae/seed-app"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
STUB_DIR="$RH/stub-bin-slow"
PATHREAL="$RH/.local/bin:$RH/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
AUTH=(-H "Authorization: Bearer $TOKEN")
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
hr() { printf '\n######## %s\n' "$*"; }

# ---------------------------------------------------------------- stub lento
install_stub() {
  mkdir -p "$STUB_DIR"
  cat > "$STUB_DIR/claude" <<'STUB'
#!/usr/bin/env bash
# `claude` FINTO e LENTO per le prove di recovery (nessun modello, nessuna credenziale, costo 0).
set -uo pipefail
stdin="$(cat)"
emit() { printf '%s\n' "$1"; }
say() { jq -nc --arg t "$1" '{type:"assistant",message:{role:"assistant",content:[{type:"text",text:$t}]}}'; }
prompt="$(printf '%s' "$stdin" | jq -rs '[.[]|select(.type=="user")|.message.content[0].text]|join("\n")' 2>/dev/null || true)"
[ -n "$prompt" ] || prompt="$stdin"
issue="$(printf '%s' "$prompt" | grep -o 'ISSUE-[0-9]\+' | head -1 || true)"
slow="$(printf '%s' "$prompt" | grep -o '\[slow=[0-9]\+\]' | head -1 | tr -dc '0-9')"; slow="${slow:-25}"
echo "stub-slow: avviato pid=$$ issue='${issue}' slow=${slow}" >&2
emit '{"type":"system","subtype":"init","session_id":"sess_tae_stub_slow","model":"claude-stub","tools":[]}'
emit "$(say "stub-slow: ricevuto prompt, issue='${issue}'")"
if [ "$issue" = "ISSUE-1" ] && [ -f src/pricing.js ]; then
  sed -i 's/Math\.floor/Math.round/' src/pricing.js
  emit "$(say "stub-slow: modifica scritta in src/pricing.js (NON committata)")"
  if [[ "$prompt" == *"[wip_commit=1]"* ]]; then
    git add src/pricing.js
    git -c user.name=claude-stub -c user.email=stub@example.invalid commit -q -m "wip(ISSUE-1): lavoro parziale (stub)" >&2
    printf 'appunti non committati\n' > NOTES-uncommitted.txt
    emit "$(say "stub-slow: wip committato, appunti NON committati in NOTES-uncommitted.txt")"
  fi
fi
if [[ "$prompt" == *"[hang=1]"* ]]; then
  echo "stub-slow: HANG (sleep 3600 senza output)" >&2
  sleep 3600
fi
echo "stub-slow: attendo ${slow}s" >&2
for _ in $(seq 1 "$slow"); do sleep 1; done
if [ "$issue" = "ISSUE-1" ] && [ -f src/pricing.js ]; then
  git add src/pricing.js
  git -c user.name=claude-stub -c user.email=stub@example.invalid \
    commit -q --allow-empty -m "fix(ISSUE-1): arrotonda al centesimo piu' vicino (stub lento)" >&2 || echo "stub-slow: COMMIT FALLITO" >&2
  emit "$(say "stub-slow: fix committato")"
fi
emit '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.000421,"usage":{"input_tokens":1200,"output_tokens":400,"cache_read_input_tokens":5000,"cache_creation_input_tokens":200}}'
exit 0
STUB
  chmod 755 "$STUB_DIR/claude"
}

# ---------------------------------------------------------------- gestione processi (solo PID nostri)
SRV_PID=""; CLI_PID=""
TRACKED=()   # elementi "pid:starttime" dei discendenti registrati
starttime() { awk '{print $22}' "/proc/$1/stat" 2>/dev/null; }
desc() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do echo "$c"; desc "$c"; done; }
alive_same() { # pid:starttime vivo e con lo stesso starttime (nessun riuso del PID)
  local p="${1%%:*}" st="${1##*:}"
  [ -n "$(starttime "$p")" ] && [ "$(starttime "$p")" = "$st" ]
}
show_procs() { # etichetta; elenco dei processi tracciati: vivo/morto
  local e p st args
  echo "-- processi tracciati ($1):"
  for e in "${TRACKED[@]:-}"; do
    [ -n "$e" ] || continue
    p="${e%%:*}"
    if alive_same "$e"; then
      args="$(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | cut -c1-90)"
      printf '   pid=%s VIVO ppid=%s stat=%s args=%s\n' "$p" "$(awk '{print $4}' /proc/$p/stat)" "$(awk '{print $3}' /proc/$p/stat)" "$args"
    else
      printf '   pid=%s MORTO\n' "$p"
    fi
  done
  echo "-- bun/bwrap/stub attualmente in ps (fuori dal server nuovo):"
  ps -eo pid,ppid,etimes,stat,args --width 150 | grep -E 'bwrap|stub-bin-slow|bun src/cli' | grep -v grep | cut -c1-150 | sed 's/^/   /'
}
track_tree() { # registra i discendenti del server + i processi stub/bwrap visibili ora
  local p all
  all="$(desc "$SRV_PID") $(pgrep -f 'stub-bin-slow/claude' 2>/dev/null) $(pgrep -x bwrap 2>/dev/null)"
  for p in $all; do
    [ -n "$(starttime "$p")" ] || continue
    local e="$p:$(starttime "$p")"
    case " ${TRACKED[*]:-} " in *" $e "*) ;; *) TRACKED+=("$e");; esac
  done
}
kill_tracked() { # TERM poi KILL dei soli PID registrati ancora vivi
  local e p
  for e in "${TRACKED[@]:-}"; do
    [ -n "$e" ] || continue
    if alive_same "$e"; then p="${e%%:*}"; log "pulizia: TERM al processo tracciato $p"; kill -TERM "$p" 2>/dev/null; fi
  done
  sleep 1
  for e in "${TRACKED[@]:-}"; do
    [ -n "$e" ] || continue
    if alive_same "$e"; then p="${e%%:*}"; log "pulizia: KILL al processo tracciato $p"; kill -KILL "$p" 2>/dev/null; fi
  done
}
stop_server_clean() {
  if [ -n "$SRV_PID" ] && kill -0 "$SRV_PID" 2>/dev/null; then
    kill -TERM "$SRV_PID" 2>/dev/null
    for _ in $(seq 1 100); do kill -0 "$SRV_PID" 2>/dev/null || break; sleep 0.1; done
    kill -0 "$SRV_PID" 2>/dev/null && { log "server non uscito: KILL"; kill -KILL "$SRV_PID" 2>/dev/null; }
    wait "$SRV_PID" 2>/dev/null
  fi
}
cleanup_test() {
  [ -n "$CLI_PID" ] && kill -0 "$CLI_PID" 2>/dev/null && kill -TERM "$CLI_PID" 2>/dev/null
  track_tree 2>/dev/null
  stop_server_clean
  kill_tracked
  [ -n "$CLI_PID" ] && wait "$CLI_PID" 2>/dev/null
  CLI_PID=""; SRV_PID=""
}

# ---------------------------------------------------------------- setup di una prova
setup_test() { # N [extra env del server: KEY=VAL ...]
  TN="$1"; shift
  ROOT="$RH/live-runs/recovery-$TS-t$TN"; DATA="$ROOT/data"; STATE_FILE="$ROOT/fake-forge-state.json"
  SRV_HOME="$ROOT/server-home"; STARTS=0; TRACKED=()
  mkdir -p "$ROOT" "$DATA" "$SRV_HOME" "$ROOT/cli-home"
  install_stub
  bash "$RH/live/fixture-setup.sh" "$BARE" > "$ROOT/fixture.log" 2>&1 || { cat "$ROOT/fixture.log"; exit 1; }
  BASE_SHA="$(git --git-dir="$BARE" rev-parse refs/heads/main)"
  cat > "$ROOT/git-config" <<GITCFG
[init]
	defaultBranch = main
[url "$BARE"]
	insteadOf = $FAKE_URL
GITCFG
  SRV_ENV=(
    "PATH=$STUB_DIR:$PATHREAL" "HOME=$SRV_HOME" "BUN_INSTALL=$RH/.bun" "LANG=C.UTF-8"
    "WARREN_API_TOKEN=$TOKEN" "WARREN_DATA_DIR=$DATA" "WARREN_BIND_HOST=127.0.0.1" "WARREN_BIND_PORT=$PORT"
    "WARREN_RUNTIME=local" "WARREN_FORGE=fake" "WARREN_FAKE_FORGE_STATE_FILE=$STATE_FILE"
    "WARREN_DISABLE_UI=1" "WARREN_LOG_LEVEL=info"
    "GIT_CONFIG_GLOBAL=$ROOT/git-config"
    "GIT_AUTHOR_NAME=tae-warren" "GIT_AUTHOR_EMAIL=tae-warren@example.invalid"
    "GIT_COMMITTER_NAME=tae-warren" "GIT_COMMITTER_EMAIL=tae-warren@example.invalid"
    "$@"
  )
  log "prova $TN: root=$ROOT base=$BASE_SHA claude visto dal server: $(PATH="$STUB_DIR:$PATHREAL" command -v claude)"
  log "env extra del server: ${*:-nessuno}"
}
start_server() {
  STARTS=$((STARTS + 1))
  ( cd "$RH/warren" && exec env -i "${SRV_ENV[@]}" bun src/cli/main.ts serve ) > "$ROOT/serve-$STARTS.log" 2>&1 &
  SRV_PID=$!
  SRV_T0="$(date +%s.%N)"
  local up=0
  for _ in $(seq 1 300); do
    curl -fsS -m 1 "$URL/healthz" >/dev/null 2>&1 && { up=1; break; }
    kill -0 "$SRV_PID" 2>/dev/null || break
    sleep 0.1
  done
  [ "$up" = 1 ] || { log "ERRORE: server non pronto"; tail -20 "$ROOT/serve-$STARTS.log"; return 1; }
  local rc; rc="$(curl -s -m 10 -o "$ROOT/readyz-$STARTS.json" -w '%{http_code}' "${AUTH[@]}" "$URL/readyz")"
  log "server #$STARTS pid=$SRV_PID (starttime $(starttime "$SRV_PID")) readyz HTTP $rc"
  [ "$rc" = 200 ]
}
register_project() {
  curl -s -m 60 "${AUTH[@]}" -H 'Content-Type: application/json' -X POST "$URL/projects" \
    -d "{\"gitUrl\":\"$FAKE_URL\"}" -o "$ROOT/project.json"
  PROJ="$(jq -r '.id // empty' "$ROOT/project.json")"
  [ -n "$PROJ" ] || { log "ERRORE: progetto non registrato"; cat "$ROOT/project.json"; return 1; }
  log "progetto $PROJ"
}
build_prompt() { # $1 = marcatori extra (es. "[slow=25] [hang=1]")
  jq -r --arg k "ISSUE-1" '.[]|select(.key==$k)|
    "Sei uno sviluppatore. Lavora nella cartella corrente (una piccola libreria Node senza dipendenze, prezzi in centesimi).",
    "Issue \(.key) (\(.type), priorità \(.priority)): \(.summary)",
    "",
    .description,
    "",
    "Criteri di accettazione:",
    (.acceptance[] | "- " + .),
    "",
    "Implementa la modifica, aggiungi o aggiorna i test in test/ e verifica con \"npm test\". Non cambiare l'"'"'interfaccia pubblica oltre quanto richiesto.",
    "Al termine rispondi con un riassunto di 3 righe."' "$RH/issue-catalog.json" > "$ROOT/prompt.txt"
  printf '%s %s\n' "$1" "${EXTRA_MARKERS:-}" >> "$ROOT/prompt.txt"
  PROMPT="$(cat "$ROOT/prompt.txt")"
}
dispatch() { # lancia il CLI `warren run` in background (PID nostro)
  local out="${1:-$ROOT/run.ndjson}" err="${2:-$ROOT/run.err}"
  ( cd "$RH/warren" && exec timeout 400 env -i "PATH=$PATHREAL" "HOME=$ROOT/cli-home" "BUN_INSTALL=$RH/.bun" \
      "WARREN_BASE_URL=$URL" "WARREN_API_TOKEN=$TOKEN" \
      bun src/cli/main.ts run --max-cost-usd 1 --model claude-sonnet-5-5 claude-code "$PROJ" -p "$PROMPT" ) \
    > "$out" 2> "$err" &
  CLI_PID=$!
  log "dispatch: CLI pid=$CLI_PID"
}

# ---------------------------------------------------------------- osservazioni
api() { curl -s -m 20 "${AUTH[@]}" "$URL$1"; }
runs_table() { # tutte le run: id stato failureReason retryOf salvageRef (date in ordine di creazione)
  api /runs | jq -r '.runs|sort_by(.createdAt)|.[]|
    "   \(.id) state=\(.state) failure=\(.failureReason // "-") retryOf=\(.retryOf // "-") salvageRef=\(.salvageRef // "-") salvagePath=\(.salvagePath // "-") exitCode=\(.exitCode // "-") branch=\(.branch // "-") prUrl=\(.prUrl // "-")"' 2>/dev/null
}
n_runs() { api /runs | jq '.runs|length' 2>/dev/null; }
first_run() { api /runs | jq -r '.runs|sort_by(.createdAt)|.[0].id // empty' 2>/dev/null; }
events_summary() { # $1 run id
  echo "   eventi di $1 (conteggio per kind; tutti i kind di sistema/reap/run/bridge/watchdog in ordine):"
  api "/runs/$1/events?limit=2000" | jq -r '.kind' 2>/dev/null | sort | uniq -c | sort -rn | sed 's/^/     /'
  api "/runs/$1/events?limit=2000" | jq -c 'select(.kind|test("^(reap|run|bridge|watchdog|cancel|state)"))|{ts:.ts[11:23],kind,p:(.payload|tostring|.[0:230])}' 2>/dev/null | sed 's/^/     /'
}
bare_state() {
  echo "-- bare repo ($BARE): riferimenti"
  git --git-dir="$BARE" for-each-ref --format='   %(refname) %(objectname:short) %(subject)' 2>&1
  echo "-- forge finto: PR registrate"
  [ -f "$STATE_FILE" ] && jq -c '.prs' "$STATE_FILE" || echo "   state file assente"
}
ws_state() { # stato su disco di workspace/worktree della data dir (a)
  echo "-- (a) file/worktree sotto la data dir:"
  local d
  for d in $(find "$DATA" -maxdepth 5 -type f -name pricing.js -path '*src*' 2>/dev/null); do
    local w="${d%/src/pricing.js}"
    echo "   workspace: $w"
    echo "     Math.round presente in src/pricing.js: $(grep -c 'Math\.round' "$d")  Math.floor: $(grep -c 'Math\.floor' "$d")"
    echo "     file extra non committati: $(ls "$w" 2>/dev/null | grep -E 'NOTES' | tr '\n' ' ')"
    if [ -e "$w/.git" ]; then
      GIT_CONFIG_GLOBAL=/dev/null git -C "$w" status --porcelain 2>&1 | sed 's/^/     status: /' | head -8
      GIT_CONFIG_GLOBAL=/dev/null git -C "$w" log --oneline -3 2>&1 | sed 's/^/     log: /'
    fi
  done
  [ -z "$(find "$DATA" -maxdepth 5 -type f -name pricing.js -path '*src*' 2>/dev/null)" ] && echo "   nessun workspace con src/pricing.js sotto la data dir"
  echo "   manifest/dir di run in data:"; find "$DATA" -maxdepth 3 \( -name 'local-*' -o -name manifest* -o -name salvage \) 2>/dev/null | sed 's/^/     /' | head
  [ -d "$DATA/salvage" ] && ls -la "$DATA/salvage" | sed 's/^/     salvage: /'
}
db_runs() { # lettura DIRETTA (sola lettura) di warren.db: funziona anche a server fermo
  echo "-- (b) DB $DATA/warren.db (lettura diretta, readonly):"
  ( cd "$RH/warren" && env -i "PATH=$PATHREAL" "HOME=$SRV_HOME" "BUN_INSTALL=$RH/.bun" "DBP=$DATA/warren.db" bun -e '
    import { Database } from "bun:sqlite";
    const d = new Database(process.env.DBP, { readonly: true });
    for (const r of d.query("select id,state,failure_reason,retry_of,salvage_ref,salvage_path from runs order by created_at").all())
      console.log("   DB: " + JSON.stringify(r));
    const n = d.query("select run_id, count(*) c from events group by run_id").all();
    console.log("   DB eventi per run: " + JSON.stringify(n));' ) 2>&1 | head -12
}
snap() { # etichetta
  hr "SNAPSHOT: $1  (prova $TN, $(date -u +%H:%M:%S))"
  db_runs
  echo "-- (b) stato delle run via API di Warren (n=$(n_runs); vuoto = server non raggiungibile):"; runs_table
  local r; for r in $(api /runs | jq -r '.runs|sort_by(.createdAt)|.[].id' 2>/dev/null); do events_summary "$r"; done
  show_procs "$1"
  ws_state
  bare_state
}
wait_for_stub_write() { # attende l'evento "modifica scritta" nella run (stub a meta' lavoro); poi 2 s
  local t0 rid
  t0=$(date +%s)
  while [ $(( $(date +%s) - t0 )) -lt 90 ]; do
    rid="$(first_run)"
    if [ -n "$rid" ] && api "/runs/$rid/events?limit=2000" | grep -q 'modifica scritta'; then
      RID="$rid"; sleep 2; return 0
    fi
    sleep 0.5
  done
  log "ERRORE: lo stub non ha scritto la modifica entro 90 s"; return 1
}
poll_terminal() { # attende che nessuna run sia queued/running (timeout POLL_TIMEOUT_S), stampando le transizioni
  local t0 last="" cur nonterm
  t0=$(date +%s)
  while :; do
    cur="$(runs_table | sed 's/ salvagePath=.*//')"
    [ "$cur" != "$last" ] && { log "[+$(( $(date +%s) - t0 ))s] transizione:"; echo "$cur"; last="$cur"; }
    nonterm="$(api /runs | jq '[.runs[]|select(.state=="queued" or .state=="running")]|length' 2>/dev/null)"
    [ "${nonterm:-1}" = 0 ] && [ "$(n_runs)" -ge 1 ] 2>/dev/null && { log "tutte le run sono terminali dopo $(( $(date +%s) - t0 )) s"; return 0; }
    [ $(( $(date +%s) - t0 )) -ge "$POLL_TIMEOUT_S" ] && { log "TIMEOUT di polling ($POLL_TIMEOUT_S s): resta una run non terminale"; return 1; }
    sleep 2
  done
}
try_rescue() { # $1 = run id da cui fare rescue
  hr "warren run --rescue-from $1 (documentato in docs/cli-reference.md)"
  ( cd "$RH/warren" && timeout 120 env -i "PATH=$PATHREAL" "HOME=$ROOT/cli-home" "BUN_INSTALL=$RH/.bun" \
      "WARREN_BASE_URL=$URL" "WARREN_API_TOKEN=$TOKEN" bun src/cli/main.ts run --rescue-from "$1" ) \
    > "$ROOT/rescue.out" 2> "$ROOT/rescue.err"
  echo "exit=$?"; echo "-- stdout (prime 12 righe):"; head -12 "$ROOT/rescue.out" | cut -c1-260; echo "-- stderr:"; head -12 "$ROOT/rescue.err" | cut -c1-300
}
finish_test() {
  cleanup_test
  hr "PULIZIA prova $TN"
  ps -eo pid,ppid,args --width 150 | grep -E 'bwrap|stub-bin-slow|bun src/cli' | grep -v grep | sed 's/^/RESIDUO: /' || true
  echo "(nessuna riga RESIDUO sopra = nessun bun/bwrap/stub residuo)"
  find "$DATA" -name '.credentials.json' 2>/dev/null | sed 's/^/ATTENZIONE credenziali: /'
  if [ "${KEEP:-0}" != 1 ]; then rm -rf "$ROOT" "$BARE"; echo "cancellati: $ROOT e $BARE"; fi
}

# ---------------------------------------------------------------- prove
test1() {
  setup_test 1; start_server || return 1; register_project || return 1
  build_prompt "[slow=$SLOW_S]"; dispatch
  wait_for_stub_write || return 1
  track_tree; hr "PRIMA del kill -9 (prova 1, server pid=$SRV_PID, run=$RID)"; show_procs "pre-kill"; ws_state
  local TK; TK="$(date +%s.%N)"
  log "kill -9 del server pid=$SRV_PID"; kill -9 "$SRV_PID"; wait "$SRV_PID" 2>/dev/null
  sleep 3
  snap "3 s dopo kill -9 del server (server NON riavviato)"
  log "stato CLI dopo la morte del server: vivo=$(kill -0 "$CLI_PID" 2>/dev/null && echo si || echo no)"
  log "attendo oltre la durata dello stub ($SLOW_S s) per vedere se i figli sopravvissuti concludono da soli"
  sleep $((SLOW_S + 5))
  snap "dopo $((SLOW_S + 8)) s dal kill, server ancora giu'"
  log "RIAVVIO dello stesso server sulla STESSA data dir ($DATA)"
  start_server || return 1
  log "tempo kill -> riavvio pronto: $(echo "$(date +%s.%N) - $TK" | bc 2>/dev/null) s"
  sleep 3; snap "3 s dopo il riavvio"
  poll_terminal
  sleep 2; snap "stato finale dopo il riavvio (polling terminato)"
  local rid2; rid2="$(first_run)"
  try_rescue "$rid2"
  sleep 1; runs_table
  log "CLI iniziale: exit/uscite: $(head -c 300 "$ROOT/run.err")"; tail -3 "$ROOT/run.ndjson" | cut -c1-200
  finish_test
}

test2() {
  setup_test 2; start_server || return 1; register_project || return 1
  build_prompt "[slow=$SLOW_S]"; dispatch
  wait_for_stub_write || return 1
  track_tree; hr "PRIMA dell'uccisione dello stub (prova 2, run=$RID)"; show_procs "pre-kill"; ws_state
  # il processo dell'agente: il bash che esegue stub-bin-slow/claude (PID registrato, discendente del server)
  local stub=""
  for p in $(desc "$SRV_PID"); do
    if tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | grep -q 'stub-bin-slow/claude'; then stub="$p"; fi
  done
  [ -n "$stub" ] || { log "ERRORE: PID dello stub non trovato fra i discendenti del server"; return 1; }
  log "stub pid=$stub (cmdline: $(tr '\0' ' ' < /proc/$stub/cmdline | cut -c1-100)) -> kill -9 SOLO di questo PID"
  kill -9 "$stub"
  sleep 3; snap "3 s dopo kill -9 dello stub (server vivo)"
  poll_terminal
  sleep 2; snap "stato finale (server mai riavviato)"
  local rid; rid="$(first_run)"; try_rescue "$rid"
  runs_table
  finish_test
}

test3() {
  setup_test 3; start_server || return 1; register_project || return 1
  build_prompt "[slow=$SLOW_S]"; dispatch
  wait_for_stub_write || return 1
  track_tree; hr "PRIMA del SIGTERM (prova 3, server pid=$SRV_PID, run=$RID)"; show_procs "pre-term"; ws_state
  local T0 T1; T0="$(date +%s.%N)"
  log "SIGTERM al server pid=$SRV_PID"; kill -TERM "$SRV_PID"
  for _ in $(seq 1 600); do kill -0 "$SRV_PID" 2>/dev/null || break; sleep 0.1; done
  T1="$(date +%s.%N)"
  if kill -0 "$SRV_PID" 2>/dev/null; then log "server NON uscito entro 60 s: lo si ferma con KILL (solo suo PID)"; kill -KILL "$SRV_PID"; fi
  wait "$SRV_PID" 2>/dev/null; log "exit code del server: $?"
  echo "tempo di arresto (SIGTERM -> processo sparito): $(echo "$T1 - $T0" | bc) s"
  sed -n '1,400p' "$ROOT/serve-1.log" | grep -i -E 'stopping|shutdown|error|warn' | cut -c1-220 | tail -8 | sed 's/^/   serve.log: /'
  sleep 3; snap "3 s dopo SIGTERM (server fermo)"
  log "attendo $((SLOW_S + 5)) s a server fermo"; sleep $((SLOW_S + 5))
  snap "dopo $((SLOW_S + 8)) s dal SIGTERM, server ancora fermo"
  log "RIAVVIO sulla STESSA data dir"; start_server || return 1
  sleep 3; snap "3 s dopo il riavvio"
  poll_terminal
  sleep 2; snap "stato finale dopo il riavvio"
  local rid2; rid2="$(first_run)"; try_rescue "$rid2"
  runs_table
  finish_test
}

test4() {
  # watchdog: budget breve (20 s di silenzio) e tick 3 s: solo variabili d'ambiente documentate, sorgente intatto.
  setup_test 4 WARREN_RUN_HEARTBEAT_TIMEOUT_MS=20000 WARREN_WATCHDOG_TICK_MS=3000
  start_server || return 1
  grep -i 'watchdog' "$ROOT/serve-1.log" | cut -c1-260 | sed 's/^/   serve.log: /'
  register_project || return 1
  build_prompt "[hang=1] [wip_commit=1]"; dispatch
  wait_for_stub_write || return 1
  track_tree; hr "PRIMA del watchdog (prova 4, run=$RID): stub bloccato senza output"; show_procs "pre-watchdog"; ws_state
  local T0; T0=$(date +%s); log "inizio attesa del watchdog (budget 20 s di silenzio, tick 3 s)"
  poll_terminal
  log "durata dall'avvio dell'attesa al terminale: $(( $(date +%s) - T0 )) s"
  sleep 3; snap "stato finale dopo il watchdog"
  api "/runs/$(first_run)/events?limit=2000" | jq -c 'select(.kind=="watchdog.timed_out")|.payload' | sed 's/^/   watchdog.timed_out: /'
  finish_test
}

test5() {
  # Rescue vero: il bare repo rifiuta SOLO refs/heads/warren/run_* (il push del branch della run fallisce), mentre
  # warren/rescue/<id> passa. Reap deve fare salvage prima di distruggere il workspace e stampare run.salvage_ref.
  setup_test 5
  cat > "$BARE/hooks/pre-receive" <<'HOOK'
#!/bin/sh
while read old new ref; do
  case "$ref" in refs/heads/warren/run_*) echo "pre-receive (prova S06): rifiuto $ref" >&2; exit 1;; esac
done
exit 0
HOOK
  chmod 755 "$BARE/hooks/pre-receive"
  start_server || return 1; register_project || return 1
  build_prompt "[slow=3]"; dispatch
  poll_terminal
  sleep 2; snap "dopo la run con push rifiutato dal bare repo"
  local rid; rid="$(first_run)"
  log "CLI iniziale: $(tail -2 "$ROOT/run.ndjson" | cut -c1-220)"
  rm -f "$BARE/hooks/pre-receive"; log "rimosso l'hook (l'operatore ha risolto la causa del rifiuto)"
  try_rescue "$rid"
  sleep 2; snap "dopo --rescue-from"
  finish_test
}

trap 'cleanup_test' EXIT
[ "${WARREN_RECOVERY_SOURCE_ONLY:-0}" = 1 ] && return 0 2>/dev/null   # per debug: carica solo le funzioni
case "$WHICH" in
  1) test1;; 2) test2;; 3) test3;; 4) test4;; 5) test5;;
  all) for t in 1 2 3 4 5; do hr "=============== PROVA $t ==============="; "test$t"; cleanup_test; done;;
esac
