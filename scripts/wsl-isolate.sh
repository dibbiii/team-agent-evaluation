#!/usr/bin/env bash
# Toglie a una distribuzione WSL la vista sul disco Windows e la possibilità di lanciare programmi Windows.
# Non è un confine di sicurezza forte (le distribuzioni WSL2 condividono VM e kernel): riduce molto l'esposizione.
#
# Uso, DENTRO la distribuzione Ubuntu-26.04:
#   sudo bash scripts/wsl-isolate.sh apply     (una volta)
#   bash wsl-isolate.sh verify                  (dopo il riavvio; la copia in ~ viene creata da "apply")
#
# Sicurezza dello script:
#  - rifiuta di lavorare se non è nella distribuzione Ubuntu-26.04 (non tocca la tua Ubuntu personale);
#  - prima di modificare /etc/wsl.conf ne fa una copia (/etc/wsl.conf.bak-tae);
#  - non sovrascrive: AGGIUNGE le sezioni [automount] e [interop]; se esistono già si ferma senza cambiare nulla.
set -euo pipefail

EXPECTED="Ubuntu-26.04"
CONF="${WSL_CONF:-/etc/wsl.conf}"
TESTING=0
[ -n "${WSL_CONF:-}" ] && TESTING=1 # SOLO per i test automatici su un file temporaneo

guard() {
  if [ "$TESTING" = 0 ] && [ "${WSL_DISTRO_NAME:-}" != "$EXPECTED" ]; then
    echo "STOP: questa non è $EXPECTED (sei in '${WSL_DISTRO_NAME:-sconosciuta}'). Non modifico nulla."
    exit 3
  fi
}

apply() {
  guard
  if [ "$TESTING" = 0 ] && [ "$(id -u)" -ne 0 ]; then
    echo "Serve sudo: sudo bash scripts/wsl-isolate.sh apply"
    exit 2
  fi
  echo "== Contenuto attuale di $CONF"
  cat "$CONF" 2>/dev/null || echo "(file assente o vuoto)"
  for sec in automount interop; do
    if grep -q "^\[$sec\]" "$CONF" 2>/dev/null; then
      echo "STOP: la sezione [$sec] è già presente in $CONF. Non cambio nulla: controllala a mano."
      exit 4
    fi
  done
  [ -f "$CONF" ] && cp -a "$CONF" "$CONF.bak-tae"
  printf '\n[automount]\nenabled=false\n\n[interop]\nenabled=false\nappendWindowsPath=false\n' >> "$CONF"
  echo "== Contenuto nuovo di $CONF"
  cat "$CONF"
  # copia dello script nella home, perché dopo il riavvio il disco Windows non sarà più raggiungibile
  if [ "$TESTING" = 0 ] && [ -n "${SUDO_USER:-}" ]; then
    install -o "$SUDO_USER" -g "$SUDO_USER" -m 755 "$0" "/home/$SUDO_USER/wsl-isolate.sh"
    echo "== Copiato in /home/$SUDO_USER/wsl-isolate.sh (per il controllo dopo il riavvio)"
  fi
  echo
  echo "FATTO. Ora da PowerShell: wsl --terminate $EXPECTED   poi aspetta 8 secondi e rientra con: wsl -d $EXPECTED"
}

verify() {
  guard
  local fail=0
  chk() { # descrizione, comando che deve riuscire
    if eval "$2" >/dev/null 2>&1; then echo "PASS  $1"; else echo "FAIL  $1"; fail=1; fi
  }
  echo "Distribuzione: ${WSL_DISTRO_NAME:-?}   Utente: $(id -un)"
  chk "il disco C: non è montato" '! mount | grep -qiE "drvfs|/mnt/c"'
  chk "/mnt/c è vuota o assente" '[ -z "$(ls -A /mnt/c 2>/dev/null)" ]'
  chk "il PATH non contiene percorsi Windows" '! printf %s "$PATH" | grep -q "/mnt/"'
  chk "non si possono lanciare programmi Windows" '! command -v cmd.exe'
  chk "l utente non è root" '[ "$(id -u)" -ne 0 ]'
  chk "nessun socket Docker" '[ ! -e /var/run/docker.sock ]'
  if [ "$fail" -eq 0 ]; then echo "ESITO: PASS"; else echo "ESITO: FAIL (se hai appena eseguito apply, hai riavviato la distribuzione con wsl --terminate?)"; exit 1; fi
}

case "${1:-}" in
  apply) apply ;;
  verify) verify ;;
  *) echo "Uso: sudo bash scripts/wsl-isolate.sh apply | bash wsl-isolate.sh verify"; exit 2 ;;
esac
