#!/usr/bin/env bash
# Sonde a COSTO ZERO sulla superficie di controllo del Gateway OpenClaw. Eseguito DENTRO bwrap (client e Gateway entrambi nella
# sandbox: nessun comando puo' girare sull'host). Solo richieste che verificano se una modifica di config e' ACCETTATA
# (e subito ripristinata); nessuna modifica viene usata per eseguire qualcosa. Nessun LLM. Non stampa il token.
# Uso (dentro la sandbox): bash /home/sandbox/control-probe.sh
cd /home/dibbi/oc-ws/ws1 || exit 1
TOK="$(node -e 'const c=require("fs").readFileSync(process.env.HOME+"/.openclaw/openclaw.json","utf8");console.log(JSON.parse(c).gateway.auth.token)')"
echo "== A. senza token: POST /tools/invoke -> HTTP $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"tool":"sessions_list","args":{}}' http://127.0.0.1:18789/tools/invoke)"
echo "== A2. token errato -> HTTP $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'authorization: Bearer wrong' -H 'content-type: application/json' -d '{"tool":"sessions_list","args":{}}' http://127.0.0.1:18789/tools/invoke)"
echo "== B. tools.catalog (id dei tool; il profilo e' 'full')"
openclaw gateway call tools.catalog --json 2>/dev/null > /tmp/cat.json
node -e '
const j=JSON.parse(require("fs").readFileSync("/tmp/cat.json","utf8"));
const out=[];(function w(o){ if(Array.isArray(o)) o.forEach(w); else if(o&&typeof o==="object"){ if(typeof o.id==="string"&&("description" in o||"label" in o)) out.push(o.id); Object.values(o).forEach(w);} })(j);
console.log([...new Set(out)].sort().join(" "));
const want=["exec","process","gateway","openclaw","cron","sessions_spawn","sessions_send","nodes","plugins","github_publish","apply_patch","browser","web_fetch","message"];
console.log("presenti tra quelli di interesse:", want.filter(w=>out.includes(w)).join(" "));'
echo "== C. config.get: contiene il token in chiaro? $(openclaw gateway call config.get --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=process.argv[1];console.log(s.includes(t)?"SI (in chiaro)":"NO (redatto)")})' "$TOK")"
HASH="$(openclaw gateway call config.get --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.hash||j.baseHash||(j.snapshot&&j.snapshot.hash)||"")})')"
echo "baseHash: ${HASH:0:12}..."
echo "== D. modifica di config via WS RPC config.patch (accettata? poi ripristino)"
P1="$(node -e 'console.log(JSON.stringify({raw:JSON.stringify({tools:{sessions:{visibility:"agent"}}}),baseHash:process.argv[1]}))' "$HASH")"
openclaw gateway call config.patch --params "$P1" --json 2>&1 | head -c 600; echo
echo "-- visibility dopo la patch: $(node -e 'console.log(JSON.stringify((JSON.parse(require("fs").readFileSync(process.env.HOME+"/.openclaw/openclaw.json","utf8")).tools||{}).sessions))')"
HASH2="$(openclaw gateway call config.get --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.hash||j.baseHash||(j.snapshot&&j.snapshot.hash)||"")})')"
P2="$(node -e 'console.log(JSON.stringify({raw:JSON.stringify({tools:{sessions:{visibility:null}}}),baseHash:process.argv[1]}))' "$HASH2")"
openclaw gateway call config.patch --params "$P2" --json 2>&1 | head -c 400; echo
echo "-- tools.sessions dopo il ripristino: $(node -e 'console.log(JSON.stringify((JSON.parse(require("fs").readFileSync(process.env.HOME+"/.openclaw/openclaw.json","utf8")).tools||{}).sessions))')"
