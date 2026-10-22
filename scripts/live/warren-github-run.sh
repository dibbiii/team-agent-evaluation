#!/usr/bin/env bash
# Una run di Warren con forge GITHUB REALE (repo privato dibbiii/tae-sandbox), runtime local, bwrap reale.
# Uso: bash ~/live/warren-github-run.sh <stub|live> <etichetta> <variante-stub|HARD-N>
#   stub: claude FINTO (~/stub-bin-gh/claude), HOME fittizio per il server, nessuna credenziale Claude toccata.
#         terzo argomento = narrow | broad | break (vedi warren-github-stub-claude.sh)
#   live: vero Claude Code SOLO dentro la sandbox bwrap di Warren; terzo argomento = HARD-N (prompt in ~/hard-prompts).
# Il token GitHub (~/.tae-gh-token) e' letto qui e passato SOLO nell'ambiente del processo server di Warren
# (WARREN_GIT_TOKEN, `env -i`): non e' nell'ambiente del CLI ne' dell'agente. Non e' mai stampato.
# Dopo la run il server resta vivo CI_WAIT_S secondi (default 150) per osservare se Warren agisce sulla CI; durante
# l'attesa si interroga l'API GitHub (PR, check-runs, status, azioni) e si salvano i JSON in $ROOT/github/.
# Uscite: ~/live-runs/<ts>-gh-<etichetta>/ ; ~/out/<run-id>.tar (solo modalita' live); ~/tae-github-created.txt (PR e branch creati).
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
MODE="${1:-}"; LABEL="${2:-}"; ARG3="${3:-}"
case "$MODE" in stub|live) ;; *) echo "uso: warren-github-run.sh stub|live etichetta variante|HARD-N"; exit 2;; esac
[[ "$LABEL" =~ ^[a-z0-9-]+$ ]] || { echo "etichetta non valida"; exit 2; }
REAL_HOME="$HOME"; PORT="${WARREN_LIVE_PORT:-18080}"; MODEL="${WARREN_RUN_MODEL:-claude-sonnet-5-5}"
MAXCOST="${MAX_COST_USD:-1}"; CI_WAIT="${CI_WAIT_S:-150}"
if [ "$MODE" = stub ]; then RUN_TIMEOUT="${RUN_TIMEOUT_S:-180}"; else RUN_TIMEOUT="${RUN_TIMEOUT_S:-900}"; fi
TS="$(date -u +%Y%m%dT%H%M%SZ)"; ROOT="$REAL_HOME/live-runs/$TS-gh-$LABEL"; DATA="$ROOT/data"; GH="$ROOT/github"
mkdir -p "$ROOT" "$DATA" "$GH" "$ROOT/cli-home" "$REAL_HOME/out"
URL="http://127.0.0.1:$PORT"; CLONE_URL="https://github.com/dibbiii/tae-sandbox.git"
API() { bash "$REAL_HOME/live/warren-github-api.sh" "$@"; }
body() { sed '$d'; }   # toglie l'ultima riga "HTTP nnn"
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
[ -s "$REAL_HOME/.tae-gh-token" ] || { echo "STOP: manca il file token"; exit 1; }

MAIN0="$(API GET /git/ref/heads/main | body | jq -r '.object.sha // empty')"
[ -n "$MAIN0" ] || { echo "STOP: non riesco a leggere main dal forge"; exit 1; }
log "main del forge PRIMA: $MAIN0"

PATHREAL="$REAL_HOME/.local/bin:$REAL_HOME/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ "$MODE" = stub ]; then
  mkdir -p "$REAL_HOME/stub-bin-gh"; cp "$REAL_HOME/live/warren-github-stub-claude.sh" "$REAL_HOME/stub-bin-gh/claude"; chmod 755 "$REAL_HOME/stub-bin-gh/claude"
  SRV_PATH="$REAL_HOME/stub-bin-gh:$PATHREAL"; SRV_HOME="$ROOT/server-home"; mkdir -p "$SRV_HOME"
  PROMPT="Prova di Warren con forge GitHub: applica la modifica di prova. [variant=${ARG3:-narrow}]"
else
  SRV_PATH="$PATHREAL"; SRV_HOME="$REAL_HOME"
  [[ "$ARG3" =~ ^HARD-[0-9]+$ ]] || { echo "live: serve HARD-N"; exit 2; }
  [ -s "$REAL_HOME/hard-prompts/$ARG3.txt" ] || { echo "STOP: manca il prompt"; exit 1; }
  PROMPT="$(cat "$REAL_HOME/hard-prompts/$ARG3.txt")"
fi
printf '%s\n' "$PROMPT" > "$ROOT/prompt.txt"
printf '[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n' > "$ROOT/git-config"
SRV_ENV=("PATH=$SRV_PATH" "HOME=$SRV_HOME" "BUN_INSTALL=$REAL_HOME/.bun" "LANG=C.UTF-8"
  "WARREN_API_TOKEN=tae-dummy-token" "WARREN_DATA_DIR=$DATA" "WARREN_BIND_HOST=127.0.0.1" "WARREN_BIND_PORT=$PORT"
  "WARREN_RUNTIME=local" "WARREN_FORGE=github" "WARREN_DISABLE_UI=1" "WARREN_LOG_LEVEL=info" "GIT_CONFIG_GLOBAL=$ROOT/git-config"
  "WARREN_GIT_AUTHOR_NAME=tae-warren-bot" "WARREN_GIT_AUTHOR_EMAIL=tae-warren-bot@example.invalid"
  "WARREN_GIT_TOKEN=$(cat "$REAL_HOME/.tae-gh-token")")

SRV_PID=""; SAMP_PID=""
cleanup() {
  [ -n "$SAMP_PID" ] && kill "$SAMP_PID" 2>/dev/null
  if [ -n "$SRV_PID" ] && kill -0 "$SRV_PID" 2>/dev/null; then
    kids="$(pgrep -P "$SRV_PID" 2>/dev/null | tr '\n' ' ')"; kill -TERM "$SRV_PID" 2>/dev/null
    for _ in $(seq 1 100); do kill -0 "$SRV_PID" 2>/dev/null || break; sleep 0.1; done
    kill -0 "$SRV_PID" 2>/dev/null && { log "server non uscito: SIGKILL"; kill -KILL "$SRV_PID" 2>/dev/null; }
    wait "$SRV_PID" 2>/dev/null
    for k in $kids; do kill -0 "$k" 2>/dev/null && kill -TERM "$k" 2>/dev/null; done
  fi
  log "server fermato"
  [ -d "$DATA" ] && find "$DATA" -name '.credentials.json*' -print -delete 2>/dev/null | sed 's/^/copia credenziali rimossa: /'
  n="$(grep -rl 'github_pat_' "$ROOT" 2>/dev/null | wc -l)"; echo "controllo token: file con 'github_pat_' sotto $ROOT = $n"
}
trap cleanup EXIT

( cd "$REAL_HOME/warren" && exec env -i "${SRV_ENV[@]}" bun src/cli/main.ts serve ) > "$ROOT/serve.log" 2>&1 &
SRV_PID=$!; log "server pid=$SRV_PID port=$PORT forge=github"
up=0; for _ in $(seq 1 300); do curl -fsS -m 1 "$URL/healthz" >/dev/null 2>&1 && { up=1; break; }; kill -0 "$SRV_PID" 2>/dev/null || break; sleep 0.1; done
[ "$up" = 1 ] || { log "ERRORE: server non pronto"; tail -20 "$ROOT/serve.log" | sed 's/github_pat_[A-Za-z0-9_]*/[TOKEN]/g'; exit 1; }
AUTH=(-H "Authorization: Bearer tae-dummy-token")
rcode="$(curl -s -m 10 -o "$ROOT/readyz.json" -w '%{http_code}' "${AUTH[@]}" "$URL/readyz")"
log "readyz HTTP $rcode: $(jq -c . "$ROOT/readyz.json" 2>/dev/null | cut -c1-240)"
[ "$rcode" = 200 ] || { log "ERRORE: /readyz != 200"; exit 1; }
PRE_CLAUDE=" $(pgrep -f 'claude/versions|(^|/)claude( |$)' | tr '\n' ' ')"
log "claude gia' presenti PRIMA (non nostri):$PRE_CLAUDE"
: > "$ROOT/claude-procs.txt"
( seen=" "; while :; do for p in $(pgrep -f 'claude/versions|(^|/)claude( |$)'); do case "$PRE_CLAUDE$seen" in *" $p "*) continue;; esac
    seen="$seen$p "; printf 'pid=%s exe=%s\n' "$p" "$(readlink /proc/$p/exe 2>/dev/null)" >> "$ROOT/claude-procs.txt"; done; sleep 0.2; done ) &
SAMP_PID=$!

curl -s -m 120 "${AUTH[@]}" -H 'Content-Type: application/json' -X POST "$URL/projects" -d "{\"gitUrl\":\"$CLONE_URL\"}" -o "$ROOT/project.json" -w 'POST /projects HTTP %{http_code}\n'
PROJ="$(jq -r '.id // empty' "$ROOT/project.json")"
[ -n "$PROJ" ] || { log "ERRORE: progetto non registrato"; sed 's/github_pat_[A-Za-z0-9_]*/[TOKEN]/g' "$ROOT/project.json" | head -c 600; exit 1; }
log "progetto $PROJ"; jq -c 'del(.gitUrl)|with_entries(select((.value|type)!="object"))' "$ROOT/project.json" | cut -c1-300

CLI=(env -i "PATH=$PATHREAL" "HOME=$ROOT/cli-home" "BUN_INSTALL=$REAL_HOME/.bun" "WARREN_BASE_URL=$URL" "WARREN_API_TOKEN=tae-dummy-token")
T0="$(date +%s)"
log "dispatch: warren run --max-cost-usd $MAXCOST --model $MODEL claude-code $PROJ -p <prompt ${#PROMPT} car.> ($MODE $ARG3)"
( cd "$REAL_HOME/warren" && timeout "$RUN_TIMEOUT" "${CLI[@]}" bun src/cli/main.ts run --max-cost-usd "$MAXCOST" --model "$MODEL" claude-code "$PROJ" -p "$PROMPT" ) > "$ROOT/run.ndjson" 2> "$ROOT/run.err"
CLI_RC=$?; T1="$(date +%s)"
log "warren run terminato: exit=$CLI_RC (124 = timeout) in $((T1 - T0)) s"
[ -s "$ROOT/run.err" ] && { log "stderr del CLI:"; head -20 "$ROOT/run.err" | sed 's/github_pat_[A-Za-z0-9_]*/[TOKEN]/g'; }

curl -s -m 20 "${AUTH[@]}" "$URL/runs" -o "$ROOT/runs.json"
RUN_ID="$(jq -r '.runs[0].id // empty' "$ROOT/runs.json")"; [ -n "$RUN_ID" ] || { log "ERRORE: nessuna run"; exit 1; }
snap() { # $1 = suffisso: stato e eventi della run
  curl -s -m 20 "${AUTH[@]}" "$URL/runs/$RUN_ID" -o "$ROOT/run$1.json"
  curl -s -m 60 "${AUTH[@]}" "$URL/runs/$RUN_ID/events?limit=5000" -o "$ROOT/events$1.ndjson"
  jq '(.run // .)' "$ROOT/run$1.json" > "$ROOT/run-flat$1.json"; }
snap ""
STATE="$(jq -r '.state // empty' "$ROOT/run-flat.json")"
log "run $RUN_ID stato=$STATE"
jq -c '{id,state,failureReason,costUsd,costBasis,startedAt,endedAt,branch,prUrl,tokensInput,tokensOutput}|with_entries(select(.value!=null))' "$ROOT/run-flat.json"
echo "modello init: $(jq -r 'select(.kind=="state_change")|.payload|select(.subtype=="init")|.model' "$ROOT/events.ndjson" | head -1)"
echo "result: $(jq -c 'select(.kind=="state_change")|.payload|select(has("total_cost_usd"))|{total_cost_usd,num_turns,terminal_reason,duration_api_ms}' "$ROOT/events.ndjson" | head -1)"
echo "eventi reap/run/budget/ci/pr:"; jq -c 'select(.kind|test("^(reap|run|budget|ci|pr|watchdog)"))|{kind,p:(.payload|tostring|.[0:200])}' "$ROOT/events.ndjson" | sed 's/github_pat_[A-Za-z0-9_]*/[TOKEN]/g'

BRANCH="warren/$RUN_ID"; PRURL="$(jq -r '.prUrl // empty' "$ROOT/run-flat.json")"; PRN="${PRURL##*/}"
echo "run.prUrl = $PRURL"
if [[ "$PRN" =~ ^[0-9]+$ ]]; then
  echo "PR $PRN branch $BRANCH" >> "$REAL_HOME/tae-github-created.txt"
  API GET "/pulls/$PRN" | body > "$GH/pr.json"
  jq -c '{number,state,draft,title,user:.user.login,head:.head.ref,base:.base.ref,merged,mergeable,mergeable_state,auto_merge,changed_files,commits,additions,deletions,labels:[.labels[].name]}' "$GH/pr.json"
  echo "--- corpo della PR (primi 1500 car.):"; jq -r '.body' "$GH/pr.json" | head -c 1500; echo
  echo "--- commit della PR (autore / committer / messaggio):"
  API GET "/pulls/$PRN/commits" | body > "$GH/commits.json"
  jq -r '.[]|"\(.sha[0:8]) author=\(.commit.author.name) <\(.commit.author.email)> committer=\(.commit.committer.name) <\(.commit.committer.email)> gh_author=\(.author.login // "null") verified=\(.commit.verification.verified) | \(.commit.message|split("\n")[0])"' "$GH/commits.json"
  echo "--- file nel diff della PR:"
  API GET "/pulls/$PRN/files?per_page=100" | body > "$GH/files.json"; jq -r '.[]|"  \(.status) \(.filename)"' "$GH/files.json"
  LEAK="$(jq -r '.[].filename' "$GH/files.json" | grep -E '^(\.claude|\.sandbox-tmp|\.warren)(/|$)|credentials|\.claude\.json' || true)"
  if [ -n "$LEAK" ]; then echo "ATTENZIONE: file di stato/credenziali NEL BRANCH: $LEAK"; else echo "nessun file .claude/.warren/.sandbox-tmp/credenziali nel diff della PR"; fi
  HEADSHA="$(jq -r '.head.sha' "$GH/pr.json")"
  if [ "$MODE" = live ]; then
    XDIR="$(mktemp -d "$REAL_HOME/.export.XXXXXX")"
    if [ "$(OUT="$XDIR/t.tgz" LOC=1 API GET "/tarball/$HEADSHA")" = "HTTP 200" ]; then
      mkdir "$XDIR/x"; tar -xzf "$XDIR/t.tgz" -C "$XDIR/x" --strip-components=1
      rm -rf "$XDIR/x/.claude" "$XDIR/x/.sandbox-tmp" "$XDIR/x/.warren" "$XDIR/x/.claude.json" "$XDIR/x/.git"
      tar -cf "$REAL_HOME/out/$RUN_ID.tar" -C "$XDIR/x" . && echo "export: ~/out/$RUN_ID.tar ($(stat -c %s "$REAL_HOME/out/$RUN_ID.tar") byte)"
    else echo "ERRORE: tarball non scaricato"; fi
    rm -rf "$XDIR"
  fi
  echo "--- osservazione CI per ${CI_WAIT}s (server Warren ancora vivo)"
  EV0="$(wc -l < "$ROOT/events.ndjson")"
  end=$(( $(date +%s) + CI_WAIT )); prev=""
  while [ "$(date +%s)" -lt "$end" ]; do
    cr="$(API GET "/commits/$HEADSHA/check-runs" | body)"; st="$(API GET "/commits/$HEADSHA/status" | body)"
    ms="$(API GET "/pulls/$PRN" | body | jq -r '.mergeable_state')"
    line="check-runs: $(jq -c '[.check_runs[]?|{name,status,conclusion}]|if length==0 then (.|tostring) else . end' <<<"$cr" 2>/dev/null || echo "$cr" | head -c 120) | status: $(jq -c '{state,n:(.statuses|length)}' <<<"$st" 2>/dev/null || echo err) | mergeable_state=$ms"
    if [ "$line" != "$prev" ]; then log "$line"; prev="$line"; fi
    if jq -e '[.check_runs[]?|select(.status!="completed")]|length==0 and (.check_runs|length>0)' <<<"$cr" >/dev/null 2>&1; then sleep 5; break; fi
    sleep 8
  done
  echo "$cr" > "$GH/check-runs.json"; echo "$st" > "$GH/status.json"
  API GET "/actions/runs?head_sha=$HEADSHA" | body > "$GH/actions-runs.json"
  log "actions/runs: $(jq -c '[.workflow_runs[]?|{name,event,status,conclusion}]' "$GH/actions-runs.json" 2>/dev/null | head -c 300) | $(jq -r '.message // empty' "$GH/actions-runs.json" 2>/dev/null)"
  API GET "/pulls/$PRN" | body > "$GH/pr-after.json"
  jq -c '{state,merged,mergeable_state,auto_merge,comments,review_comments,commits}' "$GH/pr-after.json"
  snap "-after"
  echo "eventi nuovi dopo l'attesa CI: $(( $(wc -l < "$ROOT/events-after.ndjson") - EV0 )); run stato dopo: $(jq -r .state "$ROOT/run-flat-after.json")"
  jq -c 'select(.kind|test("^(ci|pr|reap)"))|{kind}' "$ROOT/events-after.ndjson" | sort | uniq -c
  API GET "/issues/$PRN/comments" | body | jq -c '[.[]|{user:.user.login,body:(.body|.[0:200])}]'
  API GET "/pulls/$PRN/reviews" | body | jq -c '[.[]|{user:.user.login,state}]'
else
  echo "nessuna PR aperta (prUrl non valido)"
fi
echo "main del forge DOPO: $(API GET /git/ref/heads/main | body | jq -r '.object.sha') (prima: $MAIN0)"
sleep 0.3
if grep -q 'share/claude/versions' "$ROOT/claude-procs.txt"; then echo "VERO CLAUDE AVVIATO DURANTE LA RUN: SI ($(wc -l < "$ROOT/claude-procs.txt") processi)"; else echo "VERO CLAUDE AVVIATO DURANTE LA RUN: NO"; fi
echo "RIEPILOGO mode=$MODE label=$LABEL run=$RUN_ID state=$STATE cli_exit=$CLI_RC pr=$PRN dir=$ROOT"
[ "$STATE" = succeeded ] && exit 0 || exit 1
