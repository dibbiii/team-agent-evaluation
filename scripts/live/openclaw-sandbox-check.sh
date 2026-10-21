#!/usr/bin/env bash
# Eseguito DENTRO la sandbox (oc-sandboxed). Nessuna credenziale (senza --creds), nessun LLM.
echo "id: $(id -u):$(id -g) HOME=$HOME pwd=$(pwd)"
echo "env: $(env | cut -d= -f1 | sort | tr '\n' ' ')"
echo "== DNS/HTTPS"; getent hosts api.anthropic.com | head -1 || echo "DNS FALLITO"
echo "api.anthropic.com HTTP: $(curl -sS -m 15 -o /dev/null -w '%{http_code}' https://api.anthropic.com/ 2>&1)"
echo "== visibilita' host"
for p in /home/dibbi/.claude /home/dibbi/.claude/.credentials.json /home/dibbi/.claude.json /home/dibbi/warren /home/dibbi/fixtures /home/dibbi/oc-fixture /home/dibbi/oc-logs /home/dibbi/decoy-secret.txt /home/dibbi/ps /home/dibbi/ps-src /home/dibbi/pc /home/dibbi/out /home/dibbi/openclaw-sandboxed.sh /mnt/c; do
  if [ -e "$p" ]; then echo "VISIBILE: $p"; else echo "assente: $p"; fi
done
echo "ls /home/dibbi: $(ls -A /home/dibbi | tr '\n' ' ')"
echo "sandbox HOME ~/.claude: $(ls -A "$HOME/.claude" | tr '\n' ' ')"
echo "== esca fuori dal workspace"
cat /home/dibbi/decoy-secret.txt 2>&1 | head -1
echo x > /home/dibbi/tae-escape-oc.txt 2>&1 && echo "scrittura /home/dibbi/tae-escape-oc.txt: RIUSCITA (tmpfs effimero)" || echo "scrittura /home/dibbi: negata"
echo x > /etc/tae-x 2>&1 | head -1; echo x > /usr/tae-x 2>&1 | head -1; echo x > /home/dibbi/oc/tae-x 2>&1 | head -1
echo x > "$(pwd)/tae-ws-write.txt" && echo "scrittura nella cwd: RIUSCITA" && rm -f "$(pwd)/tae-ws-write.txt"
echo "== strumenti"
node -v; echo "npm: $(npm -v)"; echo "claude: $(command -v claude) $(claude --version 2>&1 | head -1)"; echo "openclaw: $(command -v openclaw) $(openclaw --version 2>&1 | head -1)"
(cd "$(pwd)" && [ -f package.json ] && npm test 2>&1 | tail -4)
echo "== processi in /proc: $(ls /proc | grep -c '^[0-9]')"
echo "== namespace: pid=$(readlink /proc/self/ns/pid) mnt=$(readlink /proc/self/ns/mnt) net=$(readlink /proc/self/ns/net) user=$(readlink /proc/self/ns/user)"
echo "== claude auth status (sandbox senza credenziali)"; claude auth status --json 2>&1 | head -3
