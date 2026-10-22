#!/usr/bin/env bash
# Una run di Warren (runtime local, bwrap reale, forge finto) sulla fixture DIFFICILE, dentro Ubuntu-26.04.
# Uso: bash ~/live/warren-hard-run.sh <HARD-N> <etichetta>
# Claude Code gira SOLO dentro la sandbox bwrap di Warren. Fuori da bwrap partono solo: server Warren, CLI di Warren,
# git, curl, jq e un campionatore di processi (PID tracciati e fermati a fine run).
# Ingressi (copiati dal lato Windows da warren-hard-batch.ps1): ~/seed-app-hard.tar, ~/hard-prompts/<HARD-N>.txt.
# Uscite: ~/out/<run-id>.tar (albero del branch warren/<run-id>, senza .claude/.warren) e ~/live-runs/<ts>-<etichetta>/.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
ISSUE="${1:-}"; LABEL="${2:-}"
[[ "$ISSUE" =~ ^HARD-[0-9]+$ ]] || { echo "uso: warren-hard-run.sh HARD-N etichetta"; exit 2; }
[[ "$LABEL" =~ ^[a-z0-9-]+$ ]] || { echo "etichetta non valida"; exit 2; }

REAL_HOME="$HOME"
PORT="${WARREN_LIVE_PORT:-18080}"
MODEL="${WARREN_RUN_MODEL:-claude-sonnet-5-5}"
MAXCOST="${MAX_COST_USD:-1}"
RUN_TIMEOUT="${RUN_TIMEOUT_S:-900}"
TOKEN="tae-dummy-token"
BARE="$REAL_HOME/fixtures/seed-app-hard.git"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
ROOT="$REAL_HOME/live-runs/$TS-$LABEL"
DATA="$ROOT/data"
mkdir -p "$ROOT" "$DATA" "$ROOT/cli-home" "$REAL_HOME/out"
URL="http://127.0.0.1:$PORT"; FAKE_URL="fake://tae/seed-app-hard"
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

PROMPT_FILE="$REAL_HOME/hard-prompts/$ISSUE.txt"
[ -s "$PROMPT_FILE" ] || { echo "STOP: manca $PROMPT_FILE"; exit 1; }
bash "$REAL_HOME/live/warren-hard-fixture-setup.sh" "$BARE" > "$ROOT/fixture.log" 2>&1 || { cat "$ROOT/fixture.log"; exit 1; }
BASE_SHA="$(git --git-dir="$BARE" rev-parse refs/heads/main)"
log "fixture: $BARE base=$BASE_SHA ($(grep -E '^file:' "$ROOT/fixture.log"))"

cat > "$ROOT/git-config" <<GITCFG
[init]
	defaultBranch = main
[url "$BARE"]
	insteadOf = $FAKE_URL
GITCFG
STATE_FILE="$ROOT/fake-forge-state.json"
PATHREAL="$REAL_HOME/.local/bin:$REAL_HOME/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
SRV_ENV=("PATH=$PATHREAL" "HOME=$REAL_HOME" "BUN_INSTALL=$REAL_HOME/.bun" "LANG=C.UTF-8"
  "WARREN_API_TOKEN=$TOKEN" "WARREN_DATA_DIR=$DATA" "WARREN_BIND_HOST=127.0.0.1" "WARREN_BIND_PORT=$PORT"
  "WARREN_RUNTIME=local" "WARREN_FORGE=fake" "WARREN_FAKE_FORGE_STATE_FILE=$STATE_FILE"
  "WARREN_DISABLE_UI=1" "WARREN_LOG_LEVEL=info" "GIT_CONFIG_GLOBAL=$ROOT/git-config"
  "GIT_AUTHOR_NAME=tae-warren" "GIT_AUTHOR_EMAIL=tae-warren@example.invalid"
  "GIT_COMMITTER_NAME=tae-warren" "GIT_COMMITTER_EMAIL=tae-warren@example.invalid")

SRV_PID=""; SAMP_PID=""
cleanup() {
  [ -n "$SAMP_PID" ] && kill "$SAMP_PID" 2>/dev/null
  if [ -n "$SRV_PID" ] && kill -0 "$SRV_PID" 2>/dev/null; then
    kids="$(pgrep -P "$SRV_PID" 2>/dev/null | tr '\n' ' ')"
    kill -TERM "$SRV_PID" 2>/dev/null
    for _ in $(seq 1 100); do kill -0 "$SRV_PID" 2>/dev/null || break; sleep 0.1; done
    kill -0 "$SRV_PID" 2>/dev/null && { log "server non uscito: SIGKILL"; kill -KILL "$SRV_PID" 2>/dev/null; }
    wait "$SRV_PID" 2>/dev/null
    for k in $kids; do kill -0 "$k" 2>/dev/null && { log "figlio $k ancora vivo: TERM"; kill -TERM "$k" 2>/dev/null; }; done
  fi
  log "server fermato"
  # Igiene: copie di .credentials.json fatte da Warren sotto la data dir di QUESTA run (mai l'originale in ~/.claude).
  [ -d "$DATA" ] && find "$DATA" -name '.credentials.json*' -print -delete 2>/dev/null | sed 's/^/copia credenziali rimossa: /'
}
trap cleanup EXIT

( cd "$REAL_HOME/warren" && exec env -i "${SRV_ENV[@]}" bun src/cli/main.ts serve ) > "$ROOT/serve.log" 2>&1 &
SRV_PID=$!
log "server pid=$SRV_PID port=$PORT"
up=0
for _ in $(seq 1 300); do curl -fsS -m 1 "$URL/healthz" >/dev/null 2>&1 && { up=1; break; }; kill -0 "$SRV_PID" 2>/dev/null || break; sleep 0.1; done
[ "$up" = 1 ] || { log "ERRORE: server non pronto"; tail -20 "$ROOT/serve.log"; exit 1; }
AUTH=(-H "Authorization: Bearer $TOKEN")
rcode="$(curl -s -m 10 -o "$ROOT/readyz.json" -w '%{http_code}' "${AUTH[@]}" "$URL/readyz")"
log "readyz HTTP $rcode: $(jq -c . "$ROOT/readyz.json" 2>/dev/null | cut -c1-200)"
[ "$rcode" = 200 ] || { log "ERRORE: /readyz != 200"; exit 1; }

# campionatore: claude NUOVI (non presenti prima), con eseguibile reale
PRE_CLAUDE=" $(pgrep -f 'claude/versions|(^|/)claude( |$)' | tr '\n' ' ')"
log "claude gia' presenti PRIMA (non nostri):$PRE_CLAUDE"
: > "$ROOT/claude-procs.txt"
(
  seen=" "
  while :; do
    for p in $(pgrep -f 'claude/versions|(^|/)claude( |$)'); do
      case "$PRE_CLAUDE$seen" in *" $p "*) continue;; esac
      seen="$seen$p "
      printf 'pid=%s exe=%s\n' "$p" "$(readlink /proc/$p/exe 2>/dev/null)" >> "$ROOT/claude-procs.txt"
    done
    sleep 0.2
  done
) &
SAMP_PID=$!

curl -s -m 60 "${AUTH[@]}" -H 'Content-Type: application/json' -X POST "$URL/projects" -d "{\"gitUrl\":\"$FAKE_URL\"}" \
  -o "$ROOT/project.json" -w 'POST /projects HTTP %{http_code}\n'
PROJ="$(jq -r '.id // empty' "$ROOT/project.json")"
[ -n "$PROJ" ] || { log "ERRORE: progetto non registrato"; cat "$ROOT/project.json"; exit 1; }
log "progetto $PROJ"

PROMPT="$(cat "$PROMPT_FILE")"
cp "$PROMPT_FILE" "$ROOT/prompt.txt"
CLI=(env -i "PATH=$PATHREAL" "HOME=$ROOT/cli-home" "BUN_INSTALL=$REAL_HOME/.bun" "WARREN_BASE_URL=$URL" "WARREN_API_TOKEN=$TOKEN")
T0="$(date +%s)"
log "dispatch: warren run --max-cost-usd $MAXCOST --model $MODEL claude-code $PROJ -p <prompt ${#PROMPT} car.> ($ISSUE)"
( cd "$REAL_HOME/warren" && timeout "$RUN_TIMEOUT" "${CLI[@]}" bun src/cli/main.ts run \
    --max-cost-usd "$MAXCOST" --model "$MODEL" claude-code "$PROJ" -p "$PROMPT" ) > "$ROOT/run.ndjson" 2> "$ROOT/run.err"
CLI_RC=$?
T1="$(date +%s)"
log "warren run terminato: exit=$CLI_RC (124 = timeout) in $((T1 - T0)) s"
[ -s "$ROOT/run.err" ] && { log "stderr del CLI:"; head -20 "$ROOT/run.err"; }

curl -s -m 20 "${AUTH[@]}" "$URL/runs" -o "$ROOT/runs.json"
RUN_ID="$(jq -r '.runs[0].id // empty' "$ROOT/runs.json")"
[ -n "$RUN_ID" ] || { log "ERRORE: nessuna run trovata"; exit 1; }
curl -s -m 20 "${AUTH[@]}" "$URL/runs/$RUN_ID" -o "$ROOT/run.json"
curl -s -m 60 "${AUTH[@]}" "$URL/runs/$RUN_ID/events?limit=5000" -o "$ROOT/events.ndjson"
jq '(.run // .)' "$ROOT/run.json" > "$ROOT/run-flat.json"
STATE="$(jq -r '.state // empty' "$ROOT/run-flat.json")"
log "run $RUN_ID stato=$STATE"
jq -c '{id,state,failureReason,costUsd,costBasis,startedAt,endedAt,branch,prUrl,tokensInput,tokensOutput}|with_entries(select(.value!=null))' "$ROOT/run-flat.json"
echo "modello init: $(jq -r 'select(.kind=="state_change")|.payload|select(.subtype=="init")|.model' "$ROOT/events.ndjson" | head -1)"
echo "result: $(jq -c 'select(.kind=="state_change")|.payload|select(has("total_cost_usd"))|{total_cost_usd,num_turns,terminal_reason,duration_api_ms}' "$ROOT/events.ndjson" | head -1)"
echo "eventi reap/run/budget:"; jq -c 'select(.kind|test("^(reap|run|budget)\\."))|{kind,p:(.payload|tostring|.[0:160])}' "$ROOT/events.ndjson"

BRANCH="warren/$RUN_ID"
if git --git-dir="$BARE" rev-parse -q --verify "refs/heads/$BRANCH" >/dev/null; then
  echo "branch $BRANCH = $(git --git-dir="$BARE" rev-parse "refs/heads/$BRANCH")"
  git --git-dir="$BARE" log --format='commit %h %an <%ae> | %s' "$BASE_SHA..refs/heads/$BRANCH"
  git --git-dir="$BARE" diff --stat "$BASE_SHA" "refs/heads/$BRANCH" | tail -8
  LEAK="$(git --git-dir="$BARE" diff --name-only "$BASE_SHA" "refs/heads/$BRANCH" | grep -E '^(\.claude|\.sandbox-tmp|\.warren)(/|$)|credentials' || true)"
  [ -n "$LEAK" ] && echo "ATTENZIONE: file di stato/credenziali NEL BRANCH (esclusi dal tar): $LEAK"
  XDIR="$(mktemp -d "$REAL_HOME/.export.XXXXXX")"
  git --git-dir="$BARE" archive --format=tar "refs/heads/$BRANCH" | tar -x -C "$XDIR"
  rm -rf "$XDIR/.claude" "$XDIR/.sandbox-tmp" "$XDIR/.warren" "$XDIR/.claude.json"
  tar -cf "$REAL_HOME/out/$RUN_ID.tar" -C "$XDIR" .
  rm -rf "$XDIR"
  echo "export: ~/out/$RUN_ID.tar ($(stat -c %s "$REAL_HOME/out/$RUN_ID.tar") byte)"
else
  echo "branch $BRANCH ASSENTE nel bare repo"
fi
echo "PR: $( [ -f "$STATE_FILE" ] && jq -c '.prs|length' "$STATE_FILE" || echo n/d ) nel forge finto; run.prUrl = $(jq -r '.prUrl // empty' "$ROOT/run-flat.json")"
sleep 0.3
if grep -q 'share/claude/versions' "$ROOT/claude-procs.txt"; then echo "VERO CLAUDE AVVIATO DURANTE LA RUN: SI ($(wc -l < "$ROOT/claude-procs.txt") processi)"; else echo "VERO CLAUDE AVVIATO DURANTE LA RUN: NO"; fi
echo "RIEPILOGO issue=$ISSUE label=$LABEL run=$RUN_ID state=$STATE cli_exit=$CLI_RC dir=$ROOT"
[ "$STATE" = succeeded ] && exit 0 || exit 1
