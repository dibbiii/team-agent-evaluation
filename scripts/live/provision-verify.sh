#!/usr/bin/env bash
# Verifiche a costo zero dello stato di Ubuntu-26.04 dopo il provisioning (nessuna credenziale, nessun modello).
# Uso: wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/provision-verify.sh
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
fail=0
chk() { if eval "$2" >/dev/null 2>&1; then echo "PASS  $1"; else echo "FAIL  $1"; fail=1; fi; }

echo "== versioni"
for c in "git --version" "bwrap --version" "curl --version | head -1" "jq --version" "unzip -v | head -1" "tmux -V" \
         "node -v" "npm -v" "bun --version" "claude --version" "cn --version" "sd --version" "ml --version"; do
  printf '%-28s ' "${c%% *}"; (eval "$c" 2>&1 | head -1) || echo "ASSENTE"
done
echo "warren: $(git -C "$HOME/warren" rev-parse HEAD) ($(git -C "$HOME/warren" describe --tags --always 2>/dev/null))"
echo "== configurazione"
cat /etc/wsl.conf
echo "== controlli"
chk "utente dibbi, uid 1000, non root" '[ "$(id -un)" = dibbi ] && [ "$(id -u)" = 1000 ]'
chk "nessun gruppo sudo per dibbi" '! id -nG | tr " " "\n" | grep -qx sudo'
chk "resolv.conf e' un file vero (non un collegamento)" '[ -f /etc/resolv.conf ] && [ ! -L /etc/resolv.conf ]'
chk "resolv.conf contiene 1.1.1.1 e 8.8.8.8" 'grep -q "^nameserver 1.1.1.1" /etc/resolv.conf && grep -q "^nameserver 8.8.8.8" /etc/resolv.conf'
chk "systemd-resolved non attivo" '! systemctl is-active --quiet systemd-resolved'
chk "interop spento: powershell.exe non eseguibile" '! command -v powershell.exe && ! /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -c 1'
chk "nessun disco Windows montato" '! mount | grep -qiE "drvfs|/mnt/c|aname=C:"'
chk "PATH senza percorsi Windows" '! printf %s "$PATH" | grep -q "/mnt/"'
chk "nessun file di credenziali di Claude" '[ ! -e "$HOME/.claude/.credentials.json" ]'
chk "nessun processo claude/bun/bwrap residuo" '! pgrep -x -u "$(id -u)" "claude|bun|bwrap"'
# profilo di Warren (src/sandbox/bwrap.ts): /home non montato => home e fixture invisibili
mkdir -p "$HOME/.provision-probe" && : > "$HOME/.provision-probe/marker"
sbx() { bwrap --unshare-all --share-net --die-with-parent --uid 1000 --gid 1000 --proc /proc --dev /dev --tmpfs /tmp \
  --ro-bind-try /usr /usr --ro-bind-try /etc /etc --ro-bind-try /lib /lib --ro-bind-try /lib64 /lib64 \
  --ro-bind-try /bin /bin --ro-bind-try /sbin /sbin --ro-bind-try /opt /opt -- "$@"; }
chk "dentro bwrap: /home/dibbi non esiste" '! sbx test -e /home/dibbi'
chk "dentro bwrap: marker della home invisibile" '! sbx test -e /home/dibbi/.provision-probe/marker'
chk "dentro bwrap: /mnt/c assente" '! sbx test -e /mnt/c'
chk "dentro bwrap: /etc/resolv.conf leggibile" 'sbx test -s /etc/resolv.conf'
rm -rf "$HOME/.provision-probe"
[ "$fail" -eq 0 ] && echo "ESITO: PASS" || { echo "ESITO: FAIL"; exit 1; }
