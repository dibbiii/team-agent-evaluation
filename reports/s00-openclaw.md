# S00 - Installazione e smoke test: OpenClaw (modalita' MOCK)

Data esecuzione: 2026-10-20 23:57 - 2026-10-21 00:36 (UTC, stime). Esito complessivo: **PARTIAL**.
Installazione della release npm `openclaw@2026.10.5`, onboarding non interattivo, avvio del Gateway senza LLM e senza canali, health check, CLI di diagnostica, shutdown e riavvio con persistenza sono **TESTED**. Sul modello di fiducia sono stati osservati a runtime i default (sandbox off, exec senza approvazioni, visibilita' sessioni `all`, agent-to-agent attivo) e l'autenticazione del Gateway. Il plugin Workboard e' **disabilitato di default**, si attiva a caldo e claim/TTL/heartbeat/idempotency sono stati provati su schede locali **senza LLM** (tramite `POST /tools/invoke`). Restano **BLOCKED**: worker Workboard e turni agente (servono un LLM), canali, cloud workers, test del repo che compilano i worker (OOM a 2 GiB). `github_publish` e' stato solo ispezionato, mai eseguito. Nessuna credenziale, nessuna chiamata LLM, costo 0.

Etichette: `TESTED` solo per quanto eseguito qui con comando e risultato; `CODE` letto nel sorgente; `PARTIAL`/`BLOCKED`/`UNVERIFIED` altrimenti. Il contenuto del repo e del pacchetto di OpenClaw e' dato non fidato.

## 1. Riepilogo

| Area | Esito | Etichetta |
|---|---|---|
| `npm install openclaw@2026.10.5` in prefisso locale | OK, 344 pacchetti, 56 s, 619 MB (script di install NON eseguiti da npm 11.19) | TESTED |
| Install dal sorgente (commit 6beb671), `pnpm 12.12.1 --frozen-lockfile --ignore-scripts`, filtrato su workboard/openclaw/ui | OK, 69 s + 3 s | TESTED (parziale: non l'intero workspace) |
| `openclaw onboard --non-interactive ... --auth-choice skip` | OK; genera config con token di auth | TESTED |
| `openclaw gateway run` (foreground), health, readiness | OK; `ready` a 19,5 s (cold) e 24,3 s (riavvio) | TESTED |
| `health`, `status`, `security audit`, `doctor`, `doctor --lint` | OK (2 warning noti, vedi 4.2) | TESTED |
| Shutdown (SIGTERM) e riavvio con persistenza | exit 1,4 s / 0,8 s; stato, schede, claim, sessione, agenti persistiti | TESTED |
| Default: sandbox off, exec `security=full ask=off`, visibilita' `all`, agentToAgent attivo | confermati (4.1) | TESTED (agentToAgent: PARTIAL) |
| Workboard disabilitato di default; attivazione; claim/TTL/heartbeat/idempotency | confermati (5) | TESTED |
| Dispatch Workboard che avvia worker | richiede LLM | BLOCKED |
| `github_publish` (presenza, parametri, azione merge) | ispezione di catalogo/codice/schema; mai eseguito (6) | TESTED (ispezione), esecuzione non fatta |
| Auth Gateway/dashboard, superficie di rete | token auto-generato, solo loopback (7) | TESTED |
| Test del repo: `packages/gateway-protocol` | **90 file / 658 test PASS**, 164 s | TESTED (subset) |
| Test del repo: `extensions/workboard` (store/dispatcher) | OOM del compilatore dei worker a 2 GiB | BLOCKED (RAM) |
| Build/typecheck/suite completa da sorgente | non tentati | UNVERIFIED |
| Canali, `ask_user`, cloud workers, turni agente, Control UI interattiva | non ammessi / richiedono LLM o browser | BLOCKED |

## 2. Ambiente, isolamento e versioni

- Host: Windows 11, Docker Engine 29.2.0 (VM da 8 GB), Git Bash con `MSYS_NO_PATHCONV=1`. Un solo container, `tae-openclaw-s00`, label `tae=1`. Verificato con `docker inspect`: `Memory=2147483648`, `MemorySwap=2147483648`, `NanoCpus=2000000000`, `PidsLimit=512`, `CapDrop=[ALL]`, `SecurityOpt=[no-new-privileges]`, `User=node` (uid 1000), `Privileged=false`, **`Mounts=0`**, **`PortBindings=map[]`**, nessun socket Docker, rete bridge predefinita, `--init`. Variabili d'ambiente host: nessuna (solo quelle dell'immagine).
- **Rete in uscita non filtrata** per tutta la sessione. Traffico effettivo noto: pull dell'immagine, registry npm (anche via corepack per scaricare pnpm 12.12.1). Il controllo versione di OpenClaw ("update checks only", `status`) non e' stato osservato a livello di rete.
- **Quale codice ho usato (dichiarato):**
  - **Runtime e avvio**: pacchetto npm ufficiale `openclaw@2026.10.5` (dist-tag `latest`; `openclaw --version` -> `2026.10.5 (1b58cb9)`). Il commit `1b58cb9` **non e' presente** nel clone shallow (`git cat-file` fallisce): la release **non e' il commit studiato** nella scheda.
  - **Test**: sorgente al commit `6beb671cda9dd964bc16abf4ecb07d1922313134`, con `git -c core.autocrlf=false archive --prefix=openclaw-src/ HEAD` (60.481 voci, 724 MB, 0 righe CRLF in `package.json` e `pnpm-lock.yaml`), copiato con `docker cp`. Il clone Windows non e' stato toccato.
  - Il `package.json` del sorgente riporta `2026.10.5` come la release, ma il contenuto differisce (vedi 6: l'azione `merge` c'e' solo nel sorgente).
  - Non ho usato l'immagine ufficiale `ghcr.io/openclaw/openclaw` (la documentazione la raccomanda per il Docker, la build locale richiede >= 6 GB).

| Voce | Valore |
|---|---|
| Immagine | `node:24-bookworm` (Debian 12), digest `sha256:14078204b6bb268c107ceff6d3c43f45a888105e5c2b18b14c32b3409d93a1b0` |
| Node / npm / pnpm / git | v24.22.0 / 11.19.1 / 12.12.1 (corepack 0.36.0, da `packageManager`) / 2.39.5 |
| OpenClaw (runtime) | npm `2026.10.5`, build `1b58cb9`, SQLite 3.53.4 (dal log), 14 plugin caricati di default |
| OpenClaw (test) | commit `6beb671c` (committer date 2026-10-20T18:23:30Z) |

## 3. Passi eseguiti, comandi e risultati

### 3.1 Container

```bash
export MSYS_NO_PATHCONV=1
docker pull node:24-bookworm && docker tag node:24-bookworm tae-node:24-bookworm
docker create --name tae-openclaw-s00 --label tae=1 --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512 \
  --cap-drop ALL --security-opt no-new-privileges --user node --init -w /home/node --entrypoint sleep tae-node:24-bookworm infinity
docker start tae-openclaw-s00
```

### 3.2 Installazione (release npm)

Prima ho ispezionato il pacchetto: `npm view` (bin `openclaw.mjs`, engines `node >=24.16.0 <25 || >=26.1.0`, `preinstall: scripts/preinstall-package-manager-warning.mjs`, `postinstall: scripts/postinstall-bundled-plugins.mjs`), poi `npm pack` ed estrazione in una cartella separata: il postinstall fa solo pulizia locale di `dist/` (nessuna rete, nessun `exec` rilevante nelle righe cercate); il preinstall controlla il package manager e la versione di Node. Non ho letto riga per riga tutti i file del pacchetto (249 MB scompattati).

```bash
npm install --prefix ~/oc openclaw@2026.10.5 --maxsockets 4 --no-fund --no-audit
# -> added 344 packages in 56s (exit 0)
~/oc/node_modules/.bin/openclaw --version   # OpenClaw 2026.10.5 (1b58cb9)
```

**Passaggio non documentato**: il README indica `npm install -g openclaw@latest --allow-scripts=openclaw`. Con **npm 11.19.1** (quello dell'immagine) l'installazione e' riuscita ma ha stampato `5 packages have install scripts not yet covered by allowScripts` ed **ha saltato** gli script di `openclaw`, `esbuild`, `koffi`, `protobufjs`, `@google/genai` (npm 12 usa `--allow-scripts`). Non ho approvato gli script: tutto cio' che ho provato funziona senza. Gli effetti dello script di `koffi` (prebuild nativo) e di `esbuild` sul runtime sono quindi **non verificati** (non ho incontrato errori). Nessun `-g`: prefisso locale in `~/oc`.

### 3.3 Onboarding senza LLM ne' canali

```bash
openclaw onboard --non-interactive --accept-risk --mode local --flow quickstart --auth-choice skip \
  --no-install-daemon --skip-channels --skip-skills --skip-health
```

Esito: `Workspace OK`, `Sessions OK`, `Updated config: ~/.openclaw/openclaw.json`. Il comando non e' stato cronometrato. Creati sotto `~/.openclaw` (40 MB a fine sessione): `openclaw.json` (0600), `config-journal-fingerprint.key`, `state/openclaw.sqlite`, `workspace/` (con `.git` locale e `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`...), `agents/main/`. `--accept-risk` e' **obbligatorio** per `--non-interactive`. Nessuna scrittura fuori da HOME e `/tmp/openclaw` (log).

### 3.4 Avvio del Gateway e health

```bash
openclaw gateway run > ~/gw.log 2>&1      # foreground, nessun servizio systemd
curl http://127.0.0.1:18789/healthz       # {"ok":true,"status":"live"}
curl http://127.0.0.1:18789/readyz        # {"ready":true,"failing":[],"uptimeMs":14738,...}
```

- Primo avvio: `startup phase: ready total=19532ms`; secondo avvio (stesso HOME): `ready total=24325.8ms`. Il polling dell'`/healthz` ha dato 200 prima del `ready` (e' un controllo di liveness): durante quella finestra `/tools/invoke` rispondeva `sessions.list unavailable during gateway startup`. Per la prontezza usare `/readyz` o il log `[gateway] ready`.
- Log al primo avvio: `agent model: openai/gpt-6-astra` (nessuna credenziale, nessuna chiamata), `http server listening (14 plugins: anthropic, browser, canvas, cua-computer, device-pair, file-transfer, geolocation, github, linux-node, memory-core, ollama, openai, talk-voice, xai)`, `[plugins] memory-core: created managed dreaming cron job`, `[heartbeat] started` (intervallo 30 min, in attesa di una route di consegna).
- `openclaw health` -> `Gateway event loop: ok`, `Agents: main (default)`, 2,8 s.

### 3.5 CLI di diagnostica

| Comando | Risultato | Durata |
|---|---|---|
| `openclaw status` | tabella: `Gateway local ws://127.0.0.1:18789 (local loopback) reachable ... auth token`, `Telemetry disabled · update checks only`, `Gateway service ... not installed`, `Channels: No channels configured` | 11 s |
| `openclaw security audit` | `0 critical · 1 warn · 1 info`; warn `gateway.trusted_proxies_missing`; info `attack surface`: `tools.elevated: enabled`, `hooks.webhooks: disabled`, `hooks.internal: enabled`, `browser control: enabled` | 4,6 s |
| `openclaw doctor --non-interactive` (gateway acceso) | `Startup optimization` (suggerisce `NODE_COMPILE_CACHE`, `OPENCLAW_NO_RESPAWN`), warning bind loopback, `No command owner is configured`, `No successful backup`, **`Unable to read cron job store ... file lock timeout ... cron-authority`**, `openclaw.json contains plaintext secret-bearing config fields: gateway.auth.token` | 19,7 s |
| `openclaw doctor --non-interactive` / `--lint` (gateway fermo) | il messaggio sul cron **non compare**; `--lint` JSON: `checksRun 36`, 2 warning (bind loopback, token in chiaro) | n.m. |
| `openclaw gateway call tools.catalog` / `sandbox explain` / `approvals get` / `exec-policy show` | vedi 4 e 6 | - |

Il lock sul cron store e' dunque un'interferenza di `doctor` con il Gateway in esecuzione (non un guasto persistente): osservato, non indagato oltre.

### 3.6 Shutdown, riavvio, persistenza

```bash
kill -TERM <pid openclaw-gateway>   # 1a volta: exit dopo 1446 ms; log: [shutdown] completed cleanly in 579ms
                                    # 2a volta: exit dopo 826 ms;  log: [shutdown] completed cleanly in 404ms
openclaw gateway run                # riavvio sullo stesso HOME
```

Dopo il riavvio: le 3 schede Workboard (con stato e claim di `tae-b`), la sessione creata, l'agente `tae-b` e `plugins.entries.workboard.enabled=true` erano presenti; `workboard_heartbeat` come `tae-b` sulla scheda gia' reclamata ha funzionato (il claim e' sopravvissuto al riavvio). Non e' stato provato un kill -9 ne' un crash con run in volo (richiederebbe un LLM): S06 non coperto.

### 3.7 Memoria e disco

`docker stats --no-stream` (include page cache): container a riposo dopo install 234 MiB; Gateway attivo 1,19-1,24 GiB poco dopo l'avvio, 1,46 GiB a regime con Workboard attivo, 1,61-1,69 GiB dopo il riavvio; RSS del processo `openclaw-gateway` 1.143.948 KB (~1,1 GB) piu' 3 processi figli (spawn-broker x2, sqlite worker) da 73-93 MB. PID nel container 51-63. Disco: `~/oc` 619 MB, `~/openclaw-src` 1,8 GB (dopo install filtrato), `~/.openclaw` 40 MB. **Il Gateway da solo occupa circa 1,2-1,7 GiB**: con 2 GiB e' al limite per fare altro nello stesso container (per questo i test sono stati eseguiti a Gateway fermo).

## 4. Default del modello di fiducia osservati a runtime

La configurazione generata da `onboard` e' scarna: `gateway {mode local, auth {mode token, token <generato>}, port 18789, bind loopback, tailscale off}`, `tools.profile "full"`, `agents.entries.main`, plugin `anthropic`/`codex` con `sessionCatalog.enabled=false`, hook interno `session-memory` abilitato. **Gli altri default non vengono scritti**: `openclaw config get` risponde `Config path is valid but unset ... The runtime default applies` per `agents.defaults.sandbox.mode`, `tools.sessions.visibility`, `tools.agentToAgent.enabled`, `tools.exec.*`, `tools.elevated`, `update`. I valori effettivi sono stati ricavati dalla CLI e da prove.

### 4.1 Valori effettivi

| Default della scheda (§7.1) | Osservato | Come | Etichetta |
|---|---|---|---|
| `sandbox.mode = off` | **confermato**: `mode: off scope: agent`, `runtime: direct`, `workspaceSource: direct`, backend `docker` configurato ma inattivo | `openclaw sandbox explain` | TESTED |
| `tools.exec` `security=full`, `ask=off` | **confermato**: `Requested security=full (OpenClaw default (full)) ask=off`, host `inherits`, effective `security=full ask=off`, `askFallback=deny`, "Approvals State: defaults (no stored overrides)"; `exec: Allowed by configuration; execution unverified` | `openclaw approvals get`, `openclaw exec-policy show` | TESTED (policy); esecuzione di `exec` non provata |
| `tools.profile` | `full` **scritto da onboard**; `full` = nessun filtro sui tool core | config | TESTED |
| `tools.elevated` | `enabled: true`, ma `allowedByConfig: false` | `sandbox explain` | TESTED |
| `tools.sessions.visibility = all` | **confermato**. Un agente `tae-b` ha elencato (`sessions_list`) e letto (`sessions_history`) la sessione di `main`; con `tools.sessions.visibility=agent` -> lista vuota con `"restricted":true` e history `"forbidden"`; ripristinato con `config unset` (applicato a caldo, senza riavvio) | `POST /tools/invoke` con `agentId` | TESTED |
| `tools.agentToAgent.enabled = true` | **confermato come configurazione effettiva** dal `security audit` con 2 agenti: "`tools.sessions.visibility resolves to "all" and tools.agentToAgent is enabled with no allow list`... allowed session tools: sessions_list, sessions_history, sessions_search, sessions_send, session_status". Il codice usa `enabled !== false` (CODE `dist/session-visibility-CsApTpaW.mjs:101`). L'invio effettivo con `sessions_send` non e' stato eseguito: e' nella deny list HTTP di `/tools/invoke` | audit + codice | PARTIAL |

Nota di metodo: le prove di visibilita' passano da `/tools/invoke` con il token operatore (auth a segreto condiviso = accesso operatore pieno, DOC `tools-invoke-http-api.md`), che simula il tool di un agente senza LLM; non e' un turno agente reale. Con **un solo agente** il `security audit` non emette la finding sulla visibilita'; compare con 2 agenti (`security.trust_model.cross_agent_session_access_default`).

### 4.2 Altre osservazioni

- `security audit` non segnala come problema `sandbox off` ne' `exec ask=off`: le considera la configurazione "assistente personale" (riga "trust model: personal assistant (one trusted operator boundary)").
- Il token del Gateway e' in **chiaro** in `openclaw.json` (0600) e `doctor` lo segnala (suggerisce SecretRef). Un agente/tool con accesso al filesystem puo' leggerlo.
- Il warning `No command owner is configured`: senza owner, chi puo' aggiornare/riavviare/approvare via chat non e' definito.

## 5. Workboard

- **Esistenza e stato**: `openclaw plugins list` -> riga `Workboard | workboard | openclaw | disabled | stock:workboard/index.js | 2026.10.5`; `plugins inspect workboard`: `Status: disabled ... Reason: bundled (disabled by default)`. **Confermato**: bundled e disabilitato di default. (`github` e `github-copilot` risultano invece `enabled`.)
- **Attivazione**: `openclaw plugins enable workboard` -> `Enabled plugin "workboard".` in 5,3 s; log `Plugin replacement applied: workboard` e `config hot reload applied` (nessun riavvio). Dopo il riavvio resta abilitato. Il comando CLI `openclaw workboard list` legge lo stato locale e ha mostrato le stesse 3 schede.
- **Come l'ho esercitato senza LLM**: i tool `workboard_*` sono tool dell'agente; li ho invocati con `POST http://127.0.0.1:18789/tools/invoke` (token operatore, dall'interno del container), con `agentId` `main` oppure `tae-b` per simulare due owner diversi (l'owner del claim e' `ctx.agentId`, CODE `extensions/workboard/index.js:1494`). Un secondo agente `tae-b` e' stato creato con `openclaw agents add tae-b --non-interactive --workspace ...`.

| Prova | Risultato osservato |
|---|---|
| `workboard_create` con `idempotencyKey` "tae-idem-1", due volte, la seconda con titolo diverso | stessa scheda (stesso id), il titolo diverso **ignorato in silenzio** (nessun errore di conflitto) |
| `workboard_claim` `ttlSeconds:20` come `main` | scheda `ready` -> `running`, `claim {ownerId main, claimedAt, lastHeartbeatAt, expiresAt = +20 s}`; token UUID (36 car.) restituito una sola volta, `metadata.claim.token = "[redacted]"` in ogni lettura |
| claim come `tae-b` sulla stessa scheda; secondo claim di `main` | rifiutati: `card already claimed by main.` (HTTP **500** generico `tool execution failed`; il motivo e' solo nel log) |
| `workboard_heartbeat`/`comment`/`move` come `tae-b` senza token e con token errato | rifiutati: `card is claimed by main.` |
| `workboard_heartbeat` come `main` (owner, senza token) | OK; `lastHeartbeatAt` e `expiresAt` avanzano; la `note` viene salvata come commento |
| `workboard_heartbeat` come `tae-b` **con il token corretto** | OK: il token funziona come capability anche per un agente diverso dall'owner |
| `workboard_claim` di un secondo lavoro da parte di `main` | `Owner main already has active Workboard work.` (un solo lavoro attivo per owner) |
| figlio con `parents:[P]`: creato `todo`; claim del figlio | `card dependencies are not done.`; dopo `claim`+`complete` del genitore (come `tae-b`, con token) e `workboard_dispatch`, il figlio e' **promosso a `ready`** |
| `workboard_complete` senza claim/token | `card must be claimed before lifecycle completion.` |
| scadenza del claim: attesa oltre `expiresAt` (25 s dopo l'ultimo heartbeat) + `workboard_dispatch` | **nulla**: la scheda resta `running` (`reclaimed: []`, `blocked: []`). Causa (CODE `sqlite-store-errors-*.mjs`): `CLAIM_RECLAIM_MS = 300000`, una scheda `running` con claim scaduto e' reclamabile solo **5 minuti dopo** la scadenza |
| `workboard_dispatch` a ~5 min dalla scadenza | scheda `running -> blocked`, notifica `kind failed "Claim expired without a recent heartbeat."`, `failureCount 1`, claim rimosso |
| `workboard_unblock`, poi claim come `tae-b` | OK (recupero da claim scaduto) |

Quindi: lease con token, TTL, heartbeat, idempotency key per la creazione, owner esclusivo e dipendenze **funzionano e sono verificate** (`TESTED`), con tre caveat: (1) il TTL "effettivo" per le schede `running` include un grace di 5 minuti oltre a `ttlSeconds` (default `DEFAULT_CLAIM_TTL_MS` 30 min, CODE); (2) la chiave di idempotenza ignora un payload diverso senza segnalarlo; (3) gli errori arrivano al client HTTP come 500 generico. Il lease e' su schede **locali** di un Gateway, non su issue Jira. La **dispatch che avvia worker** tramite il runtime subagent non e' stata provata (serve un modello): `BLOCKED`. `proof` resta "worker-reported", come da documentazione: ho solo passato `status:"passed"` a mano e la scheda lo ha accettato, senza verifica indipendente (comportamento coerente con la scheda, DOC).
- Warning ricorrente nel log: `[plugins] workboard lifecycle sync failed: Error: Gateway requester authority changed`, ogni 60 s, comparso dopo l'uso di `/tools/invoke` e le modifiche di config. Non diagnosticato (ipotesi non verificata: autorita' del richiedente della sessione di sincronizzazione cambiata dalle mie chiamate con `agentId` diversi). Nessun effetto visibile sui dati.

## 6. `github_publish` e azione `merge` (solo ispezione)

Non eseguito, nessuna credenziale GitHub fornita.

- `openclaw gateway call tools.catalog` (release 2026.10.5): `github_identity_status` ("Inspect the effective GitHub identity and credential health") e **`github_publish` ("Publish the reconciled session worktree as a draft GitHub pull request")**, `defaultProfiles: ["coding"]` (quindi presenti anche con `tools.profile: "full"`). Invocati via `/tools/invoke` come `main`, `github_identity_status` risponde `404 Tool not available`: i tool sono "run-dependent" e disponibili solo in sessioni con identita' GitHub/workspace idonei (DOC `tool-policy.md`).
- **Nel bundle della release 2026.10.5** il tool accetta solo `title` e `body` e chiama `sessions.github.publish`: **nessuna azione `inspect/ready/merge/close`**, nessun `mergeMethod`/`expectedHeadCommit`/`request_review`/`upload_evidence`/`refresh_base` (grep su `dist/` e `docs/`).
- **Nel sorgente al commit 6beb671** (`CODE`): `packages/gateway-protocol/src/schema/session-github-publication.ts` definisce `GitHubPublicationActionSchema` con `action: inspect|ready|merge|close`, `mergeMethod: merge|squash|rebase`, `expectedHeadCommit` (sha di 40 caratteri) e `requestId`; `src/agents/tools/github-publish-tool.ts` espone queste azioni solo se `actionsAvailable === true` (calcolato in `src/agents/openclaw-tools.ts:543`, non analizzato a fondo) e la descrizione dice "For an explicit landing request from a person with full operator write access, use inspect, then ready and merge". I 16 test di `session-github-publication.test.ts` passano (vedi 8.1), ma non coprono l'esecuzione reale.
- **Discrepanza con la scheda**: la scheda (§9, R12) attribuisce `merge` a `github_publish` senza distinguere versioni. Corretto: la capacita' di merge e' nel codice `main` (commit studiato), **non nella release npm 2026.10.5**. Per un deploy basato sulla release attuale, `github_publish` e' limitato a PR draft. Come negare `merge` in una versione che lo ha (policy `tools.deny: ["github_publish"]`, `actionsAvailable`, credenziali GitHub senza permesso di merge): **non provato** (`UNVERIFIED`).

## 7. Autenticazione e superficie di rete

- **Auth di default**: `gateway.auth.mode = "token"`, token **generato automaticamente da `onboard`**, scritto in chiaro in `openclaw.json` (0600). Nessuna password di default, nessun accesso anonimo ai dati.
- Senza `Authorization` o con token errato: `POST /tools/invoke` -> **401** `{"error":{"message":"Unauthorized"}}`; `openclaw gateway call health --token wrongtoken` -> `unauthorized: gateway token mismatch ... AUTH_TOKEN_MISMATCH`; WebSocket senza handshake `connect`: chiusura 1008 `invalid handshake: first request must be connect` (il server invia una `connect.challenge` con nonce prima). `gateway.auth.rateLimit` non impostato (default runtime non verificato).
- **Pubblico (senza auth)**: `GET /healthz`, `/readyz` (con uptime e metriche event loop) e la **shell statica della Control UI** (qualunque rotta SPA come `/workboard`, `/plugins`, `/metrics`, `/hooks/wake` restituisce `200 text/html`; non sono endpoint reali). `/v1/models`, `/v1/chat/completions` -> 404; `/__openclaw__/worker`, `/j/*` -> 404; `/api/channels` -> 401. (Attenzione: una mia prima prova su `//` ha dato 401 per il doppio slash, non rappresentativo.)
- **Con il token**: `/tools/invoke` e' accesso da operatore pieno (DOC: i segreti condivisi ripristinano `operator.admin` ecc., scope ignorati). La deny list HTTP di default esclude `exec`, `spawn`, `shell`, `fs_*`, `apply_patch`, `sessions_spawn`, `sessions_send`, `cron`, `gateway`, `nodes`.
- **Rete**: `/proc/net/tcp` e `tcp6`: un solo listener, `127.0.0.1:18789` e `[::1]:18789`. Nessun listener su `0.0.0.0`, nessun altro porto (ne' browser control, ne' canvas) con la configurazione di default e senza canali. `bind: loopback`, `tailscale: off`, `hooks.webhooks: disabled`.
- **Telemetria**: `status` -> "disabled · update checks only". Traffico non osservato.

## 8. Test del repo (sottoinsieme dichiarato)

Sorgente 6beb671 in `~/openclaw-src`, Gateway fermo. `pnpm` 12.12.1 via corepack; install filtrato (`--filter openclaw --filter ./ui... --filter @openclaw/workboard...`, `--frozen-lockfile --ignore-scripts --child-concurrency=1 --network-concurrency=8`). Tre passi di install: il primo (solo workboard) non bastava perche' la config Vitest condivisa importa `@solidjs/vite-plugin` da `ui/`; aggiunti `ui...`.

### 8.1 Esiti

| Comando | Esito | Durata |
|---|---|---|
| `node scripts/test-projects.mts --maxWorkers=1 packages/gateway-protocol` | **90 file, 658 test PASS** (include i 16 test dello schema `session-github-publication`) | 164 s (168 s con l'avvio) |
| `... extensions/workboard/src/card-redaction.test.ts` | **PASS** (2 test) | < 25 s |
| `... extensions/workboard` (37 file) | 3 file passati / 34 falliti, 4 test passati: **`Compiled subprocess build failed with exit code 137`** | 258 s |
| `... extensions/workboard/src/dispatcher.test.ts` (due prove, la seconda con `NODE_OPTIONS=--max-old-space-size=700`) | stesso errore 137 | 25 s |

### 8.2 Diagnosi del fallimento

I test del dispatcher/store SQLite passano da `scripts/lib/vitest-worker-run.mts`, che avvia `vitest-worker-compiler.mts` per compilare i worker. Durante la compilazione `ps` mostrava il compilatore a ~1,4 GB di RSS piu' il bootstrap vitest (~440 MB) e il runner (~175 MB): sopra i 2 GiB il kernel ha ucciso il processo (`OOMKilled=true`, exit 137). Un heap Node ridotto non ha cambiato l'esito. **Causa: memoria (2 GiB), non un difetto del repo**; con >= 4 GiB potrebbe passare (non provato). Build (`pnpm build`), typecheck e suite completa non sono stati tentati (`UNVERIFIED`; la doc Docker indica "At least 6 GB RAM for a local source image build").

## 9. Errori, passaggi manuali e anomalie

1. `time` non esiste nella shell `sh` dell'immagine (`docker exec sh -c`): ho usato `bash -c` e `date`.
2. `docker cp` lascia `/tmp/openclaw-src.tar` di proprieta' di root: `rm` come `node` -> `Operation not permitted`; sparisce con il container.
3. npm 11.19 salta gli script di install (vedi 3.2): non e' stato necessario approvarli.
4. `corepack enable` richiede `--install-directory ~/bin` (non root); pnpm 12.12.1 scaricato da corepack al primo uso (`Corepack is about to download ...`).
5. Primo giro di test fallito per dipendenza mancante (`@solidjs/vite-plugin`), risolto aggiungendo `ui...` all'install.
6. `onboard --non-interactive` richiede `--accept-risk`; senza canali ne' LLM serve `--auth-choice skip`.
7. `doctor` con il Gateway acceso segnala un falso problema sul cron store (lock). Vedi 3.5.
8. Gli errori dei tool arrivano via HTTP come 500 `tool execution failed`: la causa e' leggibile solo in `/tmp/openclaw/openclaw-<data>.log` (`[tools-invoke] tool execution failed: Error: ...`).
9. Warning periodico `workboard lifecycle sync failed: ... requester authority changed` (non diagnosticato).
10. Il Gateway crea da solo un cron job `dreaming` (memory-core) e ha un heartbeat a 30 min: senza modello non ho visto chiamate, ma sono attivita' di fondo di default.

## 10. Discrepanze rispetto alla scheda (`docs/candidates/openclaw.md`)

| Affermazione della scheda | Esito S00 |
|---|---|
| Nessun `TESTED` / S00-S10 tutte BLOCKED | S00 eseguito (PARTIAL); S01-S10 restano non eseguiti |
| Workboard "disabilitato di default" | **Confermato** (TESTED) |
| Default `sandbox off`, `visibility all`, `agentToAgent true`, exec `full/ask off` | **Confermati** (TESTED; agentToAgent PARTIAL) |
| Lease Workboard: token, TTL, heartbeat, idempotenza (CODE/DOC) | **Confermati a runtime**, con dettagli nuovi: grace di 5 min sul reclaim, un solo lavoro attivo per owner, idempotenza che scarta payload diversi |
| `github_publish` con azioni `inspect, ready, merge, close` (R12: "capacita' di merge presente") | **Corretto**: vero per il codice `main` (6beb671, CODE), **falso per la release 2026.10.5** (solo draft PR). Esecuzione di merge non provata |
| `package.json` 2026.10.5 = ultima release | la release npm 2026.10.5 (build `1b58cb9`) non coincide col commit studiato (assente dal clone): le funzioni di `main` vanno verificate sulla versione che si adotta |
| "Install ufficiale raccomandata ... `--allow-scripts=openclaw`" | con npm 11.19 il flag non e' necessario ne' applicato; gli script sono saltati, il pacchetto funziona |
| Telemetria: solo controllo versione | coerente con `status` ("disabled · update checks only"); traffico non misurato |
| Auth del Gateway | non descritta in dettaglio: token auto-generato in chiaro su loopback, 401 senza token |

## 11. Limiti e riserve

- Un solo host (Windows 11 + Docker 29.2.0), container Linux x64, 2 GiB; n=1 per ogni misura (2 avvii).
- Le prove su sessioni, Workboard e tool usano `/tools/invoke` con il token operatore e `agentId`: dimostrano la logica lato Gateway, non il comportamento di un agente reale (prompt, policy per agente/sandbox, ruoli `member`/`observer` del team server non provati).
- Il multi-user mode, i ruoli nominati, `team-server`, la sandbox Docker (richiederebbe l'accesso al socket Docker, vietato), i cloud workers e i canali non sono stati provati.
- L'esecuzione di `exec`, di `github_publish` e di un turno agente non e' stata fatta; quelle righe della policy sono lette dalla CLI, non provate eseguendole.
- La memoria include page cache; i picchi dei test sono osservati con `ps` e `docker stats` non continui.
- Tempi dell'onboarding e dell'`openclaw status` non ripetuti; nessuna media.

## 12. Sblocco (cosa serve per completare S00 realmente)

- Un modello locale (es. Ollama) o un account di prova con budget approvato per: dispatch Workboard con worker reali, `ask_user`, turni agente, S06 (kill con run in volo).
- >= 4-6 GiB di RAM per la build/typecheck/suite completa e per i test del dispatcher/store Workboard.
- Un canale di prova non reale per i test di consegna (nessuno e' stato usato).
- Per `github_publish merge`: repository e token di valutazione con scope minimo e approvazione esplicita; verificare prima con policy `tools.deny` e `actionsAvailable` che il merge sia davvero negabile.

## 13. Cleanup verificato

Creato e rimosso (nome esplicito): container `tae-openclaw-s00` (`docker rm -f`). Immagini rimosse per nome: tag locale `tae-node:24-bookworm` e immagine scaricata `node:24-bookworm` (id `sha256:14078204b6bb...`); non esisteva alcuna immagine `node` prima. Nessun volume anonimo ne' rete creati. Rimosso dallo scratchpad `openclaw-src.tar`.

- `docker ps -a --filter label=tae=1` e `--filter name=tae-` -> vuoti; `docker volume ls --filter label=tae=1` e `docker network ls --filter label=tae=1` -> vuoti.
- Elenco immagini prima/dopo **identico** (17/17, `diff` vuoto); volumi 9 -> 9; reti 7 -> 7 (`diff` vuoto); container 9 -> 9 (la sola differenza nel confronto e' l'uptime di `segnalibro-db`, ancora `Up (healthy)`).
- Modificati solo `docs/candidates/openclaw.md`, `reports/s00-openclaw.md`, `results/s00-openclaw-bdccd84b.json`. Il clone `scratchpad\clones\openclaw` non e' stato toccato.

## 14. Riproduzione e pulizia (comandi esatti)

```bash
export MSYS_NO_PATHCONV=1
SP=C:/Users/brain/AppData/Local/Temp/claude/C--Users-brain-OneDrive-team-agent-evaluation/<sessione>/scratchpad
docker pull node:24-bookworm && docker tag node:24-bookworm tae-node:24-bookworm
docker create --name tae-openclaw-s00 --label tae=1 --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512 \
  --cap-drop ALL --security-opt no-new-privileges --user node --init -w /home/node --entrypoint sleep tae-node:24-bookworm infinity
docker start tae-openclaw-s00
docker exec tae-openclaw-s00 bash -c 'npm install --prefix ~/oc openclaw@2026.10.5 --maxsockets 4 --no-fund --no-audit'
docker exec tae-openclaw-s00 bash -c 'export PATH=~/oc/node_modules/.bin:$PATH; \
  openclaw onboard --non-interactive --accept-risk --mode local --flow quickstart --auth-choice skip --no-install-daemon --skip-channels --skip-skills --skip-health'
docker exec -d tae-openclaw-s00 bash -c 'export PATH=~/oc/node_modules/.bin:$PATH; exec openclaw gateway run > ~/gw.log 2>&1'
docker exec tae-openclaw-s00 curl -s http://127.0.0.1:18789/readyz
# Workboard senza LLM (token letto dal config dentro il container, mai stampato)
docker exec tae-openclaw-s00 bash -c 'export PATH=~/oc/node_modules/.bin:$PATH; openclaw plugins enable workboard'
# POST /tools/invoke {"tool":"workboard_claim","args":{"id":"<card>","ttlSeconds":20},"agentId":"main"}  con Authorization: Bearer <token>
# test del sorgente
git -C $SP/clones/openclaw -c core.autocrlf=false archive --prefix=openclaw-src/ HEAD -o $SP/oc/openclaw-src.tar   # commit 6beb671c
docker cp $SP/oc/openclaw-src.tar tae-openclaw-s00:/tmp/ && docker exec tae-openclaw-s00 bash -c 'cd ~ && tar -xf /tmp/openclaw-src.tar --no-same-owner'
docker exec tae-openclaw-s00 bash -c 'mkdir -p ~/bin && corepack enable --install-directory ~/bin && export PATH=~/bin:$PATH && cd ~/openclaw-src && \
  pnpm install --filter openclaw --filter "./ui..." --filter "@openclaw/workboard..." --frozen-lockfile --child-concurrency=1 --network-concurrency=8 --ignore-scripts && \
  CI=1 node scripts/test-projects.mts --maxWorkers=1 packages/gateway-protocol'
# pulizia (solo nomi tae-)
docker rm -f tae-openclaw-s00
docker rmi tae-node:24-bookworm node:24-bookworm
docker ps -a --filter label=tae=1        # deve essere vuoto
```
