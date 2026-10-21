#!/usr/bin/env bash
# Una run di Warren su un repository locale (fixture seed-app), dentro Ubuntu-26.04.
# Uso: bash ~/live/warren-run.sh <ISSUE-KEY> <stub|live>
#   stub: mette ~/stub-bin (claude FINTO, costo 0) in testa al PATH del SOLO server di questa run.
#   live: PATH reale -> il vero ~/.local/bin/claude; Warren copia le credenziali dall'HOME reale.
#         (la modalita' live NON e' stata mai eseguita nella preparazione; costa credito dell'abbonamento)
# Fa: fixture -> server -> progetto -> dispatch -> attesa terminale -> raccolta -> export tar -> stop e pulizia.
# Uscita: ~/out/<run-id>.tar (albero del branch warren/<run-id>) e ~/live-runs/<timestamp>/ (log, json).
# Variabili opzionali: WARREN_LIVE_PORT (18080), RUN_TIMEOUT_S (stub 180, live 1500), WARREN_RUN_MODEL
# (claude-sonnet-5-5), MAX_COST_USD (1), SKIP_FIXTURE=1 (non ricrea il bare repo).
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
ISSUE="${1:-}"; MODE="${2:-}"
[[ "$ISSUE" =~ ^ISSUE-[0-9]+$ ]] || { echo "uso: warren-run.sh ISSUE-N stub|live"; exit 2; }
case "$MODE" in stub|live) ;; *) echo "uso: warren-run.sh ISSUE-N stub|live"; exit 2;; esac

REAL_HOME="$HOME"
PORT="${WARREN_LIVE_PORT:-18080}"
MODEL="${WARREN_RUN_MODEL:-claude-sonnet-5-5}"
MAXCOST="${MAX_COST_USD:-1}"
if [ "$MODE" = stub ]; then RUN_TIMEOUT="${RUN_TIMEOUT_S:-180}"; else RUN_TIMEOUT="${RUN_TIMEOUT_S:-1500}"; fi
TOKEN="tae-dummy-token"
BARE="$REAL_HOME/fixtures/seed-app.git"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
ROOT="$REAL_HOME/live-runs/$TS-$MODE-$ISSUE"
DATA="$ROOT/data"
mkdir -p "$ROOT" "$DATA" "$ROOT/cli-home" "$REAL_HOME/out"
URL="http://127.0.0.1:$PORT"
FAKE_URL="fake://tae/seed-app"
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# ---- 1. fixture (bare repo nuovo) ----
if [ "${SKIP_FIXTURE:-0}" != 1 ]; then
  bash "$REAL_HOME/live/fixture-setup.sh" "$BARE" > "$ROOT/fixture.log" 2>&1 || { cat "$ROOT/fixture.log"; exit 1; }
fi
BASE_SHA="$(git --git-dir="$BARE" rev-parse refs/heads/main)"
log "fixture: $BARE base=$BASE_SHA"

# ---- 2. configurazione: git config dedicato, forge finto, ambiente minimo del server ----
cat > "$ROOT/git-config" <<GITCFG
[init]
	defaultBranch = main
[url "$BARE"]
	insteadOf = $FAKE_URL
GITCFG
STATE_FILE="$ROOT/fake-forge-state.json"
PATHREAL="$REAL_HOME/.local/bin:$REAL_HOME/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ "$MODE" = stub ]; then
  mkdir -p "$REAL_HOME/stub-bin"
  cp "$REAL_HOME/live/stub-claude.sh" "$REAL_HOME/stub-bin/claude"; chmod 755 "$REAL_HOME/stub-bin/claude"
  SRV_PATH="$REAL_HOME/stub-bin:$PATHREAL"
  # HOME fittizio SOLO per il server di prova: cosi' Warren non trova ~/.claude/.credentials.json da copiare.
  SRV_HOME="$ROOT/server-home"; mkdir -p "$SRV_HOME"
else
  SRV_PATH="$PATHREAL"
  SRV_HOME="$REAL_HOME"
fi
SRV_ENV=(
  "PATH=$SRV_PATH" "HOME=$SRV_HOME" "BUN_INSTALL=$REAL_HOME/.bun" "LANG=C.UTF-8"
  "WARREN_API_TOKEN=$TOKEN" "WARREN_DATA_DIR=$DATA" "WARREN_BIND_HOST=127.0.0.1" "WARREN_BIND_PORT=$PORT"
  "WARREN_RUNTIME=local" "WARREN_FORGE=fake" "WARREN_FAKE_FORGE_STATE_FILE=$STATE_FILE"
  "WARREN_DISABLE_UI=1" "WARREN_LOG_LEVEL=info"
  "GIT_CONFIG_GLOBAL=$ROOT/git-config"
  "GIT_AUTHOR_NAME=tae-warren" "GIT_AUTHOR_EMAIL=tae-warren@example.invalid"
  "GIT_COMMITTER_NAME=tae-warren" "GIT_COMMITTER_EMAIL=tae-warren@example.invalid"
)
echo "claude visto dal server (command -v claude con il suo PATH): $(PATH="$SRV_PATH" command -v claude)" | tee "$ROOT/claude-path.txt"

SRV_PID=""; SAMP_PID=""
cleanup() {
  [ -n "$SAMP_PID" ] && kill "$SAMP_PID" 2>/dev/null
  if [ -n "$SRV_PID" ] && kill -0 "$SRV_PID" 2>/dev/null; then
    kids="$(pgrep -P "$SRV_PID" 2>/dev/null | tr '\n' ' ')"
    kill -TERM "$SRV_PID" 2>/dev/null
    for _ in $(seq 1 100); do kill -0 "$SRV_PID" 2>/dev/null || break; sleep 0.1; done
    if kill -0 "$SRV_PID" 2>/dev/null; then log "server non uscito: SIGKILL"; kill -KILL "$SRV_PID" 2>/dev/null; fi
    wait "$SRV_PID" 2>/dev/null
    # solo i figli diretti che il server aveva al momento dello stop e che sono ancora vivi
    for k in $kids; do
      if kill -0 "$k" 2>/dev/null; then log "figlio $k ancora vivo: TERM"; kill -TERM "$k" 2>/dev/null; fi
    done
  fi
  log "server fermato"
  # Igiene: copie di .credentials.json che Warren ha fatto dentro la data dir di QUESTA run (solo in live).
  # Si rimuovono solo le copie sotto $DATA; l'originale in ~/.claude non viene mai toccato ne' letto.
  if [ -d "$DATA" ]; then
    find "$DATA" -name '.credentials.json' -print -delete 2>/dev/null | sed 's/^/copia credenziali rimossa: /'
  fi
}
trap cleanup EXIT

# ---- 3. server ----
( cd "$REAL_HOME/warren" && exec env -i "${SRV_ENV[@]}" bun src/cli/main.ts serve ) > "$ROOT/serve.log" 2>&1 &
SRV_PID=$!
log "server pid=$SRV_PID port=$PORT mode=$MODE"
up=0
for _ in $(seq 1 300); do
  if curl -fsS -m 1 "$URL/healthz" >/dev/null 2>&1; then up=1; break; fi
  kill -0 "$SRV_PID" 2>/dev/null || break
  sleep 0.1
done
[ "$up" = 1 ] || { log "ERRORE: server non pronto"; tail -20 "$ROOT/serve.log"; exit 1; }
AUTH=(-H "Authorization: Bearer $TOKEN")
rcode="$(curl -s -m 10 -o "$ROOT/readyz.json" -w '%{http_code}' "${AUTH[@]}" "$URL/readyz")"
log "readyz HTTP $rcode: $(jq -c . "$ROOT/readyz.json" 2>/dev/null | cut -c1-300)"
[ "$rcode" = 200 ] || { log "ERRORE: /readyz != 200"; exit 1; }

# campionatore: ogni 0.1 s registra i processi il cui comando e' .../claude NON gia' presenti prima della run, con il
# loro eseguibile reale (stub = /usr/bin/bash; vero Claude Code = ~/.local/share/claude/versions/...).
PRE_CLAUDE=" $(pgrep -f '(^|/)claude( |$)' | tr '\n' ' ')"
: > "$ROOT/claude-procs.txt"
(
  seen=" "
  while :; do
    for p in $(pgrep -f '(^|/)claude( |$)'); do
      case "$PRE_CLAUDE$seen" in *" $p "*) continue;; esac
      seen="$seen$p "
      printf 'pid=%s exe=%s args=%s\n' "$p" "$(readlink /proc/$p/exe 2>/dev/null)" \
        "$(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | cut -c1-100)" >> "$ROOT/claude-procs.txt"
    done
    sleep 0.1
  done
) &
SAMP_PID=$!
log "claude gia' presenti PRIMA della run (non nostri):$PRE_CLAUDE"

# ---- 4. progetto ----
curl -s -m 60 "${AUTH[@]}" -H 'Content-Type: application/json' -X POST "$URL/projects" \
  -d "{\"gitUrl\":\"$FAKE_URL\"}" -o "$ROOT/project.json" -w 'POST /projects HTTP %{http_code}\n'
PROJ="$(jq -r '.id // empty' "$ROOT/project.json")"
[ -n "$PROJ" ] || { log "ERRORE: progetto non registrato"; cat "$ROOT/project.json"; exit 1; }
log "progetto $PROJ"

# ---- 5. prompt dalla issue (stessa formulazione di scripts/run-baseline.mjs, senza test held-out) ----
CATALOG="$REAL_HOME/issue-catalog.json"
jq -e --arg k "$ISSUE" '.[]|select(.key==$k)' "$CATALOG" >/dev/null || { log "ERRORE: issue $ISSUE assente"; exit 1; }
jq -r --arg k "$ISSUE" '.[]|select(.key==$k)|
  "Sei uno sviluppatore. Lavora nella cartella corrente (una piccola libreria Node senza dipendenze, prezzi in centesimi).",
  "Issue \(.key) (\(.type), priorità \(.priority)): \(.summary)",
  "",
  .description,
  "",
  "Criteri di accettazione:",
  (.acceptance[] | "- " + .),
  "",
  "Implementa la modifica, aggiungi o aggiorna i test in test/ e verifica con \"npm test\". Non cambiare l'"'"'interfaccia pubblica oltre quanto richiesto.",
  "Al termine rispondi con un riassunto di 3 righe."' "$CATALOG" > "$ROOT/prompt.txt"
# PROMPT_HINT (opzionale, default vuoto = stessa formulazione del baseline): riga aggiunta in coda, ad es. per dire
# che nella distribuzione non ci sono node/npm e i test si lanciano con `bun test test/`.
# PROMPT_HINT_FILE: come PROMPT_HINT ma letto da file (evita i problemi di virgolette di wsl.exe + PowerShell).
if [ -n "${PROMPT_HINT_FILE:-}" ]; then cat "$PROMPT_HINT_FILE" >> "$ROOT/prompt.txt"; fi
if [ -n "${PROMPT_HINT:-}" ]; then printf '%s\n' "$PROMPT_HINT" >> "$ROOT/prompt.txt"; fi
PROMPT="$(cat "$ROOT/prompt.txt")"

# ---- 6. dispatch ----
CLI=(env -i "PATH=$PATHREAL" "HOME=$ROOT/cli-home" "BUN_INSTALL=$REAL_HOME/.bun"
     "WARREN_BASE_URL=$URL" "WARREN_API_TOKEN=$TOKEN")
T0="$(date +%s)"
log "dispatch: warren run --max-cost-usd $MAXCOST --model $MODEL claude-code $PROJ -p <prompt ${#PROMPT} car.>"
( cd "$REAL_HOME/warren" && timeout "$RUN_TIMEOUT" "${CLI[@]}" bun src/cli/main.ts run \
    --max-cost-usd "$MAXCOST" --model "$MODEL" claude-code "$PROJ" -p "$PROMPT" ) \
  > "$ROOT/run.ndjson" 2> "$ROOT/run.err"
CLI_RC=$?
T1="$(date +%s)"
log "warren run terminato: exit=$CLI_RC (124 = timeout) in $((T1 - T0)) s"
if [ -s "$ROOT/run.err" ]; then log "stderr del CLI:"; head -20 "$ROOT/run.err"; fi

# ---- 7. raccolta ----
curl -s -m 20 "${AUTH[@]}" "$URL/runs" -o "$ROOT/runs.json"
RUN_ID="$(jq -r '.runs[0].id // empty' "$ROOT/runs.json")"
[ -n "$RUN_ID" ] || { log "ERRORE: nessuna run trovata"; exit 1; }
curl -s -m 20 "${AUTH[@]}" "$URL/runs/$RUN_ID" -o "$ROOT/run.json"
curl -s -m 60 "${AUTH[@]}" "$URL/runs/$RUN_ID/events" -o "$ROOT/events.ndjson"
jq '(.run // .)' "$ROOT/run.json" > "$ROOT/run-flat.json"
STATE="$(jq -r '.state // empty' "$ROOT/run-flat.json")"
log "run $RUN_ID stato=$STATE"
echo "== run (campi essenziali)"
jq '{id,state,agent,runtime,model,costUsd,costBasis,tokensIn,tokensOut,startedAt,endedAt,finishedAt,createdAt,prUrl,branch,exitCode,failureReason,error}
    | with_entries(select(.value!=null))' "$ROOT/run-flat.json"
S_AT="$(jq -r '.startedAt // empty' "$ROOT/run-flat.json")"; E_AT="$(jq -r '.endedAt // empty' "$ROOT/run-flat.json")"
if [ -n "$S_AT" ] && [ -n "$E_AT" ]; then
  echo "durata run (endedAt - startedAt): $(( ($(date -d "$E_AT" +%s%N) - $(date -d "$S_AT" +%s%N)) / 1000000 )) ms; attesa totale del CLI: $((T1 - T0)) s"
fi
echo "== tipi di evento (conteggio)"
jq -r '.kind' "$ROOT/events.ndjson" | sort | uniq -c | sort -rn
echo "== eventi reap/run essenziali"
jq -c 'select(.kind|test("^(reap|run)\\."))|{kind,payload}' "$ROOT/events.ndjson" | cut -c1-300

BRANCH="warren/$RUN_ID"
echo "== branch nel bare repo"
if git --git-dir="$BARE" rev-parse -q --verify "refs/heads/$BRANCH" >/dev/null; then
  echo "branch $BRANCH = $(git --git-dir="$BARE" rev-parse "refs/heads/$BRANCH")"
  git --git-dir="$BARE" log --format='%h %an <%ae> %s' "$BASE_SHA..refs/heads/$BRANCH"
  git --git-dir="$BARE" diff --stat "$BASE_SHA" "refs/heads/$BRANCH"
  # Sicurezza: Warren NON esclude .claude/ dai commit (commitExcludes vuoto) e in live copia li' le credenziali
  # (.claude/.credentials.json). Un `git add -A` dell'agente le porterebbe nel branch. Segnalo e le tolgo dal tar.
  LEAK="$(git --git-dir="$BARE" ls-tree -r --name-only "refs/heads/$BRANCH" | grep -E '^(\.claude|\.sandbox-tmp|\.warren)(/|$)|credentials' || true)"
  if [ -n "$LEAK" ]; then echo "ATTENZIONE: file di stato/credenziali NEL BRANCH (esclusi dal tar): $LEAK"; fi
  XDIR="$(mktemp -d "$REAL_HOME/.export.XXXXXX")"
  git --git-dir="$BARE" archive --format=tar "refs/heads/$BRANCH" | tar -x -C "$XDIR"
  rm -rf "$XDIR/.claude" "$XDIR/.sandbox-tmp" "$XDIR/.warren" "$XDIR/.claude.json"
  tar -cf "$REAL_HOME/out/$RUN_ID.tar" -C "$XDIR" .
  rm -rf "$XDIR"
  echo "export: $REAL_HOME/out/$RUN_ID.tar ($(stat -c %s "$REAL_HOME/out/$RUN_ID.tar") byte)"
  tar -tf "$REAL_HOME/out/$RUN_ID.tar" | tr '\n' ' '; echo
else
  echo "branch $BRANCH ASSENTE nel bare repo"
fi
echo "== PR registrata dal forge finto"
if [ -f "$STATE_FILE" ]; then jq -c '.prs' "$STATE_FILE"; else echo "state file assente"; fi
echo "run.prUrl = $(jq -r '.prUrl // empty' "$ROOT/run-flat.json")"
echo "== processi 'claude' NUOVI osservati durante la run (stub: exe=/usr/bin/bash; vero: .../claude/versions/...)"
sleep 0.3; cut -c1-200 "$ROOT/claude-procs.txt"
if grep -q 'share/claude/versions' "$ROOT/claude-procs.txt"; then echo "VERO CLAUDE AVVIATO DURANTE LA RUN: SI"
else echo "vero claude avviato durante la run: NO (nessun processo claude nuovo con exe nel percorso di Claude Code)"; fi
echo "== sonde di isolamento emesse dallo stub (solo modalita' stub)"
jq -r 'select(.kind=="text")|.payload.text // empty' "$ROOT/events.ndjson" | sed -n '/^== contesto/,$p' \
  | tee "$ROOT/isolation-probe.txt"
echo "== tracce fuori dal workspace sull'host (attese: nessuna)"
ls -la /home/dibbi/tae-escape-* /tmp/tae-escape-* /tae-escape-* "$REAL_HOME/.bun/tae-escape-"* 2>&1 | sed 's/^/  /'
echo "RIEPILOGO mode=$MODE issue=$ISSUE run=$RUN_ID state=$STATE cli_exit=$CLI_RC dir=$ROOT"
[ "$STATE" = succeeded ] && exit 0 || exit 1
