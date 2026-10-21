#!/usr/bin/env bash
# Wrapper per l'adapter claude_local di Paperclip: esegue il VERO Claude Code dentro bwrap, con gli stessi montaggi
# della sandbox di Warren (src/sandbox/bwrap.ts). Installato in Ubuntu-26.04 come ~/bin/claude-sandboxed.
# Il nome NON deve essere "claude": cosi' Paperclip salta la sonda "hello" (che lancerebbe un claude non confinato).
# Uso normale: chiamato da Paperclip con gli argomenti di claude, stdin = prompt, cwd = workspace (sotto ~/pc-ws/).
# Modo di verifica a costo zero: claude-sandboxed --tae-check <script.sh>  (esegue lo script con bash dentro la
# stessa sandbox, senza copiare credenziali e senza avviare claude).
REAL_HOME=/home/dibbi
CLAUDE_LINK="$REAL_HOME/.local/bin/claude"
NODE_DIR="$REAL_HOME/pc-node/node_modules/node"
NPM_DIR="$REAL_HOME/pc-node/node_modules/npm"
SHIM_DIR="$REAL_HOME/pc-npm-shim"
LOG="$REAL_HOME/pc-wrapper.log"
CHECK=0; CHECK_SCRIPT=""
if [ "${1:-}" = "--tae-check" ]; then CHECK=1; CHECK_SCRIPT="${2:?script}"; shift 2; fi
WS="$(pwd -P)"
case "$WS" in "$REAL_HOME"/pc-ws/*) ;; *) echo "claude-sandboxed: cwd fuori da ~/pc-ws: $WS" >&2; exit 97;; esac

# ambiente minimo (env -i): niente variabili dell'host tranne PAPERCLIP_*, CLAUDE_CODE_*, TZ
ENVARGS=("HOME=/home/sandbox" "PATH=$SHIM_DIR:$NODE_DIR/bin:$REAL_HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" "LANG=C.UTF-8" "TMPDIR=/tmp")
for k in $(compgen -e); do
  case "$k" in PAPERCLIP_*|CLAUDE_CODE_*|TZ) ENVARGS+=("$k=${!k}");; esac
done

# HOME della sandbox = cartella temporanea per run; SOLO il file di credenziali, copiato con cp (mai letto)
TMPH="$(mktemp -d "$REAL_HOME/pc-runhome.XXXXXX")"
CH=""
cleanup() { rm -rf "$TMPH"; }
trap cleanup EXIT
trap '[ -n "$CH" ] && kill -TERM "$CH" 2>/dev/null' TERM INT HUP
mkdir -p "$TMPH/.claude"
if [ "$CHECK" = 0 ]; then
  cp "$REAL_HOME/.claude/.credentials.json" "$TMPH/.claude/.credentials.json" && chmod 600 "$TMPH/.claude/.credentials.json"
fi

# percorsi assoluti esistenti passati come argomenti (--add-dir, --mcp-config, --append-system-prompt-file...) in sola lettura
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
BW+=("${EXTRA[@]}")
if [ "$CHECK" = 1 ]; then BW+=(--ro-bind "$CHECK_SCRIPT" /tmp/check.sh); fi
BW+=(--bind "$TMPH" /home/sandbox --bind "$WS" "$WS" --chdir "$WS")
if [ "$CHECK" = 1 ]; then CMD=(bash /tmp/check.sh); else CMD=("$CLAUDE_LINK" "$@"); fi

{ printf '%s wrapper pid=%s check=%s cwd=%s extra_ro=%s argv:' "$(date -u +%FT%TZ)" "$$" "$CHECK" "$WS" "$((${#EXTRA[@]}/3))"
  for a in "${CMD[@]:1}"; do printf ' [%s]' "${a:0:160}"; done; printf '\n'; } >> "$LOG"

env -i "${ENVARGS[@]}" "${BW[@]}" -- "${CMD[@]}" <&0 &
CH=$!
wait "$CH"; rc=$?
if kill -0 "$CH" 2>/dev/null; then wait "$CH"; rc=$?; fi
printf '%s wrapper pid=%s exit=%s\n' "$(date -u +%FT%TZ)" "$$" "$rc" >> "$LOG"
exit "$rc"
