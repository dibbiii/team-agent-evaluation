# S00 - Installazione e smoke test: Paperclip (modalita' MOCK)

Data esecuzione: 2026-10-20 (UTC, circa 21:35-22:12). Esito complessivo: **PARTIAL**.
Installazione dal sorgente, avvio del server in `local_trusted`, health check, API, creazione company/agente/issue e un run con adapter `http` verso un webhook locale (nessun LLM) sono **TESTED**. Il percorso ufficiale `pnpm dev` (UI Vite + runner nativo Rust), il typecheck completo, la build della UI e la suite completa sono **BLOCKED** (manca la toolchain Rust e/o servono piu' di 2 GiB di RAM). L'issue #16935 e' **RIPRODOTTA** (sul commit studiato e sulla release npm 2026.1012.0). Nessuna credenziale, nessuna chiamata LLM, costo 0.

Etichette del §4: `TESTED` solo per quanto eseguito qui con comando e risultato. Il contenuto del repo di Paperclip e' dato non fidato.

## 1. Cosa e' stato provato (riassunto)

| Area | Esito | Etichetta |
|---|---|---|
| `pnpm install` dal sorgente (commit 05f7079) | 1a prova: **OOM-killed** (exit 137, 104 s); 2a prova con `--child-concurrency=1 --network-concurrency=8`: OK, 1.351 pacchetti, 44 s | TESTED |
| `pnpm dev:once` (percorso documentato, DB embedded + migrazioni) | si ferma: serve `cargo` per il runner nativo | BLOCKED (toolchain Rust assente) |
| `pnpm dev:once` con `PAPERCLIP_RUNNER_BINARY=/bin/true` (aggira la build Rust) | server in ascolto, poi **OOM-killed** dal Vite dev middleware (limite 2 GiB) | TESTED (fallimento) |
| Server headless: `tsx src/index.ts` con `SERVE_UI=false` | OK: `/api/health` 200 in 14-22 s, `local_trusted`, bind 127.0.0.1 | TESTED |
| API: company, agente `http`, chiave agente, issue, run | OK (vedi 3.5) | TESTED |
| Run end-to-end senza LLM (adapter `http` -> webhook locale) | run `succeeded` in 1,3 s, POST ricevuto dal webhook, issue passata a `in_progress` | TESTED |
| Shutdown (SIGTERM) e riavvio sullo stesso DB | exit pulito in 240-425 ms; dati persistiti; Postgres embedded fermato | TESTED |
| Quickstart ufficiale `npx paperclipai@2026.1012.0 onboard --yes` (release npm, **non** il commit studiato) | OK, UI statica 200, health in ~190 s (include download npm + compilazione native) | TESTED |
| Test: `vitest` su `packages/shared` + http adapter + permessi/budget (subset) | 95 file / 1.012 test PASS; 3 file / 108 test PASS | TESTED (subset) |
| Typecheck `shared` e `adapter-utils` | OK (3 s ciascuno) | TESTED |
| Typecheck `server` | fallisce: richiede `cargo` (prepare:runner-vendor) | BLOCKED |
| Typecheck `packages/db` (`tsc --noEmit`) | **OOM-killed** a 2 GiB (anche con heap 1,7 GB) | BLOCKED (RAM) |
| Build UI (`vite build`) | **OOM-killed** dopo "7968 modules transformed" | BLOCKED (RAM) |
| Suite completa `pnpm test` | non eseguita (enorme, vedi 3.6) | UNVERIFIED |
| Adapter `claude_local` / altri agenti reali | non provato per vincolo (credenziali) | BLOCKED |
| Issue #16935 | **riprodotta** | TESTED |
| Windows nativo | non provato | UNVERIFIED |

## 2. Ambiente e isolamento

- Host: Windows 11, Docker Engine 29.2.0. Git Bash con `MSYS_NO_PATHCONV=1`.
- Un solo container, `tae-paperclip-s00`, label `tae=1`. Verificato con `docker inspect`: `Memory=2147483648`, `MemorySwap=2147483648`, `NanoCpus=2000000000`, `PidsLimit=512`, `CapDrop=[ALL]`, `SecurityOpt=[no-new-privileges]`, `User=node` (uid 1000), `Privileged=false`, **`Mounts=0`**, **`PortBindings=map[]`** (nessun `-p`), nessun socket Docker, rete bridge predefinita, `--init`. Variabili d'ambiente host: nessuna (solo PATH, NODE_VERSION, YARN_VERSION dell'immagine).
- Il codice e' entrato con `git -c core.autocrlf=false archive --prefix=paperclip/ HEAD` + `docker cp` (176 MB; verificato 0 file CRLF in `package.json`). Il clone Windows non e' stato toccato. Nel container: `git init` locale senza commit.
- Rete in uscita: bridge **non filtrata** per tutta la sessione. Traffico effettivo: pull dell'immagine, registry npm (`pnpm install`, `npx`), `nodejs.org` (header per node-gyp di `cpu-features`). Telemetria di Paperclip: **disabilitata da me** con `PAPERCLIP_TELEMETRY_DISABLED=1` (di default e' abilitata, vedi sotto); non ho osservato il traffico telemetrico con la telemetria accesa.
- Variabili impostate dentro il container (nessun segreto): `PAPERCLIP_TELEMETRY_DISABLED=1`, `PAPERCLIP_RUNNER_BINARY=/bin/true` (vedi 3.3), `SERVE_UI=false`, `PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST=http://127.0.0.1:9099`.

### Versioni e immagini

| Voce | Valore |
|---|---|
| Paperclip (sorgente) | commit `05f7079ecb2ee28d64715fd18e60b43e2d2fa989` (HEAD master 2026-10-20), `/api/health` -> `version 0.3.1`, `commit null` |
| Paperclip (release npm) | `paperclipai@2026.1012.0` (dist-tag latest), `/api/health` -> `commit bba6a45f0d364cfd962ac59b3bdf2426a8222adb` (coincide col tag v2026.1012.0 della scheda) |
| Immagine | `node:24-bookworm` (Debian 12), digest `sha256:14078204b6bb268c107ceff6d3c43f45a888105e5c2b18b14c32b3409d93a1b0` |
| Node / npm / corepack / pnpm / git | v24.22.0 / 11.19.1 / 0.36.0 / 9.15.4 (da `packageManager`, via corepack) / 2.39.5 |
| Toolchain nativa | python3 3.11.2, make, g++ dell'immagine (usati da node-gyp); **nessun `cargo`/rustc** |

## 3. Passi eseguiti, comandi e risultati

### 3.1 Preparazione del container

```bash
export MSYS_NO_PATHCONV=1
docker pull node:24-bookworm && docker tag node:24-bookworm tae-node:24-bookworm
docker create --name tae-paperclip-s00 --label tae=1 --memory 2g --memory-swap 2g --cpus 2 \
  --pids-limit 512 --cap-drop ALL --security-opt no-new-privileges --user node --init \
  -w /home/node --entrypoint sleep tae-node:24-bookworm infinity
docker start tae-paperclip-s00
git -c core.autocrlf=false archive --prefix=paperclip/ HEAD -o <scratchpad>/paperclip-src.tar   # dal clone
tar --force-local -tf C:/...tar   # su Git Bash il path "C:" va con --force-local (altrimenti tar lo legge come host remoto)
docker cp <scratchpad>/paperclip-src.tar tae-paperclip-s00:/tmp/paperclip-src.tar
docker exec tae-paperclip-s00 sh -c 'cd /home/node && tar -xf /tmp/paperclip-src.tar --no-same-owner'
```

L'immagine Node contiene gia' git: nessuna installazione manuale di pacchetti di sistema. Passi manuali di trasporto: usare path in stile `C:/...` (Git Bash per Windows non risolve `/c/...` in `git archive -o`), e `docker cp` lascia `/tmp/paperclip-src.tar` di proprieta' di root (non rimovibile dall'utente `node`; sparisce con il container).

### 3.2 Installazione dipendenze

```bash
mkdir -p ~/bin && corepack enable --install-directory ~/bin     # nessun root: /usr/local/bin non e' scrivibile
export PATH=~/bin:$PATH
pnpm install                                                    # come da README
```

- **Prova 1 (fallita)**: `pnpm install` e' stato terminato con `Killed` (exit 137, 104 s), `OOMKilled=true`, durante la compilazione nativa di `cpu-features` (dipendenza transitiva di `ssh2`) con scaricamento/copia di ~1.300 pacchetti in parallelo. `docker stats` mostrava 1,2-1,9 GiB (incluso page cache). Non ho isolato quale processo abbia fatto sforare il limite: **la causa e' il limite di 2 GiB sommato alla concorrenza di install + compilazione**, non un errore di Paperclip.
- **Prova 2 (OK)**: `pnpm install --child-concurrency=1 --network-concurrency=8` -> `Done in 44.1s` (store gia' caldo dalla prova 1: non e' un cold start), exit 0, picco campionato 1,92 GiB. `node_modules` + store: circa 3,1 GB su disco.
- Script di installazione eseguiti da pnpm 9 (pnpm 9 li esegue di default): `@embedded-postgres/linux-x64 postinstall` (`hydrate-symlinks.js`), `esbuild` x3 (`install.js`), `opencode-ai postinstall` (`postinstall.mjs`, sceglie il binario di piattaforma), `protobufjs postinstall`, `cpu-features`/`ssh2 install` (node-gyp, scarica gli header da nodejs.org), root `postinstall` (`scripts/link-plugin-dev-sdk.mjs`, solo symlink, letto), `server`/`paperclip-runner` `postinstall` (`install-copilot-assets.mjs`, letto: nel sorgente stampa "pending build"). Non ho letto riga per riga tutti i postinstall di terze parti.
- Warning non bloccanti: ~15 `WARN Failed to create bin at .../paperclip-plugin-dev-server ... ENOENT dist/dev-cli.js` (i pacchetti workspace non sono ancora compilati).

### 3.3 Avvio "ufficiale" (README: `pnpm dev`) e perche' non e' bastato

README (quickstart sorgente): `pnpm install` + `pnpm dev` -> "UI e API su http://localhost:3100, Postgres embedded automatico". Nel container:

```bash
PAPERCLIP_TELEMETRY_DISABLED=1 pnpm dev:once      # dev:once = come dev ma senza watch
```

- Passo 1 `[paperclip] dev mode: local_trusted (default)`; `db:migrate` OK (Postgres embedded inizializzato in `~/.paperclip/instances/default/db`); `build:typescript` del runner OK.
- **Fallisce** in `[paperclip] building paperclip runner native binary...` con `sh: 1: cargo: not found`. Il README lo cita **dopo** il quickstart ("Source development also builds the native Paperclip Runner when enabled (the self-hosted default). Install a Rust toolchain, or set `PAPERCLIP_RUNNER_BINARY`"). Non ho installato Rust: l'unico modo ufficiale e' `rustup` via `curl | sh` (vietato senza ispezione) o pacchetti Debian troppo vecchi.
- Aggiramento dichiarato: `PAPERCLIP_RUNNER_BINARY=/bin/true` (un "runner" fittizio, **non compatibile**: serve solo a saltare la build Rust, quindi il runner nativo e' NON verificato). Con questo `pnpm dev:once` costruisce `plugin-sdk` e avvia il server: log `Server listener bound on 127.0.0.1:3100`, poi il **Vite dev middleware** parte (`optimizer scanning dependencies`) e il processo viene **OOM-killed** (`Exit status 137`, `OOMKilled=true`). Quindi il comando documentato (UI in dev mode) **non regge con 2 GiB**.
- Residuo osservato: dopo l'OOM, il Postgres embedded (pid 2856, ppid 1) e' rimasto vivo orfano e il server successivo si e' agganciato a lui. Fermato a mano con `kill -INT`.

### 3.4 Avvio funzionante: server headless

```bash
cd ~/paperclip/server
PAPERCLIP_TELEMETRY_DISABLED=1 PAPERCLIP_RUNNER_BINARY=/bin/true SERVE_UI=false \
PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST=http://127.0.0.1:9099 \
  ./node_modules/.bin/tsx src/index.ts      # equivalente di `pnpm dev:server` (script "dev": "tsx src/index.ts")
```

Banner di avvio (sanificato): `Mode embedded-postgres | headless-api`, `Deploy local_trusted (private)`, `Bind loopback (127.0.0.1)`, `Server 3100`, `UI disabled`, `Database ~/.paperclip/instances/default/db (pg:54329)`, `Agent JWT missing (run npx paperclipai onboard)`, `Heartbeat enabled (30000ms)`, `DB Backup enabled (every 60m, keep 7d)`, `Config ~/.paperclip/instances/default/config.json` (il file **non esiste**: non ho eseguito `onboard`).

`GET /api/health` -> 200: `{"status":"ok","version":"0.3.1","deploymentMode":"local_trusted","deploymentExposure":"private","authReady":true,"bootstrapStatus":"ready", ... "databaseBackup":{"status":"warning", ... "database_backup_missing"}}` (avviso atteso: nessun backup ancora).

### 3.5 API, agente di prova e run senza LLM

Tutto con `curl` dall'interno del container (nessuna porta pubblicata). Webhook di prova: piccolo server `node` in ascolto su `127.0.0.1:9099` che registra le richieste.

| Passo | Comando (sintesi) | Risultato |
|---|---|---|
| Company | `POST /api/companies {"name":"TAE Test Co","budgetMonthlyCents":10000}` senza alcuna autenticazione | 201, `issuePrefix TAE` |
| Agente | `POST /api/companies/:id/agents` con `adapterType:"http"`, `adapterConfig.url=http://127.0.0.1:9099/hook`, `runtimeConfig.heartbeat.enabled=false`, `budgetMonthlyCents:5000` | 201; stato iniziale `paused / lifecycleState verifying` |
| Verifica agente | log: `Agent lifecycle operation failed ... failureCode harness_test_failed`; `POST .../adapters/http/test-environment` -> `HTTP adapter endpoint URL cannot target private or reserved network addresses` | **SSRF guard**: un URL loopback e' rifiutato. Sbloccato con la variabile ufficiale `PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST` (origine esatta); al ritiro automatico (60 s) l'agente passa a `idle / ready` |
| Chiave agente | `POST /api/agents/:id/keys` | 201, token 52 caratteri (mai stampato) |
| Issue | `POST /api/companies/:id/issues {"title":"tae smoke task","assigneeAgentId":...,"status":"todo"}` | 201, `TAE-1`; **l'assegnazione ha acceso da sola un wakeup** |
| Run | `GET /api/companies/:id/heartbeat-runs` | run `succeeded`, `exitCode 0`, ~1,3 s (21:53:56,9 -> 21:53:58,2), token 0, `costStatus unpriced` |
| Webhook | `hook.log` | `HEAD /hook` (probe) e `POST /hook` con payload JSON di ~13 KB (`wakeReason issue_assigned`, nessun header `Authorization`) |
| Esito issue | `GET /api/issues/:id` | `in_progress`; commento dell'agente "HTTP POST ..." aggiunto dal sistema |
| Dopo il run | `/budgets/overview` | **hard stop** su agente e company (`status hard_stop`, `pauseReason budget`) con spesa osservata 0: la policy di default `unpricedUsagePolicy: "block"` scatta perche' l'adapter `http` non riporta costi (`unpricedEventCount 1`). Un run "senza costo" ha messo in pausa company e agente: comportamento fail-closed da conoscere per S09 |

Gli adapter `process` (esegue un comando sull'host) e `claude_local` non sono stati usati: il primo non serve e per il secondo mancano credenziali. L'adapter `http` verso un endpoint locale e' l'adapter di prova disponibile senza LLM.

### 3.6 Test e typecheck (sottoinsieme dichiarato)

La suite completa (`pnpm test` = `scripts/run-vitest-stable.mjs`, ~12.000 file di repo, centinaia di test con Postgres embedded) non e' stata lanciata: non entra nei limiti di RAM/tempo del laboratorio.

| Comando | Risultato | Durata |
|---|---|---|
| `pnpm --filter @paperclipai/shared typecheck` | exit 0 | 3 s |
| `pnpm --filter @paperclipai/adapter-utils typecheck` | exit 0 | 3 s |
| `pnpm exec vitest run packages/shared server/src/adapters/http server/src/__tests__/http-adapter-remote-fetch.test.ts --maxWorkers=1` | **95 file, 1.012 test PASS** | 47 s (picco container ~550 MiB) |
| `vitest run server/src/__tests__/{agent-permissions-routes,agent-permissions-service,budgets-service}.test.ts --maxWorkers=1` | **3 file, 108 test PASS** (usa Postgres embedded) | 57 s (picco campionato 1,56 GiB) |
| `pnpm --filter @paperclipai/server typecheck` | exit 1: `prepare:runner-vendor` richiede `cargo` | 20 s |
| `tsc --noEmit` in `packages/db` (con `NODE_OPTIONS=--max-old-space-size=1700`) | `Killed` (OOM a 2 GiB), 2 prove | 20-104 s |
| `pnpm --filter @paperclipai/ui build` (`vite build`, heap 1,4 GB) | `7968 modules transformed` poi `Killed` | 24 s |

Nota: nessuno dei test esistenti copre "un agente cambia il proprio `budgetMonthlyCents`" (grep in `agent-permissions-routes.test.ts`): copre solo comandi host di workspace e instructions bundle.

### 3.7 Quickstart ufficiale (release npm)

Per verificare il percorso `npx` (versione **diversa** dal commit studiato) con HOME separata:

```bash
export HOME=/home/node/npxhome PAPERCLIP_TELEMETRY_DISABLED=1
npx --yes paperclipai@2026.1012.0 onboard --yes --no-install-service
```

(versione pinned invece di `@latest`, dopo aver letto con `npm view` bin, dipendenze e che il pacchetto non ha script di install propri.) Esito: `Using quickstart defaults: local_trusted/private @ loopback (127.0.0.1):3100`; crea `.env` con `PAPERCLIP_AGENT_JWT_SECRET` e `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET`, `secrets/master.key`, `config.json`; parte da solo (`onboard --yes` avvia il server in primo piano) con `Mode embedded-postgres | static-ui`; `GET / -> 200 text/html`; health OK dopo circa **190-200 s** dalla partenza di `npx` (download npm + compilazione `buildcheck`/node-gyp + avvio); RSS del processo server ~510 MB, container ~1,67 GiB in esercizio. Non ha modificato file di shell (`.bashrc`/`.profile` assenti). SIGTERM -> exit in 1,25 s, Postgres fermato.

### 3.8 Tempi di avvio, shutdown e memoria (sorgente, server headless)

| Misura | Valore |
|---|---|
| Health pronto, DB esistente (3 prove, campionamento 2,5-5,6 s) | 22,4 s, 14,3 s, 20,5 s |
| Shutdown SIGTERM sul processo server | 240 ms, 425 ms (exit 0; Postgres embedded fermato se avviato dal server) |
| Riavvio sullo stesso DB | dati persistiti (company `TAE Test Co` presente), `version 0.3.1` |
| Memoria container a riposo / server attivo | 87-320 MiB / 1,1-1,3 GiB (processo server RSS 825-868 MB + Postgres ~25 MB + page cache) |
| Picchi campionati | install 1,92 GiB; typecheck `db` e `vite build` >= 2 GiB (OOM) |
| Disco | `paperclip/` con `node_modules` ~3,5 GB; `~/.paperclip` 87 MB; HOME npx 2,6 GB |

Il server avviato dal sorgente con `tsx` e' pesante in memoria: con il limite di 1 GB liberi dell'host e' al limite.

## 4. Osservazioni sulla sicurezza (osservate a runtime)

1. **Autenticazione di default (`local_trusted`)**: nessun login, nessun token. `GET /api/auth/get-session` senza credenziali restituisce un utente implicito `local-board` ("Board"); `POST /api/companies`, creazione agenti, chiavi, issue e tutte le mutazioni funzionano senza alcuna credenziale. Chi raggiunge `127.0.0.1:3100` e' operatore completo. Il bearer di un agente e' invece riconosciuto come attore `agent` (`GET /api/agents/me` 200; `POST /api/agents/:id/keys` con chiave agente -> 403 "Board access required").
2. **Cosa espone sulla rete**: `/proc/net/tcp` mostra solo `127.0.0.1:3100` (API/UI) e `127.0.0.1:54329` (Postgres embedded); nessun listener su `0.0.0.0`. Postgres embedded: `pg_hba.conf` con metodo `password` e password fissa `paperclip` (CODE `packages/db/src/migration-runtime.ts:142`), accettabile solo perche' loopback.
3. **Dove scrive**: `~/.paperclip/instances/default/` (`db/` 0700, `secrets/master.key` e `decision-signing.key` 0600, `data/run-logs`, `data/workspace-operation-logs`, backup in `data/backups` ogni 60 min). Con `onboard`: anche `.env` (0600) con segreti JWT e `config.json` (0600). Scratch per run in `/tmp/paperclip-run-<id>-...` (evento `legacy.case_handoff_cleanup_intent`). Nessuna scrittura fuori da HOME e `/tmp`.
4. **Telemetria e update check attivi di default**: `config.json` dopo `onboard` ha `telemetry.enabled: true` e `updates.checkEnabled: true`. Io l'ho spenta con `PAPERCLIP_TELEMETRY_DISABLED=1` (documentato nel README). Non ho misurato cosa invia.
5. **SSRF guard dell'adapter `http`**: bersagli privati/riservati (incluso loopback) rifiutati; consentiti solo se l'origine esatta e' nell'allowlist `PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST`. Buona protezione di default (TESTED).
6. **Budget fail-closed sul costo non prezzato**: vedi 3.5 (company + agente in hard stop dopo un run da 0 centesimi).
7. **Supply chain**: pnpm 9 esegue gli script di installazione di tutte le dipendenze (elenco in 3.2); `cpu-features` compila codice nativo e scarica header da nodejs.org. Dentro il container non privilegiato e senza segreti.
8. **Postgres orfano dopo un OOM-kill** del server (3.3): il DB resta vivo e viene riusato dal server successivo.

### 4.1 Issue #16935 - un agente puo' cambiare il proprio budget e la propria configurazione

Esito: **RIPRODOTTA** (TESTED), con piu' ampiezza di quanto dichiarato. Condizioni: `local_trusted`, adapter `http` (non `claude_local`), agente con chiave API propria. Gli script sono stati eseguiti nel container; il token non e' mai stato stampato.

Setup: agente `tae-http-agent` (engineer, budget 5.000 cent) e agente `tae-peer` (qa, budget 7.000 cent). **Round 2 con i permessi azzerati dal board**: `PATCH /api/agents/<id>/permissions {"canCreateAgents":false,"canAssignTasks":false,"canCreateSkills":false}` -> `permissions {canAssignTasks:false, canCreateAgents:false, canCreateSkills:false}`.

| Richiesta (autenticata con la sola chiave dell'agente) | Risultato |
|---|---|
| `PATCH /api/agents/<self> {"budgetMonthlyCents":99999999}` | **200**; `budgetMonthlyCents` 5000 -> 99999999; activity log: `agent.updated` con `actorType agent`, e `budget.policy_upserted amount 99999999` |
| `PATCH /api/agents/<self> {"adapterConfig":{"dangerouslySkipPermissions":true,"extraArgs":["--tae-marker"]}}` | **200**; `adapterConfig` ora contiene entrambe le chiavi |
| `PATCH /api/agents/<peer> {"budgetMonthlyCents":1}` | **200**; budget del collega 7000 -> 1 |
| `PATCH /api/agents/<peer> {"adapterConfig":{"url":".../peer-hijack"}}` | **200**; url del collega cambiato |
| `POST /api/agents/<self>/keys` (coniare una nuova chiave) | 403 "Board access required" |
| `PATCH /api/agents/<self>/permissions` | 403 "Only CEO can manage permissions" |
| `PATCH /api/companies/<id>` (budget aziendale) | 403 "Only CEO agents can manage company settings" |

Stessa prova ripetuta sulla **release npm 2026.1012.0** (commit bba6a45): auto-PATCH budget 200, auto-PATCH `adapterConfig` 200, PATCH del budget del collega 200 -> riprodotta identica.

Cosa dimostra: nella versione studiata, un agente senza alcun permesso puo' alzare il **proprio** limite di spesa (aggirando il budget, che e' un controllo applicato sulla policy modificata dall'agente stesso), cambiarsi la configurazione e anche modificare budget e configurazione di **altri agenti della stessa company** (il PATCH non e' limitato a se stesso). Restano protetti: coniare chiavi, permessi, impostazioni company.

Limiti della prova (da dichiarare): (a) provato solo con l'adapter `http`, che non ha guardie sui parametri dell'host; per gli adapter `*_local` il codice (CODE `server/src/routes/agents.ts:2601-2659`, `assertNoAgentLocalAdapterHostCommandMutation`) blocca per gli agenti le chiavi `command, hermesCommand, args, extraArgs, cwd, env, filesystemSandboxCommand`, ma non `dangerouslySkipPermissions`: che per `claude_local` l'agente possa spegnere i permessi e che `extraArgs` sia bloccato (a differenza di quanto dice il reporter) e' **CODE, non TESTED**; (b) solo `local_trusted`, non `authenticated`; (c) lettura rapida del codice del PATCH, non audit completo.

## 5. Limiti e riserve

- Un solo host (Windows 11 + Docker 29.2.0), container Linux x64, 2 GiB di RAM: gran parte dei blocchi sono di **memoria**, non difetti accertati. Con >= 4 GiB le build UI/db typecheck potrebbero passare (non provato).
- `n=1` per ogni misura (3 avvii warm sul sorgente, 1 sull'npx). La prima installazione e' fallita per OOM; la seconda e' stata a store caldo, quindi non e' un tempo cold.
- Misure di memoria campionate con `docker stats --no-stream` a intervalli di 6-9 s, includono la page cache.
- Il runner nativo Rust (`paperclip-runnerd`) non e' stato verificato (sostituito da `/bin/true`). Plugin sandbox (E2B, Daytona, K8s...), UI dal sorgente (build bloccata), adapter locali reali, Better Auth / modalita' `authenticated`, sandbox, S06 (crash reale con run in volo), non provati.
- Il test end-to-end del run e' un POST a un webhook locale: dimostra assegnazione -> wakeup -> run -> chiusura/commento, non il comportamento con un agente di codice reale.
- La release npm provata (2026.1012.0) precede il commit studiato; le differenze sono dichiarate dove rilevano.

## 6. Sblocco (cosa serve per completare S00 realmente)

- Host/VM con >= 4-6 GiB di RAM (o limite del container piu' alto) per `pnpm install` stabile, `vite build`, typecheck di `db`/`server` e `pnpm dev` completo.
- Toolchain Rust (`rustup` installato dopo ispezione dello script, o immagine con `cargo`) per `pnpm dev` e per il typecheck/test del server; oppure un `PAPERCLIP_RUNNER_BINARY` compatibile.
- Per adapter reali: credenziali Anthropic con budget massimo (approvazione esplicita).
- Per S07: ripetere #16935 con un agente `claude_local` creato ma mai invocato (o con adapter fittizio) e in modalita' `authenticated`.

## 7. Cleanup verificato

Creato e rimosso (nome esplicito): container `tae-paperclip-s00` (`docker rm -f`). Immagini rimosse per nome: tag locale `tae-node:24-bookworm` e immagine scaricata `node:24-bookworm` (id `sha256:14078204b6bb...`); nessuna immagine `node` esisteva prima. Rimossi dallo scratchpad `paperclip-src.tar` e i tre script `t16935*.sh`. Volumi e reti `tae`: nessuno creato.

Verifiche dopo il cleanup:
- `docker ps -a --filter label=tae=1` -> vuoto; `docker ps -a --filter name=tae-` -> vuoto.
- `docker images | grep -cE "tae-|^node "` -> 0. L'elenco immagini prima/dopo e' **identico** (17 / 17, `diff` vuoto).
- `docker volume ls --filter label=tae=1` e `docker network ls --filter label=tae=1` -> vuoti. Volumi totali 9 -> 9; reti 7 -> 7.
- Container dell'utente: 9 prima, 9 dopo; `segnalibro-db` ancora `Up (healthy)`.
- Modificati solo `docs/candidates/paperclip.md`, `reports/s00-paperclip.md`, `results/s00-paperclip-8301e0b4.json`. Il clone `scratchpad\clones\paperclip` non e' stato toccato.

## 8. Riproduzione e pulizia (comandi esatti)

```bash
export MSYS_NO_PATHCONV=1
SP=C:/Users/brain/AppData/Local/Temp/claude/C--Users-brain-OneDrive-team-agent-evaluation/<sessione>/scratchpad
git -C $SP/clones/paperclip -c core.autocrlf=false archive --prefix=paperclip/ HEAD -o $SP/paperclip-src.tar   # commit 05f7079e...
docker pull node:24-bookworm && docker tag node:24-bookworm tae-node:24-bookworm
docker create --name tae-paperclip-s00 --label tae=1 --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512 \
  --cap-drop ALL --security-opt no-new-privileges --user node --init -w /home/node --entrypoint sleep tae-node:24-bookworm infinity
docker start tae-paperclip-s00 && docker cp $SP/paperclip-src.tar tae-paperclip-s00:/tmp/
docker exec tae-paperclip-s00 sh -c 'cd /home/node && tar -xf /tmp/paperclip-src.tar --no-same-owner && cd paperclip \
  && git init -q . && mkdir -p ~/bin && corepack enable --install-directory ~/bin && PATH=~/bin:$PATH \
  pnpm install --child-concurrency=1 --network-concurrency=8'
# server headless (dal sorgente)
docker exec -d tae-paperclip-s00 sh -c 'cd /home/node/paperclip/server && PAPERCLIP_TELEMETRY_DISABLED=1 \
  PAPERCLIP_RUNNER_BINARY=/bin/true SERVE_UI=false ./node_modules/.bin/tsx src/index.ts > /home/node/server.log 2>&1'
docker exec tae-paperclip-s00 curl -s http://127.0.0.1:3100/api/health
# pulizia (solo nomi tae-)
docker rm -f tae-paperclip-s00
docker rmi tae-node:24-bookworm node:24-bookworm
docker ps -a --filter label=tae=1        # deve essere vuoto
```
