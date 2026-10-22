#!/usr/bin/env bash
# Provisioning INIZIALE della distribuzione dedicata Ubuntu-26.04 (da eseguire come root, SOLO li' dentro).
# Ricrea le protezioni della distribuzione cancellata il 2026-10-22. Nessun login, nessuna credenziale, nessun modello.
#
# Uso (da PowerShell, dopo aver copiato gli script in /root con provision-deploy.ps1):
#   wsl -d Ubuntu-26.04 -u root -- bash /root/provision-root.sh base   # utente, wsl.conf, DNS
#   wsl --terminate Ubuntu-26.04                                      # applica wsl.conf
#   wsl -d Ubuntu-26.04 -u root -- bash /root/provision-root.sh apt    # SOLO pacchetti gia' usati in passato
#
# Fase "base":
#   1. utente `dibbi` non root (senza password e senza gruppo sudo), shell bash;
#   2. isolamento: scripts/wsl-isolate.sh apply (automount e interop disattivati, backup /etc/wsl.conf.bak-tae);
#   3. [user] default=dibbi e [network] generateResolvConf=false in /etc/wsl.conf (il DNS tunneling di WSL non risponde);
#   4. /etc/resolv.conf FILE VERO con 1.1.1.1 e 8.8.8.8 e systemd-resolved disattivato: la sandbox di Warren monta /etc
#      ma non /run, quindi un collegamento a /run/systemd/resolve/... non ha destinazione dentro bwrap (F53).
# Fase "apt": jq, unzip, nodejs, npm (gli stessi pacchetti usati nella distribuzione precedente; bubblewrap, git, curl,
#   tmux sono nell'immagine). Se bwrap o git mancano si FERMA senza installare nulla.
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04 (sei in '${WSL_DISTRO_NAME:-?}')"; exit 3; }
[ "$(id -u)" -eq 0 ] || { echo "STOP: serve root (solo per il provisioning iniziale)"; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"

base() {
  if id dibbi >/dev/null 2>&1; then
    echo "utente dibbi gia' presente: $(id dibbi)"
  else
    useradd --create-home --shell /bin/bash dibbi
    passwd -l dibbi >/dev/null
    echo "creato utente: $(id dibbi)"
  fi
  [ "$(id -u dibbi)" = 1000 ] || { echo "STOP: uid di dibbi non e' 1000 (il profilo bwrap usa --uid 1000)"; exit 1; }

  echo "== isolamento (wsl-isolate.sh apply)"
  bash "$HERE/wsl-isolate.sh" apply
  # copia per il controllo dopo il riavvio (apply la crea solo se c'e' SUDO_USER)
  install -o dibbi -g dibbi -m 755 "$HERE/wsl-isolate.sh" /home/dibbi/wsl-isolate.sh

  printf '\n[user]\ndefault=dibbi\n\n[network]\ngenerateResolvConf=false\n' >> /etc/wsl.conf
  echo "== /etc/wsl.conf finale"; cat /etc/wsl.conf

  echo "== DNS: file vero, systemd-resolved disattivato"
  systemctl disable --now systemd-resolved 2>&1 | tail -2 || true
  rm -f /etc/resolv.conf
  printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' > /etc/resolv.conf
  chmod 644 /etc/resolv.conf
  ls -l /etc/resolv.conf; cat /etc/resolv.conf
  echo "BASE OK. Ora, da PowerShell: wsl --terminate Ubuntu-26.04 (poi attendi ~10 s)"
}

apt_pkgs() {
  command -v bwrap >/dev/null || { echo "STOP: bubblewrap assente: non lo installo, chiedere conferma"; exit 5; }
  command -v git >/dev/null || { echo "STOP: git assente: non lo installo, chiedere conferma"; exit 5; }
  export DEBIAN_FRONTEND=noninteractive
  APT=(-o Acquire::ForceIPv4=true)
  apt-get "${APT[@]}" update 2>&1 | tail -3
  echo "== candidati"; apt-cache policy jq unzip nodejs npm | grep -E '^[a-z]|Candidate'
  apt-get "${APT[@]}" install -y jq unzip nodejs npm 2>&1 | tail -5
  echo "== versioni"; jq --version; unzip -v | head -1; node -v; npm -v
}

case "${1:-}" in
  base) base ;;
  apt) apt_pkgs ;;
  *) echo "Uso: provision-root.sh base|apt"; exit 2 ;;
esac
