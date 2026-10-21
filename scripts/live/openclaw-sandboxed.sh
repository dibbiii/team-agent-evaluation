#!/usr/bin/env bash
# Esegue un comando dentro bwrap in Ubuntu-26.04 per le prove OpenClaw LIVE. Motivo: OpenClaw lancia `claude` con il nome
# fisso "claude" risolto da PATH (nessun override di comando in config, vedi report) e l'esecuzione di Bash dell'agente
# passa dal tool `exec` del Gateway (host-owned), quindi un wrapper solo su `claude` NON basterebbe: si confina l'INTERO
# Gateway (e con lui claude, exec, MCP bridge). Stessi montaggi di Warren/Paperclip/Paseo.
# Uso: openclaw-sandboxed.sh [--creds] [--ws NOME] -- comando args...
#  --creds : copia (cp, mai letto) ~/.claude/.credentials.json in HOME della sandbox; RIMOSSA all'uscita di questo wrapper.
#  --ws N  : monta ~/oc-ws/N in lettura/scrittura (stesso percorso assoluto), cwd = quella cartella.
# HOME della sandbox = ~/oc-sbhome (persistente per la prova, rimossa a fine prova). Log del Gateway: ~/oc-logs (/tmp/openclaw).
REAL_HOME=/home/dibbi
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
CREDS=0; WS=""
while [ $# -gt 0 ]; do
  case "$1" in --creds) CREDS=1; shift;; --ws) WS="$2"; shift 2;; --) shift; break;; *) echo "arg sconosciuto $1"; exit 2;; esac
done
[ $# -gt 0 ] || { echo "manca il comando"; exit 2; }
SB="$REAL_HOME/oc-sbhome"; LOGD="$REAL_HOME/oc-logs"; LOG="$REAL_HOME/oc-wrapper.log"
NODE_DIR="$REAL_HOME/pc-node/node_modules/node"; NPM_DIR="$REAL_HOME/pc-node/node_modules/npm"; SHIM_DIR="$REAL_HOME/pc-npm-shim"
OC_DIR="$REAL_HOME/oc"
mkdir -p "$SB/.claude" "$LOGD"
CWD=/home/sandbox; WSARGS=()
if [ -n "$WS" ]; then
  [[ "$WS" =~ ^[a-z0-9-]+$ ]] || { echo "nome ws non valido"; exit 2; }
  WSP="$REAL_HOME/oc-ws/$WS"; [ -d "$WSP" ] || { echo "workspace assente"; exit 1; }
  WSARGS=(--bind "$WSP" "$WSP"); CWD="$WSP"
fi
CH=""
cleanup() { [ "$CREDS" = 1 ] && rm -f "$SB/.claude/.credentials.json"; }
trap cleanup EXIT
trap '[ -n "$CH" ] && kill -TERM "$CH" 2>/dev/null' TERM INT HUP
if [ "$CREDS" = 1 ]; then
  cp "$REAL_HOME/.claude/.credentials.json" "$SB/.claude/.credentials.json" && chmod 600 "$SB/.claude/.credentials.json"
fi
ENVARGS=("HOME=/home/sandbox" "PATH=$OC_DIR/node_modules/.bin:$SHIM_DIR:$NODE_DIR/bin:$REAL_HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
  "LANG=C.UTF-8" "TMPDIR=/tmp" "TZ=UTC" "DISABLE_AUTOUPDATER=1" "DISABLE_TELEMETRY=1" "OPENCLAW_NO_AUTO_UPDATE=1")
BW=(bwrap --unshare-all --share-net --die-with-parent --uid 1000 --gid 1000 --proc /proc --dev /dev --tmpfs /tmp
  --ro-bind-try /usr /usr --ro-bind-try /etc /etc --ro-bind-try /lib /lib --ro-bind-try /lib64 /lib64
  --ro-bind-try /bin /bin --ro-bind-try /sbin /sbin --ro-bind-try /opt /opt
  --ro-bind "$REAL_HOME/.local/share/claude" "$REAL_HOME/.local/share/claude"
  --ro-bind "$REAL_HOME/.local/bin" "$REAL_HOME/.local/bin"
  --ro-bind "$NODE_DIR" "$NODE_DIR" --ro-bind "$NPM_DIR" "$NPM_DIR" --ro-bind "$SHIM_DIR" "$SHIM_DIR"
  --ro-bind "$OC_DIR" "$OC_DIR"
  --bind "$SB" /home/sandbox --bind "$LOGD" /tmp/openclaw "${WSARGS[@]}" --chdir "$CWD")
{ printf '%s wrapper pid=%s creds=%s ws=%s cmd:' "$(date -u +%FT%TZ)" "$$" "$CREDS" "$WS"; for a in "$@"; do printf ' [%s]' "${a:0:80}"; done; printf '\n'; } >> "$LOG"
env -i "${ENVARGS[@]}" "${BW[@]}" -- "$@" <&0 &
CH=$!
wait "$CH"; rc=$?
if kill -0 "$CH" 2>/dev/null; then wait "$CH"; rc=$?; fi
printf '%s wrapper pid=%s exit=%s\n' "$(date -u +%FT%TZ)" "$$" "$rc" >> "$LOG"
exit "$rc"
