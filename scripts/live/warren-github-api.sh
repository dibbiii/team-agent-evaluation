#!/usr/bin/env bash
# Chiamata minima all'API GitHub, SOLO verso https://api.github.com/repos/dibbiii/tae-sandbox<percorso>.
# Uso: bash ~/warren-github-api.sh METODO /percorso-relativo-al-repo [corpo-json]
# Variabili: OUT=<file> scrive il corpo in un file (utile per i tarball, con LOC=1 segue il redirect);
#            senza OUT il corpo va su stdout e l'ULTIMA riga e' "HTTP <codice>".
# Il token e' letto da ~/.tae-gh-token e passato a curl con un file di header temporaneo 600 (mai in argv, mai stampato).
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
M="${1:?metodo}"; P="${2-}"; BODY="${3:-}"
case "$P" in ""|/*) ;; *) echo "percorso deve essere vuoto o iniziare con /"; exit 2;; esac
case "$P" in *..*|*@*|*://*) echo "percorso non ammesso"; exit 2;; esac
H="$(mktemp "$HOME/.ghh.XXXXXX")"; trap 'rm -f "$H"' EXIT; chmod 600 "$H"
printf 'header = "Authorization: Bearer %s"\n' "$(cat "$HOME/.tae-gh-token")" > "$H"
ARGS=(-sS -m 60 -K "$H" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" -X "$M")
[ -n "${LOC:-}" ] && ARGS+=(-L)
[ -n "$BODY" ] && ARGS+=(-H "Content-Type: application/json" -d "$BODY")
if [ -n "${OUT:-}" ]; then
  code="$(curl "${ARGS[@]}" -o "$OUT" -w '%{http_code}' "https://api.github.com/repos/dibbiii/tae-sandbox$P")"
  echo "HTTP $code"
else
  curl "${ARGS[@]}" -w '\nHTTP %{http_code}\n' "https://api.github.com/repos/dibbiii/tae-sandbox$P"
fi
