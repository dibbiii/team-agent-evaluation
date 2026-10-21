#!/usr/bin/env bash
# Wrapper per il provider `claude` del daemon Paseo (agents.providers.claude.command = ["/home/dibbi/bin/ps-sandboxed"]):
# esegue il VERO Claude Code dentro bwrap, con gli stessi montaggi di Warren/Paperclip. Il nome NON e' "claude".
# Paseo lo chiama con gli argomenti di claude (il comando configurato sostituisce il binario, vedi query.ts del daemon).
# Modi:
#  - cwd sotto ~/ps-ws/<nome>: run vera. HOME della sandbox PERSISTENTE per workspace (~/ps-sbhome/<nome>, serve alla
#    ripresa della sessione dopo un riavvio); il file di credenziali e' copiato con cp (mai letto) all'avvio e RIMOSSO
#    all'uscita dell'ultimo wrapper attivo su quella HOME.
#  - qualunque altro cwd (sonde del daemon: scoperta modelli, --version, auth status): cartella vuota temporanea, HOME
#    temporanea, NESSUNA credenziale.
#  - --tae-check <script.sh>: esegue lo script dentro la stessa sandbox, senza credenziali e senza avviare claude.
REAL_HOME=/home/dibbi
CLAUDE_LINK="$REAL_HOME/.local/bin/claude"
NODE_DIR="$REAL_HOME/pc-node/node_modules/node"
NPM_DIR="$REAL_HOME/pc-node/node_modules/npm"
SHIM_DIR="$REAL_HOME/pc-npm-shim"
PS_DIR="$REAL_HOME/ps"
LOG="$REAL_HOME/ps-wrapper.log"
CHECK=0; CHECK_SCRIPT=""
if [ "${1:-}" = "--tae-check" ]; then CHECK=1; CHECK_SCRIPT="${2:?script}"; shift 2; fi
CWD="$(pwd -P)"

MODE=probe
case "$CWD" in "$REAL_HOME"/ps-ws/*) MODE=work;; esac
[ "$CHECK" = 1 ] && [ "$MODE" = work ] && MODE=work-check
case "${1:-}" in --version|-v|auth) [ "$MODE" = work ] && MODE=probe;; esac

# ambiente minimo (env -i): solo TZ, CLAUDE_CODE_*, CLAUDE_AGENT_* e il necessario. Nessuna variabile PASEO_* (la password
# del daemon non deve arrivare all'agente). Si registrano solo i NOMI delle variabili ricevute, mai i valori.
ENVARGS=("HOME=/home/sandbox" "PATH=$SHIM_DIR:$NODE_DIR/bin:$REAL_HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" "LANG=C.UTF-8" "TMPDIR=/tmp" "DISABLE_AUTOUPDATER=1")
RECEIVED=""
for k in $(compgen -e); do
  RECEIVED="$RECEIVED $k"
  case "$k" in CLAUDE_CODE_*|CLAUDE_AGENT_*|TZ) ENVARGS+=("$k=${!k}");; esac
done

if [ "$MODE" = work ] || [ "$MODE" = work-check ]; then
  # il workspace puo' essere una sottocartella: usa il primo livello sotto ps-ws
  TOP="${CWD#"$REAL_HOME"/ps-ws/}"; TOP="${TOP%%/*}"; H="$REAL_HOME/ps-sbhome/$TOP"
  WS="$REAL_HOME/ps-ws/$TOP"
  mkdir -p "$H/.claude" "$H/.wrapper-pids"
  TMPH=""
  RUNCWD="$CWD"
else
  H="$(mktemp -d "$REAL_HOME/ps-probehome.XXXXXX")"; TMPH="$H"
  WS="$(mktemp -d "$REAL_HOME/ps-probecwd.XXXXXX")"
  RUNCWD="$WS"
  mkdir -p "$H/.claude"
fi
CH=""
cleanup() {
  if [ -n "$TMPH" ]; then rm -rf "$TMPH" "$WS"
  else
    rm -f "$H/.wrapper-pids/$$"
    if [ -z "$(ls -A "$H/.wrapper-pids" 2>/dev/null)" ]; then rm -f "$H/.claude/.credentials.json"; fi
  fi
}
trap cleanup EXIT
trap '[ -n "$CH" ] && kill -TERM "$CH" 2>/dev/null' TERM INT HUP
if [ "$MODE" = work ]; then
  echo $$ > "$H/.wrapper-pids/$$"
  cp "$REAL_HOME/.claude/.credentials.json" "$H/.claude/.credentials.json" && chmod 600 "$H/.claude/.credentials.json"
elif [ "$MODE" = work-check ]; then
  echo $$ > "$H/.wrapper-pids/$$"
fi

# percorsi assoluti esistenti passati come argomenti (--add-dir, --mcp-config, --settings...) in sola lettura
EXTRA=()
for a in "$@"; do
  p="$a"; case "$a" in --*=*) p="${a#*=}";; esac
  case "$p" in
    /usr|/usr/*|/etc|/etc/*|/lib|/lib/*|/bin|/bin/*|/proc*|/dev*|/tmp) ;;
    "$WS"|"$WS"/*) ;;
    /*) [ -e "$p" ] && EXTRA+=(--ro-bind "$p" "$p");;
  esac
done

BW=(bwrap --unshare-all --share-net --die-with-parent --uid 1000 --gid 1000 --proc /proc --dev /dev --tmpfs /tmp
  --ro-bind-try /usr /usr --ro-bind-try /etc /etc --ro-bind-try /lib /lib --ro-bind-try /lib64 /lib64
  --ro-bind-try /bin /bin --ro-bind-try /sbin /sbin --ro-bind-try /opt /opt
  --ro-bind "$REAL_HOME/.local/share/claude" "$REAL_HOME/.local/share/claude"
  --ro-bind "$REAL_HOME/.local/bin" "$REAL_HOME/.local/bin"
  --ro-bind "$NODE_DIR" "$NODE_DIR" --ro-bind "$NPM_DIR" "$NPM_DIR" --ro-bind "$SHIM_DIR" "$SHIM_DIR")
# solo in modalita' di verifica: il client del daemon (sola lettura) per le sonde sulla superficie di controllo
if [ "$CHECK" = 1 ]; then BW+=(--ro-bind "$PS_DIR" "$PS_DIR"); fi
BW+=("${EXTRA[@]}")
if [ "$CHECK" = 1 ]; then BW+=(--ro-bind "$CHECK_SCRIPT" /tmp/check.sh); fi
BW+=(--bind "$H" /home/sandbox --bind "$WS" "$WS" --chdir "$RUNCWD")
if [ "$CHECK" = 1 ]; then CMD=(bash /tmp/check.sh); else CMD=("$CLAUDE_LINK" "$@"); fi

{ printf '%s wrapper pid=%s mode=%s cwd=%s extra_ro=%s env_names:%s argv:' "$(date -u +%FT%TZ)" "$$" "$MODE" "$CWD" "$((${#EXTRA[@]}/3))" "$RECEIVED"
  for a in "${CMD[@]:1}"; do printf ' [%s]' "${a:0:120}"; done; printf '\n'; } >> "$LOG"

env -i "${ENVARGS[@]}" "${BW[@]}" -- "${CMD[@]}" <&0 &
CH=$!
wait "$CH"; rc=$?
if kill -0 "$CH" 2>/dev/null; then wait "$CH"; rc=$?; fi
printf '%s wrapper pid=%s mode=%s exit=%s\n' "$(date -u +%FT%TZ)" "$$" "$MODE" "$rc" >> "$LOG"
exit "$rc"
