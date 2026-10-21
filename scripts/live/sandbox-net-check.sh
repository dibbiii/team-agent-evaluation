#!/usr/bin/env bash
# Replica i montaggi della sandbox di Warren (src/sandbox/bwrap.ts: --unshare-all --share-net, ro-bind-try di
# /usr /etc /lib /lib64 /bin /sbin /opt, nessun /run) e verifica DNS e HTTPS verso l'API del modello, SENZA credenziali.
# Serve a evitare di spendere una run per scoprire un problema di rete. Eseguire come utente normale in Ubuntu-26.04.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
echo "/etc/resolv.conf: $(ls -l /etc/resolv.conf | awk '{print $1, $NF}')"
sandbox() {
  bwrap --unshare-all --share-net --die-with-parent --uid 1000 --gid 1000 --proc /proc --dev /dev --tmpfs /tmp \
    --ro-bind-try /usr /usr --ro-bind-try /etc /etc --ro-bind-try /lib /lib --ro-bind-try /lib64 /lib64 \
    --ro-bind-try /bin /bin --ro-bind-try /sbin /sbin --ro-bind-try /opt /opt -- "$@"
}
echo "== DNS dentro la sandbox:"
sandbox getent hosts api.anthropic.com | head -2 || echo "DNS FALLITO"
echo "== HTTPS dentro la sandbox (solo la risposta del server, nessun segreto):"
code="$(sandbox curl -sS -m 15 -o /dev/null -w '%{http_code}' https://api.anthropic.com/ 2>&1)"
echo "HTTP/curl: $code"
case "$code" in [1-5][0-9][0-9]) echo "ESITO: rete e DNS OK dentro la sandbox";; *) echo "ESITO: FALLITO"; exit 1;; esac
