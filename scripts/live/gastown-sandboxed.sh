#!/usr/bin/env bash
# Esegue un comando dentro bwrap in Ubuntu-26.04 per le prove Gas Town LIVE. Motivo (vedi report): Gas Town lancia
# `claude` DENTRO tmux (sessioni create da gt/daemon con `exec env ... claude --dangerously-skip-permissions ...`), il
# comando non e' sostituibile per tutti i ruoli senza toccare piu' punti di config (exec_wrapper per rig, alias agente),
# e tmux/dolt/bd/git/npm test devono stare dove sta l'agente: si confina TUTTO (gt, tmux, dolt, bd, claude).
# Stessi montaggi di Warren/Paperclip/Paseo/OpenClaw.
# Uso: gastown-sandboxed.sh [--creds] [--build] -- comando args...
#  --creds : copia (cp, mai letto) ~/.claude/.credentials.json in ~/gt-sbhome/.claude/; RIMOSSA all'uscita di questo wrapper.
#  --build : monta Go (ro), ~/gt-gopath (rw) e ~/gt-src (rw) e imposta l'ambiente di compilazione (CGO_ENABLED=0). Mai con --creds.
# HOME della sandbox = ~/gt-sbhome (persistente per la prova: town, rig, remoto bare locale, stato di Claude Code).
REAL_HOME=/home/dibbi
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
CREDS=0; BUILD=0
while [ $# -gt 0 ]; do
  case "$1" in --creds) CREDS=1; shift;; --build) BUILD=1; shift;; --) shift; break;; *) echo "arg sconosciuto $1"; exit 2;; esac
done
[ $# -gt 0 ] || { echo "manca il comando"; exit 2; }
[ "$CREDS" = 1 ] && [ "$BUILD" = 1 ] && { echo "STOP: --creds e --build non insieme"; exit 2; }
SB="$REAL_HOME/gt-sbhome"; LOG="$REAL_HOME/gt-wrapper.log"
NODE_DIR="$REAL_HOME/pc-node/node_modules/node"; NPM_DIR="$REAL_HOME/pc-node/node_modules/npm"; SHIM_DIR="$REAL_HOME/pc-npm-shim"
GT_BIN="$REAL_HOME/gt-bin"
mkdir -p "$SB/.claude" "$GT_BIN"
CH=""
# Claude Code puo' RINNOVARE il token OAuth dentro la sandbox (rotazione del refresh token). Cancellare la copia senza
# conservarla lascia l'originale con un refresh token invalidato (successo nella prima prova di questo candidato: login
# della distribuzione perso). Regola attuale: se la copia e' cambiata (cmp, senza leggerla ne' stamparla) NON la cancello:
# la rinomino in .credentials.json.refreshed (600) e lo scrivo nel log; l'originale non viene mai sovrascritto da questo script.
cleanup() {
  if [ "$CREDS" = 1 ] && [ -f "$SB/.claude/.credentials.json" ]; then
    if cmp -s "$SB/.claude/.credentials.json" "$REAL_HOME/.claude/.credentials.json"; then rm -f "$SB/.claude/.credentials.json"
    else mv -f "$SB/.claude/.credentials.json" "$SB/.claude/.credentials.json.refreshed"
      printf "%s wrapper: credenziali cambiate nella sandbox, conservate come .credentials.json.refreshed (da gestire a mano)
" "$(date -u +%FT%TZ)" >> "$LOG"
    fi
  fi
}
trap cleanup EXIT
trap '[ -n "$CH" ] && kill -TERM "$CH" 2>/dev/null' TERM INT HUP
if [ "$CREDS" = 1 ]; then
  cp "$REAL_HOME/.claude/.credentials.json" "$SB/.claude/.credentials.json" && chmod 600 "$SB/.claude/.credentials.json"
fi
PATHV="$GT_BIN:$SHIM_DIR:$NODE_DIR/bin:$REAL_HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
ENVARGS=("HOME=/home/sandbox" "LANG=C.UTF-8" "TMPDIR=/tmp" "TZ=UTC" "TERM=xterm-256color"
  "DISABLE_AUTOUPDATER=1" "DISABLE_TELEMETRY=1" "DISABLE_ERROR_REPORTING=1" "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1")
BUILDARGS=()
if [ "$BUILD" = 1 ]; then
  PATHV="$REAL_HOME/gt-go/go/bin:$REAL_HOME/gt-gopath/bin:$PATHV"
  ENVARGS+=("GOROOT=$REAL_HOME/gt-go/go" "GOPATH=$REAL_HOME/gt-gopath" "GOCACHE=$REAL_HOME/gt-gopath/cache" "GOTOOLCHAIN=local"
    "CGO_ENABLED=0" "GOFLAGS=-p=2" "GOTELEMETRY=off" "GOPROXY=https://proxy.golang.org,direct" "GONOSUMDB=" )
  BUILDARGS=(--ro-bind "$REAL_HOME/gt-go" "$REAL_HOME/gt-go" --bind "$REAL_HOME/gt-gopath" "$REAL_HOME/gt-gopath"
    --bind "$REAL_HOME/gt-src" "$REAL_HOME/gt-src" --bind "$GT_BIN" "$GT_BIN")
fi
ENVARGS+=("PATH=$PATHV")
BW=(bwrap --unshare-all --share-net --die-with-parent --new-session --uid 1000 --gid 1000 --proc /proc --dev /dev --tmpfs /tmp
  --ro-bind-try /usr /usr --ro-bind-try /etc /etc --ro-bind-try /lib /lib --ro-bind-try /lib64 /lib64
  --ro-bind-try /bin /bin --ro-bind-try /sbin /sbin --ro-bind-try /opt /opt
  --ro-bind "$REAL_HOME/.local/share/claude" "$REAL_HOME/.local/share/claude"
  --ro-bind "$REAL_HOME/.local/bin" "$REAL_HOME/.local/bin"
  --ro-bind "$NODE_DIR" "$NODE_DIR" --ro-bind "$NPM_DIR" "$NPM_DIR" --ro-bind "$SHIM_DIR" "$SHIM_DIR")
[ "$BUILD" = 1 ] || BW+=(--ro-bind "$GT_BIN" "$GT_BIN")
BW+=(--bind "$SB" /home/sandbox "${BUILDARGS[@]}" --chdir /home/sandbox)
{ printf '%s wrapper pid=%s creds=%s build=%s cmd:' "$(date -u +%FT%TZ)" "$$" "$CREDS" "$BUILD"; for a in "$@"; do printf ' [%s]' "${a:0:100}"; done; printf '\n'; } >> "$LOG"
env -i "${ENVARGS[@]}" "${BW[@]}" -- "$@" <&0 &
CH=$!
wait "$CH"; rc=$?
if kill -0 "$CH" 2>/dev/null; then wait "$CH"; rc=$?; fi
printf '%s wrapper pid=%s exit=%s\n' "$(date -u +%FT%TZ)" "$$" "$rc" >> "$LOG"
exit "$rc"
