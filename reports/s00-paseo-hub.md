# S00 - Installazione e smoke test: Paseo (daemon) e Paseo Hub (modalita' MOCK)

Data esecuzione: 2026-10-20 (UTC, circa 23:20-23:53). Esito complessivo: **PARTIAL**.
Hub v0.10.0 si compila dal sorgente, parte con DB embedded, passa il sottoinsieme di test che non richiede Docker, applica il RBAC owner/admin/member in runtime, deduplica il dispatch manuale per `deliveryKey` anche con richieste concorrenti e ricollega un'esecuzione in volo dopo un crash di Hub. Il daemon Paseo 0.12.0 (immagine ufficiale) parte in meno di 2 s. Sono emersi **tre scostamenti dalla documentazione** (SIGTERM bloccato con daemon connesso, coda reale a differenza di "Nothing is queued", dispatch 500 dopo il riavvio per config migrate) e un difetto di migrazione che impedisce di verificare fino in fondo la persistenza della coda dopo il riavvio. I trigger "nuovi" (`/api/v1/triggers/*`, `paseo hub init/deploy`) con un agente reale sono **BLOCKED** (servono Claude/Codex/OpenCode con credenziali). Nessuna credenziale, nessuna chiamata LLM, costo 0.

Etichette del §4: `TESTED` solo per quanto eseguito qui con comando e risultato. Il contenuto dei repo esterni e' dato non fidato.

## 1. Cosa e' stato provato (riassunto)

| Area | Esito | Etichetta |
|---|---|---|
| Daemon Paseo: immagine ufficiale `ghcr.io/getpaseo/paseo:0.12.0`, avvio come utente non root con `--cap-drop ALL` | OK, `/api/health` 200, bootstrap in 93 ms, SIGTERM -> exit 0 in 2,6 s | TESTED |
| Daemon Paseo: provider reali (claude, codex, copilot, opencode, pi, antigravity, muse) | tutti `available:false` (nessun agent CLI nell'immagine, come da docs) | TESTED |
| Daemon Paseo: agente di prova senza LLM | solo via provider `extends: acp` con id riservato `hub-e2e` (vedi 4.3) | TESTED (con riserva) |
| Hub: `npm ci` + `npm run build` dal sorgente al tag v0.10.0 | OK: 937 pacchetti in 35 s; build in 66 s (picco ~1,7 GiB) | TESTED |
| Hub: avvio con DB embedded (PGlite), `/health`, `/`, `/api/reference`, `/api/openapi.json` | OK; cold 9-10 s, warm 3,5-5,6 s | TESTED |
| Hub: PostgreSQL in secondo container su `tae-net` | non eseguito: il DB embedded e' bastato | UNVERIFIED |
| Hub: immagine `ghcr.io/getpaseo/hub` / `docker compose up` / `npx @getpaseo/hub` | non eseguiti (compilato dal sorgente) | UNVERIFIED |
| Test del repo Hub (sottoinsieme, vedi 3.4) | 149 file / 1.079 test PASS; 3 file / 108 test falliti per assenza di Docker (testcontainers) | TESTED (subset) |
| RBAC owner/admin/member in runtime (HTTP) | applicato come da codice (vedi 5.1) | TESTED |
| Dispatch manuale con `deliveryKey` ripetuto (sequenziale e 6 richieste concorrenti) | 1 sola esecuzione dell'agente; stessa ricevuta e stesso `triggerRunId` | TESTED |
| Daemon collegato a Hub, `hub.execute` assente di default | collegato con permessi vuoti; senza permesso il daemon non e' un target valido | TESTED |
| SIGTERM a Hub con daemon connesso (#147) | **RIPRODOTTA**: Hub non termina (>= 90 s); termina 2,3 s dopo lo stop del daemon | TESTED |
| Recupero dopo crash di Hub con run in volo (SIGKILL) | agente sopravvissuto, daemon riconnesso in ~2 s, nessun secondo agente, `finish_execution` accettato (200) | TESTED |
| Coda con daemon offline ("Nothing is queued" vs scheduled-triggers.md 117-119) | l'evento viene **accodato** ed eseguito al ritorno del daemon; scade con `timed_out` oltre `max_runtime` | TESTED |
| Coda con daemon offline attraverso un riavvio di Hub | l'esecuzione **non parte** (errore `workflow.wakeup.process`); confuso dal difetto di migrazione (sez. 5.5) | TESTED (fallimento, causa non isolata) |
| Dispatch manuale dopo il riavvio di Hub | **HTTP 500** per qualunque chiave, con provider `hub-e2e` e con `claude` | TESTED |
| Trigger "nuovi" (`/api/v1/triggers/*`) con agente reale, `paseo hub init`/`deploy` | rifiutati: provider non disponibile / ammessi solo Claude, Codex, OpenCode | BLOCKED |
| Login CLI con approvazione nel browser (`paseo hub login`) | non provato: l'approvazione e' una server function della UI | UNVERIFIED |
| UI dashboard nel browser | non provata (nessuna porta pubblicata; nessun browser nel container) | UNVERIFIED |
| Windows nativo | non provato | UNVERIFIED |

## 2. Ambiente e isolamento

- Host: Windows 11, Docker Engine 29.2.0, Git Bash con `MSYS_NO_PATHCONV=1`. RAM libera dell'host all'inizio ~1,5 GB (16 GB totali).
- **Un solo container alla volta**: prima `tae-paseo-s00` (daemon ufficiale, in esecuzione di default), poi `tae-hub-s00` (Hub + daemon nello stesso container, per rispettare "un container alla volta"). Etichetta `tae=1` su container e volume. Il secondo container Postgres e la rete `tae-net` **non sono stati creati**.
- `docker inspect` di `tae-hub-s00`: `Memory=2147483648`, `MemorySwap=2147483648`, `NanoCpus=2000000000`, `PidsLimit=512`, `CapDrop=[ALL]`, `SecurityOpt=[no-new-privileges]`, `User=1000:1000`, `Privileged=false`, `PortBindings=map[]`, rete bridge predefinita, `--init`, `OOMKilled=false`. Unico mount: il volume nominato `tae-hub-home` (label `tae=1`) su `/home/paseo`. Nessun socket Docker, nessuna cartella dell'host, nessuna variabile d'ambiente dell'host (solo quelle dell'immagine).
- Codice entrato con `git -c core.autocrlf=false archive` + `docker cp` (Hub: 13 MB; Paseo non e' stato copiato, e' bastata l'immagine ufficiale). Verificato 0 file CRLF in `package.json`.
- Tutte le verifiche HTTP sono state fatte dall'interno con `docker exec` (script Node con `fetch`); nessuna porta pubblicata.
- **Rete in uscita non filtrata** (bridge). Traffico effettivo osservato: pull dell'immagine da ghcr.io, registry npm (`npm ci`), e, dal solo daemon ufficiale al primo avvio, download dei modelli vocali da GitHub (vedi 4.2). Non ho misurato altro traffico (nessuna telemetria dichiarata nei docs).
- Il **volume anonimo**: l'immagine `ghcr.io/getpaseo/paseo` dichiara `VOLUME /home/paseo`; il primo container (`docker run` senza `-v`) ha creato un volume anonimo, rimosso con `docker rm -f -v`. Per il secondo container ho usato un volume nominato `tae-hub-home` con label.
- Credenziali di prova (non segreti): owner `owner@tae.invalid`, password bootstrap temporanea, utenti `admin@tae.invalid`/`member@tae.invalid`. API key generate dal Hub dentro il container, mai stampate (nei log appaiono come `paseo_pk_***`).

### Versioni e immagini

| Voce | Valore |
|---|---|
| Hub | tag `v0.10.0`; **il tag e' annotato**: l'oggetto tag e' `38bfafd11858c06e1456c96bb17f5867a12d7075`, il **commit** e' `28f6c78833065fd282f9064f92a9aa61875dd359` (il clone non lo conteneva: `git fetch --depth 1 origin tag v0.10.0`) |
| Hub, HEAD main letto in scheda | `7cbdd52...` (package.json 0.10.0): 98 file diversi dal tag; non e' stato testato |
| Paseo (daemon) | immagine `ghcr.io/getpaseo/paseo:0.12.0`, digest `sha256:0d17dd75a51c591907a4bbcd505013102048246a0cd6e824de3b38a6057ff862` (amd64), 315 MB; `paseo --version` 0.12.0; il sorgente v0.12.0 (commit `cafe4b01c8522ff39560241c5deb01427dc8dc5b`) e' stato solo letto |
| Runtime nell'immagine | Node v22.23.3, npm 10.9.9, git 2.39.5 (Debian bookworm-slim) |
| Rilevamento errori della scheda | l'SHA del tag `v0.12.0` nella tabella della scheda era troncato (39 caratteri): corretto in `d288bcfc840ffba71aa8565ee05184d9fce0a592` |

## 3. Passi eseguiti, comandi e risultati

### 3.1 Daemon Paseo (immagine ufficiale)

```bash
export MSYS_NO_PATHCONV=1
docker pull ghcr.io/getpaseo/paseo:0.12.0 && docker tag ghcr.io/getpaseo/paseo:0.12.0 tae-paseo:0.12.0   # 19 s
docker run -d --name tae-paseo-s00 --label tae=1 --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512 \
  --cap-drop ALL --security-opt no-new-privileges --user 1000:1000 tae-paseo:0.12.0
```

- L'entrypoint dell'immagine parte come root per `chown`/`gosu`; con `--cap-drop ALL` e `--user 1000:1000` salta quei rami (verificato dal codice dell'entrypoint) e funziona, **ma la doc dice di lasciare l'utente root nel child image**: questo e' un uso non documentato.
- Log: `Server listening on http://0.0.0.0:6767` dopo 93 ms dal bootstrap; `GET /api/health` -> `200 {"status":"ok",...}`. Avviso a log: `PASEO_PASSWORD is not set ... accepts unauthenticated control connections from any client that can reach it` (autenticazione assente di default).
- `paseo daemon status`: tutti i provider `available:false`; relay disabilitato; `listen 0.0.0.0:6767` (la config persistente dice 127.0.0.1: l'override d'ambiente dell'immagine vince).
- Memoria: 339-376 MiB (con CPU a tratti ~120-200% nei primi minuti, per il download dei modelli).
- `docker stop -t 30`: **2,6 s**, exit 0, `OOMKilled=false`. Riavvio: stesso `serverId` (persistenza del volume).

### 3.2 Hub: installazione e avvio

```bash
docker volume create --label tae=1 tae-hub-home
docker create --name tae-hub-s00 --label tae=1 --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512 \
  --cap-drop ALL --security-opt no-new-privileges --user 1000:1000 --init -v tae-hub-home:/home/paseo \
  -w /home/paseo --entrypoint sleep tae-paseo:0.12.0 infinity
docker start tae-hub-s00
git -c core.autocrlf=false archive --prefix=hub/ -o <scratchpad>/hub-src.tar 28f6c78833065fd282f9064f92a9aa61875dd359
docker cp <scratchpad>/hub-src.tar tae-hub-s00:/home/paseo/ && docker exec tae-hub-s00 sh -c 'cd /home/paseo && tar -xf hub-src.tar --no-same-owner'
docker exec tae-hub-s00 sh -c 'cd /home/paseo/hub && NODE_OPTIONS=--max-old-space-size=1400 npm ci --no-audit --no-fund --maxsockets=4'   # 35 s
docker exec tae-hub-s00 sh -c 'cd /home/paseo/hub && NODE_OPTIONS=--max-old-space-size=1400 npm run build'                               # 66 s
```

- Ho riusato l'immagine del daemon (Node 22 bookworm-slim, stessa base del `Dockerfile` di Hub `node:22-slim`) per non scaricare un'altra immagine.
- `npm ci`: 937 pacchetti, 772 MB di `node_modules`; solo warning di deprecazione. Non e' servita concorrenza ridotta (a differenza di Paperclip): picco container ~290 MiB. `npm run build` (tsgo + vite build): picco ~1,7 GiB, entro il limite.
- Avvio, dalla directory del Hub (equivalente di `npm start` = `node dist/index.js`):

```bash
PORT=3000 PASEO_HUB_APP_URL=http://localhost:3000 PASEO_HUB_DATA_DIR=/home/paseo/hub-data \
PASEO_BOOTSTRAP_ORGANIZATION="TAE Org" PASEO_BOOTSTRAP_OWNER_EMAIL=owner@tae.invalid \
PASEO_BOOTSTRAP_OWNER_PASSWORD=<temporanea> nohup node dist/index.js >> hub.log 2>&1 &
```

- Log: `database runtime ready: embedded (...)`, `server started, available at: http://localhost:3000`.
- Tempi dall'avvio del processo al primo `/health` 200: **9,8 s e 9,0 s (DB nuovo, cold)**; **3,5-5,6 s (DB esistente, n = 8)**. `/health` -> `{"ok":true}`. `/` 200 HTML, `/api/reference` 200 HTML, `/api/openapi.json` 200 (11 percorsi), `/api/billing/plans` 404 (senza Stripe, come da docs).
- Rete: Hub ascolta su **`0.0.0.0:3000`** (default `PASEO_HUB_BIND=0.0.0.0`); il daemon su `127.0.0.1:6767`. Nel container non pubblicato e' innocuo, ma per un'installazione reale il default e' tutto-interfacce.
- Risorse: RSS del processo Hub ~590 MB; container 0,9-1,0 GiB (inclusa la cache) con Hub + daemon a riposo; DB embedded 43 MB; `hub/` con `node_modules` 802 MB.
- Warning rumorosi: ~31 `WARN http.response failed` (sono le mie richieste 4xx volute) e stack lunghi per i fallimenti di dispatch; il livello di log e' verboso ma leggibile.
- Passo manuale non documentato nella quick start: dopo il bootstrap l'owner ha `mustChangePassword`; `GET /api/auth/paseo/state` risponde `appSetupRequired` finche' l'operatore non completa la configurazione guidata nel browser (i comandi di gestione funzionano comunque).

### 3.3 Daemon di prova collegato a Hub

Config del daemon (home separata, `PASEO_HOME=/home/paseo/dhome`): relay disabilitato, MCP del daemon disattivato, **dettatura e voce disattivate** (`features.dictation/voiceMode.enabled=false`, vedi 4.2), un provider ACP finto:

```json
"agents": {"providers": {"hub-e2e": {"extends": "acp", "label": "TAE mock (no LLM)",
  "command": ["node", "/home/paseo/mock-acp-agent.mjs"], "env": {"TAE_ACP_SDK": "<.../@agentclientprotocol/sdk/dist/acp.js>"}}}}
```

`mock-acp-agent.mjs` (scritto da me, nessun LLM, nessuna rete): registra ogni prompt in un file, poi chiama il tool MCP `finish_execution` del Hub; se il prompt contiene `HOLD` resta in attesa di un file `gate`.

```bash
paseo daemon start --home /home/paseo/dhome                       # 3,8 s
PASEO_HUB_API_KEY=<key> paseo hub connect http://localhost:3000   # 1,1 s; stato: PERMISSIONS vuoto
paseo hub permissions grant hub.execute                           # oppure: paseo hub connect ... --permission hub.execute
```

- `paseo hub status`: `connected`, `PERMISSIONS` vuoto dopo `connect` (nessun `hub.execute` di default: TESTED).
- Prima del grant, `POST /api/v1/triggers/validate` -> 422 `"<slug>" does not match any daemon (connected: none)`: il daemon senza `hub.execute` non e' un target valido (TESTED).
- Dopo il grant, lo stesso trigger con provider `tae-mock` -> 422 `Provider 'tae-mock' cannot run unattended Hub automations; select Claude, Codex, or OpenCode`. Con `provider: claude` -> 422 `Provider 'claude' is not available` (nessun agent CLI). **I trigger nuovi non sono provabili senza un agente reale** (BLOCKED).
- L'endpoint **legacy** `POST /api/v1/configurations/install` accetta invece qualunque provider (anche `claude` non disponibile). Per questo i test di dispatch sono stati fatti con il bundle legacy (`.paseo/hub.yml` + `.paseo/workflows/*.yml`, `on: manual.run`, `filters.from_users: [tae-operator]`). Il dispatch di un provider `tae-mock` fallisce a creazione agente lato daemon (`Provider 'tae-mock' cannot preapprove exact MCP tools`): vedi 4.3.

### 3.4 Test del repo Hub (sottoinsieme dichiarato)

| Comando | Esito | Durata |
|---|---|---|
| `npx vitest run --exclude "**/*.integration.test.ts" --exclude "e2e/**" --maxWorkers=1` | 156 file: **149 pass**, 4 skipped, **3 falliti**; 1.208 test: 1.079 pass, 21 skip, **108 falliti** | 39 s |
| `vitest run` su 5 file `*embedded*` (`migration.embedded`, `index.embedded`, `db/runtime/embedded.smoke`, `embedded-persistence`, `instance-setup/embedded`) | 5 file, **17 test PASS** | 94 s |
| `node --test scripts/release-metadata.node-test.mjs scripts/paseo-workspace.node-test.mjs` | 13 pass, 0 fail | < 1 s |

I 3 file falliti (`src/daemons/daemons.test.ts`, `src/index.bootstrap.test.ts`, `src/triggers/manual/manual-run.test.ts`) falliscono tutti con `Could not find a working container runtime strategy`: usano `@testcontainers/postgresql` e richiedono un daemon Docker, che il vincolo di sicurezza esclude (nessun socket nel container). Sono fallimenti **ambientali**, non difetti accertati. Non eseguiti: gli altri `*.integration.test.ts` (richiedono Postgres in Docker), `test:e2e:*` (richiedono un worktree Paseo da compilare e, per `real-agent`, un agente reale), `lint`/`typecheck`/`format:check` (non lanciati).

## 4. Osservazioni sul daemon Paseo

### 4.1 Installazione e avvio base
Vedi 3.1. L'immagine non contiene agent CLI, quindi senza credenziali e senza un child image il daemon non puo' eseguire agenti: S00 per il daemon e' limitato a start/health/shutdown (TESTED) e collegamento a Hub (TESTED); esecuzioni con agenti reali BLOCKED.

### 4.2 Download dei modelli vocali al primo avvio (non documentato come tale)
Al primo avvio il daemon scarica **in background ~814 MB** di modelli vocali locali (`parakeet-tdt-0.6b-v2-int8`, `kokoro-en-v0_19`) da `github.com/k2-fsa/sherpa-onnx/releases` (CODE: `packages/server/.../sherpa/model-catalog.ts`), anche se la voce non viene usata. Il comando di arresto ha interrotto un download (`AbortError` nei log). Si disattiva con `features.dictation.enabled=false` e `features.voiceMode.enabled=false` nel `config.json` (o `PASEO_DICTATION_ENABLED=false`, `PASEO_VOICE_MODE_ENABLED=false`). Il Hub e il daemon del test combinato li avevano disattivati. Implicazione: l'installazione "di default" del daemon scrive ~0,8 GB e genera traffico verso GitHub non necessario per un worker headless.

### 4.3 Provider di prova e limite del daemon 0.12.0
Per eseguire qualcosa senza LLM serve un provider che dichiari il supporto alla pre-approvazione esatta dei tool MCP (richiesta da Hub). Nel daemon 0.12.0 hanno questo contratto solo `claude`, `codex`, `opencode` e **un id riservato `hub-e2e`** (CODE: `packages/server/src/server/agent/provider-registry.ts`, `HUB_E2E_PROVIDER_ID`, commento "The cross-repository Hub harness owns this synthetic provider ID"). Ho usato `hub-e2e` come **hook di test** del daemon: con `extends: "acp"` qualunque id diverso viene rifiutato. Questo significa che i miei run MOCK passano per il percorso di produzione del registro, ma con un provider che non esiste in una installazione reale; non dimostrano comportamento con Claude/Codex/OpenCode.

## 5. Osservazioni su Hub (runtime)

### 5.1 RBAC owner / admin / member (TESTED)
Tutte le richieste sono HTTP verso `/api/auth/*` e `/api/auth/paseo/*` con cookie di sessione (script Node dentro il container). Ruoli da `src/auth/organization-contract.ts`; capability da `organization-policy.ts` (owner: view+manageMembers+manageOwners+manageResources; admin: senza manageOwners; member: solo view).

Flusso: sign-in dell'owner bootstrap -> cambio password -> inviti `admin` e `member` (201) -> `sign-up` **senza** invito: 403 `registration_closed` (`invite_only`); `sign-up` con invito + `accept-invitation` (200) -> stato `active`, `role` e `capabilities` come attesi.

| Azione | member | admin | owner |
|---|---|---|---|
| `GET api-keys` | **403** forbidden | 200 | 200 |
| `POST api-keys` (5 scope) | **403** | 201 | 201 |
| `POST create-invitation` | **403** | 201 | 201 |
| `change-member-role` se stesso -> owner | **403** | **403** | n/a |
| `change-member-role` altro owner -> member | n/a | **403** | `409 last_owner_required` (ultimo owner) |
| `remove-member` (owner / admin) | **403** | **403** (owner) | `409 last_owner_required` (ultimo owner) |
| `change-member-role` member -> admin (altro utente) | non provato | **200** | non provato |
| Chiave API con scope sbagliato: `POST daemons/enrollment-tokens` con chiave `projects:read` | - | - | **403** `insufficient-scope` |
| Chiave API inventata / assente | 401 `unauthorized` | | |
| Scope inesistente in creazione chiave | - | - | 400 `invalid_api_key_scopes` |

Un `member` non puo' quindi fare nessuna operazione amministrativa provata (chiavi API, inviti, cambio ruoli, rimozione). Un `admin` puo' gestire risorse e inviti e promuovere un member ad admin (previsto dal codice), ma non toccare gli owner. **Limiti**: non provati i cookie cross-site (CSRF) ne' i percorsi del dashboard (server function: ad es. approvazione login CLI, riservata a owner/admin per CODE/DOC); nessun RBAC per progetto/ruolo di agente (come da scheda: UNVERIFIED -> nessuna evidenza di esistenza).

### 5.2 Dispatch manuale e idempotenza (TESTED)
`POST /api/v1/manual-runs` con `{projectSlug, trigger, actor, deliveryKey, input}`, `actor` ammesso da `filters.from_users`. Contatore: righe `"prompt"` nel file dell'agente finto.

| Prova | Risultato |
|---|---|
| Stessa `deliveryKey` due volte (a 1,5 s) | 200 + 200; stessa `providerEventReceiptId` e stesso `triggerRunId`; la seconda risposta riporta lo stato corrente (`running` -> `succeeded`); **1 sola esecuzione dell'agente** |
| **6 richieste concorrenti** con la stessa chiave | tutte 200, **1 solo `triggerRunId`**, 1 sola esecuzione |
| 2 chiavi diverse (stesso input) | 2 `triggerRunId` distinti, 2 esecuzioni |
| Chiave gia' usata per un run **fallito** (daemon senza provider ammesso) | stessa ricevuta, stato `failed`, nessuna riesecuzione: per riprovare serve una **nuova** chiave |
| `actor` non in allowlist / trigger inesistente / `deliveryKey` mancante | 403 / 404 / 400 |

Differenza dalla doc: `docs/public-api.md` dice che Hub "non promette il replay della risposta"; qui la risposta e' stata riprodotta (stessi id) per tutte le ripetizioni provate. Nessun test su un riavvio in mezzo (vedi 5.5).

### 5.3 Shutdown con SIGTERM e segnalazione #147 (TESTED: riprodotta)
Daemon connesso e un run HOLD in volo:

| Prova | Risultato |
|---|---|
| `kill -TERM` al processo Hub (`node dist/index.js`) con daemon connesso | il listener si chiude (nuove connessioni -> `ECONNREFUSED`) ma il **processo resta vivo**: ancora vivo dopo 30 s e dopo ~90 s; il daemon continua a mostrare `connected` |
| Stop del daemon | Hub termina **2,3 s** dopo (si chiude il WebSocket) |
| Secondo `kill -TERM` | termina in 109 ms (il gestore e' `process.once`, il secondo segnale prende l'azione di default: **non e' uno shutdown pulito**) |
| `SIGINT` con daemon connesso | stesso blocco (ancora vivo dopo 10 s) |
| `SIGTERM` con daemon assente | termina in 818 ms |

Causa (CODE, `src/index.ts` righe 328-351 al tag): `stop()` attende `server.close(cb)` che non scatta finche' restano connessioni aperte (il WebSocket del daemon dopo l'upgrade); non c'e' timeout ne' chiusura forzata. In produzione (orchestratore che invia SIGTERM e poi SIGKILL dopo 10-30 s) il risultato e' una chiusura brusca; con systemd/Docker senza SIGKILL il processo resta appeso.

### 5.4 Recupero dopo crash con run in volo (TESTED)
Un run `tae-hold` (agente in attesa del file `gate`), poi `kill -KILL` del processo Hub, riavvio, rilascio del gate:

| Passo | Risultato |
|---|---|
| Hub SIGKILL (crash simulato) | l'agente (processo del daemon) resta vivo; il daemon mostra `reconnecting` |
| Riavvio Hub | `/health` in 3,9 s; daemon riconnesso dopo ~2 s |
| Esecuzioni dopo il riavvio | **nessun secondo agente** (contatore invariato) |
| Rilascio del gate | l'agente chiama `finish_execution` sul vecchio URL MCP con le vecchie credenziali: **HTTP 200** `Execution finished` (le credenziali dell'esecuzione sono state recuperate dal DB) |
| Agente dopo la fine | `idle` poi `closed` entro ~2 minuti (come negli altri run) |

Limiti: il giudizio e' sul **lato agente** (200 da MCP) e sul comportamento del daemon; lo **stato finale del run** non e' leggibile via API dopo il riavvio (il dispatch risponde 500, vedi 5.5). La ripresa della **sessione conversazionale** non e' stata provata (l'agente finto non ha conversazione). Nella prova della sez. 5.3, dove invece ho fermato il **daemon** (`paseo daemon stop`) con un run HOLD in volo e poi riavviato Hub e daemon, l'agente non e' stato ripreso: dopo il riavvio il contatore dei prompt e' rimasto invariato e Hub ha registrato un `interrupt` non consegnato (`daemon.execution.hub-action failed`). Che l'agente sia morto con il daemon e' dedotto (l'agente e' un figlio del daemon), non verificato direttamente.

### 5.5 Coda degli eventi e contraddizione della scheda (TESTED)
Scheda: "Nothing is queued" (hub/activity.md, faq.md, daemons.md) contro docs/scheduled-triggers.md righe 117-119 ("workflow work remains queued ... bounded by the maximum runtime"). Prova con `on: manual.run`, daemon fermato con `paseo daemon stop` e atteso 3 s:

| Prova | Risultato |
|---|---|
| Dispatch con daemon offline | **HTTP 200** `workflowStatus: running` (la doc di `api.md` dice 409 se il daemon e' offline; la doc di `daemons.md` dice fallimento `daemon_not_connected`): non osservati |
| Dopo 30 s offline | nessuna esecuzione (contatore 0), stato `running` |
| Daemon di nuovo online (+12 s) | l'esecuzione parte e finisce (`succeeded`), una sola volta |
| Workflow con `max_runtime: 1m`, daemon offline > 60 s | stato `timed_out`; **non** eseguita al ritorno del daemon (contatore invariato) |
| Stessi 2 passi **attraverso un riavvio di Hub** (SIGTERM con daemon assente, riavvio, daemon di ritorno) | **non esegue**: log `ERROR workflow.wakeup.process failed` (`agent execution insert returned no row`) |

Quindi `scheduled-triggers.md` descrive correttamente il comportamento per `manual.run` (coda reale, limitata da `max_runtime`), e la frase "Nothing is queued" e' **smentita** per questa sorgente; le frasi di `api.md`/`daemons.md` sul 409 e su `daemon_not_connected` non sono riprodotte. Altre sorgenti (GitHub, Slack, Discord) non provate. La coda **sopravvive a un riavvio di Hub: NO**, ma la prova e' confusa dal difetto seguente.

### 5.6 Migrazione automatica al riavvio e dispatch 500 (TESTED, causa parziale)
All'avvio Hub 0.10.0 esegue `migrateLegacyProjectTriggers`: ogni progetto con configurazione legacy (installata via `/api/v1/configurations/install`, che e' ancora una API pubblica documentata) viene convertito in trigger di organizzazione e il progetto legacy viene ritirato (log `migrated project configurations to organization triggers`). **Dopo il primo riavvio:**
- `POST /api/v1/manual-runs` risponde **500 `internal_error`** per qualunque `deliveryKey`, provider `hub-e2e` e provider `claude` (provato entrambi, per escludere l'effetto del provider di prova);
- `POST /api/v1/configurations/*` con `projectSlug: default` -> 404 (`project-not-found`); senza `projectSlug` reinstalla ("restaura" `default`), ma il dispatch resta 500 perche' i trigger migrati hanno lo stesso nome.
- Log: `public-api.dispatchManualRun failed`, stack `toProjectConfiguration` -> `ProjectConfigurationStore.getRevision`; il codice di `toProjectConfiguration` lancia `active configuration contains an uncompiled daemon reference` se `environment.daemonId` e' assente. Il convertitore (`legacy-migration.ts`) ricompila l'ambiente con `compileTriggerDocument` partendo dallo slug del daemon, senza risolvere il `daemonId`. **Ipotesi (CODE + sintomo TESTED, non confermata da un test mirato)**: le config legacy con daemon migrate al riavvio non hanno `daemonId` e il dispatch manuale non e' piu' utilizzabile finche' non si re-installa un trigger nuovo (cosa non possibile qui senza agente reale). Non ho verificato se `main` (7cbdd52) lo corregga.
- Conseguenza pratica per S00: chi installa la config con la API legacy e poi riavvia Hub perde il dispatch manuale; chi usa i trigger nuovi (`paseo hub deploy`) non e' toccato (non provabile qui).

## 6. Tempi e memoria (n = 1 salvo diversa indicazione)

| Misura | Valore |
|---|---|
| Pull immagine daemon | 19 s (315 MB) |
| Daemon (immagine ufficiale), prontezza `/api/health` | < 2 s dall'avvio del container; bootstrap 93 ms |
| `paseo daemon start` (CLI, home separata) | 3,8 s |
| `paseo hub connect` | 1,1 s; riconnessione dopo riavvio Hub 1-2 s |
| `npm ci` Hub | 35 s (picco ~290 MiB) |
| `npm run build` Hub | 66 s (picco ~1,7 GiB incl. cache) |
| Hub cold start (DB nuovo) | 9,8 s; 9,0 s (n = 2) |
| Hub warm start | 3,5; 3,9; 4,2; 4,3; 4,3; 4,4; 4,5; 5,6 s (n = 8) |
| SIGTERM con daemon assente | 818 ms; con daemon connesso: **non termina** |
| Memoria container, Hub + daemon a riposo | 0,9-1,0 GiB (RSS Hub ~590 MB) |
| Memoria daemon ufficiale a riposo | 340-376 MiB |
| Disco | Hub `node_modules` 775 MB; `hub-data` 43 MB; modelli vocali ~814 MB |

Misure con `docker stats --no-stream` (includono la page cache). Nessun OOM.

## 7. Limiti e riserve

- Un solo host (Windows 11 + Docker 29.2.0), un solo container Linux x64 da 2 GiB. `n = 1` per i test funzionali (idempotenza concorrente n = 6, avvii warm n = 8). Il primo tempo cold (9,8 s) include circa 1 s di `docker cp`/`docker exec`; gli altri solo qualche decina di ms.
- Hub e daemon nello stesso container: la rete tra daemon e Hub e' `localhost`; non e' stato provato il collegamento tra container su `tae-net` (non creata).
- Mock del provider (`hub-e2e`) e bundle **legacy**: sono la sola combinazione che permette un run senza LLM con il daemon 0.12.0 + Hub 0.10.0. Non e' il percorso di prodotto raccomandato (trigger nuovi con Claude/Codex/OpenCode): quello e' BLOCKED.
- PostgreSQL non provato (UNVERIFIED): comportamento di migrazione, locking e shutdown con Postgres potrebbero differire. Nessuna prova della UI dashboard (nessun browser nel container) ne' del login CLI con approvazione.
- L'agente finto non dimostra capacita' di coding; la prova di recupero sul lato agente non dimostra ripresa della sessione conversazionale.
- Fallimenti dei test: ambientali (Docker) e non diagnosticati ulteriormente.

## 8. Sblocco (cosa serve per completare S00 realmente)

- Per i trigger nuovi e `paseo hub init/deploy`: un child image del daemon con `claude`/`codex`/`opencode` e credenziali di prova (approvazione esplicita e budget), oppure un agent CLI di test compatibile.
- Per la coda attraverso il riavvio e per il dispatch dopo il riavvio: ripetere con trigger nuovi (non migrati) e, se serve, con `main` dopo il fix.
- Per PostgreSQL: secondo container `postgres:17-alpine` su `tae-net` con `DATABASE_URL`, stessi test di 5.2-5.5.
- Per la UI e il login CLI: un browser raggiungibile dal container (richiede porta locale o un container browser: non ammessi qui).

## 9. Cleanup verificato

Creati e rimossi per nome esplicito: container `tae-paseo-s00` (`docker rm -f -v`, che ha rimosso il volume anonimo), container `tae-hub-s00` (`docker rm -f`), volume `tae-hub-home` (`docker volume rm`), immagini `tae-paseo:0.12.0` e `ghcr.io/getpaseo/paseo:0.12.0` (`docker rmi`, digest `sha256:0d17dd75...`). Nessuna rete `tae-net` creata. Nessun'altra immagine era stata scaricata. Rimossi dallo scratchpad i tar e gli estratti dei sorgenti.

Verifiche dopo il cleanup (confronto con l'elenco registrato all'inizio):
- `docker ps -a --filter label=tae=1` e `--filter name=tae-` -> vuoti; `docker volume ls --filter label=tae=1`, `docker network ls --filter label=tae=1` -> vuoti.
- Elenco immagini prima/dopo **identico** (17/17, `diff` vuoto); container 9/9, volumi 9/9, reti 7/7 identici. `segnalibro-db` ancora `Up (healthy)`.
- Effetti collaterali fuori dal Docker, nel solo scratchpad: `git fetch --depth 1 origin tag v0.10.0` e `tag v0.12.0` nei due cloni shallow (aggiungono un tag e un commit ciascuno).
- Modificati solo: `docs/candidates/paseo-hub.md`, `reports/s00-paseo-hub.md`, `results/s00-paseo-hub-5cfde00d.json`.

## 10. Riproduzione e pulizia (comandi esatti)

```bash
export MSYS_NO_PATHCONV=1
SP=C:/Users/brain/AppData/Local/Temp/claude/C--Users-brain-OneDrive-team-agent-evaluation/<sessione>/scratchpad
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | sort > $SP/images-before.txt
# daemon ufficiale
docker pull ghcr.io/getpaseo/paseo:0.12.0 && docker tag ghcr.io/getpaseo/paseo:0.12.0 tae-paseo:0.12.0
docker run -d --name tae-paseo-s00 --label tae=1 --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512 \
  --cap-drop ALL --security-opt no-new-privileges --user 1000:1000 tae-paseo:0.12.0
docker exec tae-paseo-s00 node -e "require('http').get({hostname:'127.0.0.1',port:6767,path:'/api/health'},r=>console.log(r.statusCode))"
docker stop -t 30 tae-paseo-s00; docker rm -f -v tae-paseo-s00
# Hub dal sorgente (commit 28f6c788..., tag v0.10.0)
docker volume create --label tae=1 tae-hub-home
docker create --name tae-hub-s00 --label tae=1 --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512 --cap-drop ALL \
  --security-opt no-new-privileges --user 1000:1000 --init -v tae-hub-home:/home/paseo -w /home/paseo --entrypoint sleep tae-paseo:0.12.0 infinity
docker start tae-hub-s00
git -C <clone-hub> fetch --depth 1 origin tag v0.10.0
git -C <clone-hub> -c core.autocrlf=false archive --prefix=hub/ -o $SP/hub-src.tar 28f6c78833065fd282f9064f92a9aa61875dd359
docker cp $SP/hub-src.tar tae-hub-s00:/home/paseo/ && docker exec tae-hub-s00 sh -c 'cd /home/paseo && tar -xf hub-src.tar --no-same-owner'
docker exec tae-hub-s00 sh -c 'cd /home/paseo/hub && npm ci --no-audit --no-fund --maxsockets=4 && npm run build'
# avvio Hub, daemon, collegamento (vedi 3.2 e 3.3), poi script di test (RBAC, dispatch, SIGTERM, coda) copiati con docker cp
# pulizia (solo nomi tae-)
docker rm -f tae-hub-s00 && docker volume rm tae-hub-home && docker rmi tae-paseo:0.12.0 ghcr.io/getpaseo/paseo:0.12.0
docker ps -a --filter label=tae=1        # deve essere vuoto
```
