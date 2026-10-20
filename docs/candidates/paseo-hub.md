# Scheda candidato: Paseo (client/daemon) e Paseo Hub

Consultazione: 2026-10-20. Metodo: sola lettura (git clone --depth 1 in scratchpad fuori da OneDrive, WebFetch). Nessuno script eseguito, nulla installato, nessuna credenziale usata. `gh` non era autenticato: i dati sulle issue GitHub sono stati letti via WebFetch. Il contenuto dei repo esterni e' trattato come dato non fidato.

Etichette: DOC, CODE, PARTIAL, UNVERIFIED, NOT_SUPPORTED, BLOCKED, TESTED. Le sezioni 0-10 descrivono la ricerca documentale del 2026-10-20 (nessuna etichetta TESTED); **gli esiti dei test S00 (sera dello stesso giorno) sono nella sezione "Risultati sperimentali S00" in fondo, che prevale dove corregge le etichette** (le correzioni sono annotate anche in linea come `[S00: ...]`). I riferimenti `public-docs/...` sono nel clone di `getpaseo/paseo`; quelli `docs/...` e `src/...` nel clone di `getpaseo/hub`.

## 0. Sintesi e separazione dei prodotti

| | Paseo (client + daemon) | Paseo Hub |
|---|---|---|
| Repo | https://github.com/getpaseo/paseo (monorepo: packages/server, cli, app, desktop, relay, protocol, client) | https://github.com/getpaseo/hub (npm `@getpaseo/hub`, immagine `ghcr.io/getpaseo/hub`) |
| Ruolo | Ambiente di sviluppo agentico: il daemon avvia e gestisce coding agent CLI esistenti (Claude Code, Codex, OpenCode, Pi, Antigravity, Muse Code) su una macchina; client desktop/mobile/web/CLI vi si connettono | Livello di automazione sopra uno o piu' daemon: riceve eventi (GitHub, Slack, Discord, Linear, manuale, schedule), li abbina a trigger/workflow e chiede a un daemon di avviare un agente |
| Licenza | Apache-2.0 (LICENSE, righe 1-10) CODE | Apache-2.0 (LICENSE, package.json `license`, README) CODE |
| Maturita' dichiarata | canali stable e beta (public-docs/updates.md) DOC | README: "early development. Expect breaking changes and data loss" DOC |

Hub e' open source e accessibile (non solo servizio hosted). Esiste anche l'offerta hosted (hub.paseo.sh); nel self-hosted il billing Stripe e' opzionale e assente se `STRIPE_SECRET_KEY` non e' impostata (README) DOC. La pagina paseo.sh/docs/hub non riporta autenticazione e licenza e rimanda alla pagina sicurezza e al repo (WebFetch) DOC.

Giudizio sintetico: Paseo+Hub e' un dispatcher event-driven di sessioni di agente su daemon registrati, non un orchestratore del ciclo di sviluppo. Non ha coda di issue Jira, DAG, ruoli di agente applicati dall'infrastruttura, gateway modelli, budget di spesa, knowledge engine. E' interessante come piano di esecuzione remoto (daemon) con trigger, RBAC base e audit di attivita'.

## 1. Scopo originario e confini

- Paseo: "agentic development environment"; "Paseo manages other agents, it doesn't ship one" (public-docs/index.md sez. Prerequisites; why.md) DOC. Il daemon possiede agenti e workspace; i client sono intercambiabili (why.md, "Continue from another device") DOC.
- Hub: "the layer above your daemons... Hub decides when to ask them to" (paseo.sh/docs/hub) DOC; "self-hosted automation layer" (README) DOC. Flusso: evento, trigger, workflow di step ordinati, daemon (public-docs/hub/concepts.md righe 12-40) DOC.
- Cosa non e': non e' un tracker, non pianifica, non fa review indipendente, non gestisce il merge. Un workflow e' una sequenza ordinata di step con `if`, classifier e output schema (hub/workflows.md; hub/security.md "Use a finite classifier boundary") DOC. Un DAG di task con dipendenze non compare nei docs hub; nel codice non verificato: UNVERIFIED.

## 2. Versioni, URL, data

| Componente | Tag | SHA | Note |
|---|---|---|---|
| getpaseo/paseo | v0.12.0 (ultimo stabile, `git ls-remote`) | tag object d288bcfc840ffba71aa8565ee05184d9fce0a592 `[S00: SHA corretto; nella scheda era troncato a 39 caratteri]`; commit cafe4b01c8522ff39560241c5deb01427dc8dc5b | packages/server version 0.12.0 |
| getpaseo/paseo | HEAD di main letto | 068f272a00ffef3f00ec30ec4cfa3a631be97624 (2026-10-20) | clone parziale: il checkout su Windows non ha materializzato 5817 file (probabile limite path/symlink). `public-docs/` e l'albero `packages/` sono leggibili; il sorgente del daemon NON e' stato ispezionato |
| getpaseo/hub | v0.10.0 | tag object 38bfafd11858c06e1456c96bb17f5867a12d7075; **commit 28f6c78833065fd282f9064f92a9aa61875dd359** `[S00: il tag e' annotato, 38bfafd... non e' un commit]` | CHANGELOG 0.10.0 del 2026-09-29 |
| getpaseo/hub | HEAD di main letto | 7cbdd52023565eb1dcd940f24f5490e2593d090a (2026-10-17) | package.json 0.10.0; clone completo |

Manutenzione: attiva (HEAD paseo del giorno stesso; ultimo commit hub 3 giorni prima). Issue aperte su paseo: circa 780 (WebFetch https://github.com/getpaseo/paseo/issues). Tra le recenti, bug su sessioni Claude ("reloading a Claude agent during its first turn resumes a session that was never saved") e su figli provider. Issue del repo hub non consultate: UNVERIFIED.

## 3. Licenza e obblighi, dipendenze, runtime

- Apache-2.0 su entrambi; i componenti terzi mantengono le proprie licenze (paseo/LICENSE righe 3-8) CODE. Obblighi tipici: attribuzione, NOTICE, patent grant. Nessun copyleft evidente; audit delle dipendenze transitive non eseguito: UNVERIFIED.
- Il relay ufficiale e' open source, servizio Elixir getpaseo/paseo-relay (public-docs/security.md) DOC; in packages/relay compare un `wrangler.toml` (Cloudflare) CODE, non riconciliato con la dicitura "Elixir".
- "No telemetry, tracking, or required Paseo account" per Paseo (why.md) DOC.
- Runtime Paseo: Node (`npm install -g @getpaseo/cli`), app desktop macOS/Windows/Linux, immagine Docker `ghcr.io/getpaseo/paseo` (index.md) DOC. L'immagine Docker NON include gli agent CLI (index.md) DOC. Windows: named pipe e shutdown RPC in cli.md righe 368 e 401 DOC.
- Runtime Hub: Node; database embedded (un solo processo Hub per data dir) oppure PostgreSQL; Docker Compose con PostgreSQL (README) DOC. Stack: drizzle, vite, TanStack router (package.json, `drizzle/`, `src/routeTree.gen.ts`) CODE.

## 4. Architettura

### Paseo (client/daemon)
- Daemon su qualunque host (laptop, VPS, container); client via WebSocket; connessione diretta (default 127.0.0.1:6767) oppure relay outbound cifrato end-to-end (ECDH Curve25519, NaCl box) (public-docs/security.md) DOC. Stato in `PASEO_HOME` (default ~/.paseo) DOC.
- Autenticazione daemon: password opzionale (hash bcrypt in config.json), allowlist Host contro DNS rebinding. Senza password chiunque raggiunga l'indirizzo puo' connettersi (security.md "Password authentication") DOC.
- Strumenti di orchestrazione per gli agenti: MCP "Paseo tools" (off di default), CLI `paseo run`/`paseo send`, worktree, schedule, heartbeat, profili agente con note "when to use" (orchestration.md, agent-profiles.md, schedules.md) DOC. Gli agenti possono inviarsi prompt per ID (orchestration.md riga 18; orchestration-workflows.md riga 56) DOC.
- SDK TypeScript (public-docs/sdk, packages/client) e plugin (public-docs/plugins) DOC.

### Paseo Hub
- Entita': organization, connection (GitHub/Slack/Discord/Linear), daemon, environment, trigger, workflow, step; "project" compare in hub/concepts.md ma docs/trigger-migration.md riga 37 dice "Projects are gone from the product and configuration model" (incoerenza tra versioni, UNVERIFIED quale sia corretta) DOC `[S00: TESTED su v0.10.0: i "projects" esistono ancora nelle API (/api/v1/projects, /api/v1/configurations/*, progetto default), ma al riavvio Hub li migra in trigger di organizzazione e ritira il progetto legacy; vedi report sez. 5.6]`.
- Configurazione versionata in `.paseo/hub.yml` e `.paseo/workflows/*.yml`, oppure editor dashboard "manual". Una sola revisione attiva; se la validazione fallisce resta la precedente (concepts.md "Activation") DOC.
- Storage: PostgreSQL o database embedded; credenziali e lease persistiti nel DB (docs/workflow-authority.md righe 79-94) DOC.
- API pubblica OpenAPI 3.1 (`/api/openapi.json`, `/api/reference`), credenziali con scope (docs/public-api.md; hub/api.md) DOC. Endpoint di dispatch manuale con `deliveryKey` per deduplica (hub/api.md righe 208-215) DOC.
- Dispatch: Hub rimanda lo stesso intent di creazione con lo stesso execution id e il daemon restituisce l'agente esistente (hub/daemons.md riga 111) DOC.

## 5. Coding agent e provider LLM

- Paseo wrappa CLI: Claude Code, Codex, OpenCode, Pi, Antigravity, Muse Code, catalogo ACP (supported-providers.md) DOC.
- Claude Code: eseguito tramite CLI `claude` ufficiale con Claude Agent SDK, usando account e piano gia' presenti sull'host; se il login scade serve ri-autenticarsi e avviare una nuova sessione (claude-code.md righe 11-23) DOC. Quindi per run di molte ore non presidiate la tenuta dell'autenticazione Claude dell'host resta UNVERIFIED.
- Hub: dal dashboard sono offerti solo Claude, Codex e OpenCode, perche' Hub preapprova i propri tool (hub/triggers/index.md, sez. "Choose the agent in Hub") DOC. Gli altri provider via YAML: UNVERIFIED.
- Antigravity: solo modalita' full access (`--dangerously-skip-permissions`); tool MCP Paseo non disponibili (supported-providers.md) DOC.
- Modelli: scelti per trigger/step (`agent.provider`, `model`, `mode`, `thinkingOptionId`, `options` provider-native; hub/security.md, README Hub) DOC. Nessun routing automatico per task (vedi R06).

## 6. Ruoli, task, deleghe, DAG, scheduling, stato persistente

- Ruoli: profili agente (provider/modello/mode + note d'uso) selezionabili da un agente orchestratore (agent-profiles.md, orchestration.md) DOC. Sono configurazioni, non permessi per ruolo imposti dall'infrastruttura: "Provider or machine policy still controls every unrelated tool" (README Hub) DOC.
- Deleghe: subagenti via MCP/CLI, `send_agent_prompt`, skill `/paseo-handoff` per trasferire task e contesto a un altro agente (public-docs/skills.md righe 16, 33-37) DOC. Il pattern implement-then-review e' documentato (orchestration-workflows.md) DOC, ma e' guidato dal prompt: l'indipendenza del reviewer non e' garantita, UNVERIFIED.
- Scheduling Paseo: schedule cron e heartbeat nel daemon (schedules.md) DOC.
- Scheduling Hub: trigger `schedule.tick` con RRULE RFC 5545 e timezone; un solo run attivo per trigger (occorrenze dovute saltate), un solo catch-up dopo downtime (docs/scheduled-triggers.md righe 95-140) DOC. Non c'e' scheduler per priorita', dipendenze o rischio.
- DAG: nessuna evidenza nei docs; workflow = step ordinati con `if` e output degli step precedenti (concepts.md righe 38-39) DOC. Assenza dedotta solo dai docs, non dal codice: UNVERIFIED (non NOT_SUPPORTED).
- Stato persistente: esecuzioni, ricevute di eventi, revisioni di configurazione, sessioni di continuita' (stesso agente per stessa issue/PR/thread; `run.continuation` conversation/key/new, hub-yml.md righe 259-275) DOC.

## 7. Locale/remoto, sandbox, worktree, sicurezza, auth, RBAC

- Remoto: il daemon gira su server/VPS/container indipendente dal client; Hub lo raggiunge dopo `paseo hub connect` (daemons.md) DOC. La continuita' con il PC dello sviluppatore spento richiede daemon e Hub ospitati altrove: BLOCKED (serve una VM remota con daemon, Hub con PostgreSQL e un agent CLI autenticato con credenziali di prova).
- Worktree: ogni workspace puo' essere un git worktree isolato con hook di setup; in Hub `worktree.mode: branch-off` con `newBranch: trigger-${{ paseo.execution.id }}`, mantenuto su retry/recovery (daemons.md sez. "Reference it from configuration"; hub-yml.md riga 79) DOC. Hub non clona: la directory deve gia' esistere (daemons.md) DOC.
- Sandbox: Hub "does not sandbox the provider process" e non definisce un'astrazione comune; l'isolamento e' delegato a sandbox provider-native o al SO (hub/security.md riga 11 e "Provider-native controls") DOC. Il container Docker usa utente non-root ma "not a substitute for careful mounts" (security.md) DOC. Gate "esecuzione non confinabile": confinamento solo esterno (container/VM per daemon), PARTIAL.
- Autorita' del daemon: permesso `hub.execute` separato, default NO `[S00: TESTED: dopo paseo hub connect i permessi sono vuoti e senza hub.execute il daemon non e' un target valido]`, revocabile dalla macchina; consente di creare/continuare agenti, impostare modello e mode (anche bypass delle approvazioni) e archiviare workspace; "not an isolation boundary" (hub/security.md righe 21-27; daemons.md righe 70-80) DOC.
- Credenziali GitHub: blocco `github` per step, token di installazione GitHub App limitato a repository e permessi, durata max 1h, revoca a fine esecuzione, lease persistiti e recuperati al riavvio di Hub (docs/workflow-authority.md) DOC. Senza il blocco nessun token. Per R12: i permessi `contents: write` e `pull_requests: write` non includono un divieto di merge gestito da Hub; la prevenzione del merge va fatta con branch protection su GitHub, UNVERIFIED.
- Input non fidato: `from_users` obbligatorio e non vuoto sui trigger esterni; filtri per repo/workspace/channel; prompt delimitato. Il classifier e' "defense in depth, not a sandbox" (hub/security.md) DOC. Mitigazione di prompt injection da ticket: solo di prompt/classifier.
- Auth e RBAC Hub: ruoli organizzazione `owner`, `admin`, `member` (src/auth/organization-contract.ts riga 4) CODE `[S00: TESTED in runtime, report sez. 5.1: member 403 su chiavi API, inviti, cambio ruoli, rimozione; admin non puo' toccare gli owner; ultimo owner protetto con 409]`; l'approvazione del login CLI e' riservata a owner/admin (docs/public-api.md riga 16) DOC; API key con scope (es. `configuration:validate`, hub/api.md riga 80) DOC. RBAC per progetto, per ruolo di agente o per issue: nessuna evidenza, UNVERIFIED. Account email/password con verifica via Resend opzionale (README) DOC; moduli GitHub/Discord auth in src/auth/github.ts e discord.ts CODE (non approfonditi).
- Enrollment daemon-Hub: token monouso, credenziale di relazione propria; il login CLI non e' mai conservato come autorita' del daemon (daemons.md; paseo security.md "Hub identities and credentials") DOC.
- La configurazione `.paseo` e' autorita': va protetto il push sul branch (hub/security.md "Protect configuration authority") DOC.

## 8. Retry, checkpoint, recovery, idempotenza, cancellazione, timeout, budget

- Timeout espliciti obbligatori: workflow `max_runtime` (max 24h), step `max_runtime` e `idle_timeout`, `startup_timeout` (default 2m, max 24h) (hub-yml.md righe 134, 195-197; configuration/index.md riga 82) DOC.
- Idempotenza creazione: stesso execution id; un agente chiuso o in errore e' registrato "interrupted" e Hub non ne avvia un secondo in silenzio (daemons.md riga 111) DOC. E' recovery dello stato di esecuzione e dei lease, NON ripresa garantita della sessione conversazionale: per Antigravity, dopo restart del daemon il transcript Paseo riparte (supported-providers.md) DOC; per Claude la ripresa dipende dal provider, UNVERIFIED.
- Recovery Hub: al riavvio le esecuzioni attive e le credenziali originali sono preservate, l'agente e' riagganciato, le scadenze ripristinate; fermare Hub non termina l'esecuzione (workflow-authority.md righe 79-84) DOC.
- Retry degli eventi: i docs pubblici dicono "Hub does not queue events", il dispatch fallito resta fallito con `daemon_not_connected` (hub/activity.md riga 53; faq.md riga 47; daemons.md riga 122) DOC. Nota di incoerenza: docs/scheduled-triggers.md righe 117-119 afferma che il lavoro di workflow "remains queued" finche' il processo con la connessione al daemon puo' fare dispatch, entro il max runtime, per tutte le sorgenti. `[S00: TESTED con manual.run: la seconda affermazione e' corretta (coda reale, limitata da max_runtime); la prima ("Nothing is queued") e quelle di api.md (409) e daemons.md (daemon_not_connected) non sono riprodotte; altre sorgenti non provate]`.
- Deduplicazione: `deliveryKey` sul dispatch manuale, senza garanzia exactly-once (api.md riga 215) DOC `[S00: TESTED: stessa chiave => stesso run e una sola esecuzione, anche con 6 richieste concorrenti; la risposta viene riprodotta]`. Lock/lease per issue: nessuno (non esiste un claim di issue). Le sessioni di continuita' evitano un secondo agente sulla stessa issue/PR/thread (hub-yml.md righe 259-275): PARTIAL, limitato alle sorgenti con identita' di conversazione.
- Cancellazione: revoca dei token a cancellazione (workflow-authority.md) DOC; stop dell'agente via CLI/app: dettaglio UNVERIFIED.
- Budget: nessun budget di token o costo per task nei docs Hub. Esistono "entitlements" con meter `executions.monthly` per l'offerta commerciale (docs/entitlements.md righe 33-57; src/db/schema.ts riga 1073) CODE/DOC: limite sul numero di esecuzioni per organizzazione, non sulla spesa LLM. `paseo usage` mostra finestre e saldi dei provider (cli.md righe 39-59) DOC (osservazione, non enforcement).

## 9. Jira/tracker, GitHub, PR, CI, MCP, log, costi, dashboard

- Jira: nessun supporto. Nei docs pubblici non compare; nel repo hub l'unica occorrenza e' `src/connections/result-contract.test.ts` (un test) CODE. NOT_SUPPORTED come connection/trigger nativo (assente da tutti gli elenchi di sorgenti documentati). Un adapter che usa il dispatch manuale con `deliveryKey` e' realizzabile: PARTIAL (hub/api.md) DOC.
- Tracker/sorgenti documentati: Linear (continuita' per issue Linear, hub/triggers/index.md riga 59; README "Linear triggers") DOC, Slack, Discord, GitHub, manuale, schedule DOC. La pagina `triggers/linear` non e' presente nel clone di paseo: UNVERIFIED.
- GitHub e PR: l'agente apre la PR con `gh` e token scoped (hub/github.md) DOC. Hub non crea PR da se', non collega issue Jira, non verifica la CI: PARTIAL, dipende dal prompt.
- CI: nessuna integrazione CI di Hub nei docs: UNVERIFIED.
- MCP: Hub concede all'agente `finish_execution` e `reply`; l'autorizzazione degli output e' applicata dal server MCP di esecuzione (README "Provider options and Hub tools"; src/mcp-route-method-guard.test.ts) DOC/CODE. Paseo tools MCP (mcp.md) DOC.
- Log e osservabilita': Activity con eventi accettati e instradati, quattro motivi di non-instradamento, stato di esecuzione, revisioni di configurazione (hub/activity.md; README "One audit trail") DOC. Trace OpenTelemetry/Langfuse non documentati: UNVERIFIED.
- Costi: nessuna aggregazione di token input/output/cache per issue/task nei docs; `src/usage` riguarda entitlements/meter (docs/entitlements.md righe 66-83): UNVERIFIED per costi LLM.
- Dashboard: Hub web (Home con checklist, Activity, Configuration, Daemons, Connections, Team, Usage) (CHANGELOG 0.10.0; hub/activity.md) DOC; Paseo app desktop/mobile/web con diff, terminali, browser (why.md) DOC.

## 10. Adeguatezza al nostro caso (R01-R13)

Ruolo plausibile: Execution Plane e/o strato di dispatch su worker remoti, e canale eventi (Slack/Discord/GitHub/Linear). Non adatto come Control Plane per Jira. Paseo+Hub non porta DAG, coda, gateway modelli.

| Req | Esito | Evidenza e lacuna |
|---|---|---|
| R01 Jira/queue/lease | Assente: Jira NOT_SUPPORTED; coda: `[S00: "Nothing is queued" SMENTITO per manual.run: con daemon offline l'evento e' accodato ed eseguito al ritorno, entro max_runtime (TESTED)]` | activity.md riga 53; unica traccia di Jira e' un test. Servono Issue Queue Controller, lease, readiness, priorita'. Adapter minimo via dispatch con `deliveryKey`: PARTIAL |
| R02 Analyst | Assente | Solo workflow con classifier e `hub.reply` per Slack/Discord. Nessuna intervista strutturata ne' specifica/AC nativa |
| R03 Planning DAG | Assente nei docs (UNVERIFIED nel codice) | Step ordinati con `if` (concepts.md). Nessun DAG, verification contract, versioning del piano |
| R04 Team dinamico | PARTIAL | Profili agente, MCP/CLI per subagenti, `send_agent_prompt`, `/paseo-handoff`. Ruoli non imposti dall'infrastruttura |
| R05 Orchestration Gateway | PARTIAL, minimo | Dispatch event-driven deterministico (trigger, filtri, `if`, timeout). Nessun parallelismo pianificato, retry limitati, escalation. Pause/stop: UNVERIFIED |
| R06 Model Gateway | Assente (solo selezione statica) | Modello per step/trigger; niente routing per task, budget, escalation, costi input/output/cache |
| R07 Knowledge | Assente nei docs (UNVERIFIED nel codice) | Nessun Project Memory, Code Intelligence, Context Pack; solo skill (skills.md) e continuita' di sessione |
| R08 Esecuzione remota | PARTIAL forte | Daemon remoto, worktree, `branch-off`, riattacco agente e lease. Prova con PC spento BLOCKED; nessun checkpoint file/sessione garantito; sandbox non fornita |
| R09 Collaborazione | PARTIAL | Org owner/admin/member (CODE), Activity condivisa, daemon condiviso. Handoff umano strutturato per issue non documentato; Activity non e' stato di progetto strutturato |
| R10 Quality & Security | PARTIAL | Token GitHub scoped e a scadenza, `from_users`, `hub.execute` default off, autorizzazione output MCP. Nessuna review indipendente, gate CI, supervisor che arresta senza LLM, sandbox propria |
| R11 Osservabilita' | PARTIAL | Activity/audit eventi ed esecuzioni. Niente costi per issue, token, trace, decision inbox strutturata |
| R12 Autonomia / PR no merge | PARTIAL | PR senza merge ottenibile limitando il token GitHub e con branch protection esterna; Hub non ha modalita' Plan Only/Supervised/Autonomous. `mode` e' del provider (es. `full-access`: rischio) |
| R13 Estensioni | PARTIAL | Plugin, SDK, MCP, schedule, skill. Cross-repo, preview, valutazione continua: non documentati |

Gate bloccanti (istruzioni §10): duplicazione task, nessun lease nativo (da costruire); arresto affidabile, stop via daemon/Hub UNVERIFIED; impedire il merge, delegabile a GitHub (token + branch protection) e non a Hub; CI esterna, nessun supporto nativo; esecuzione confinabile, solo con container/VM esterni; segreti, `PASEO_HOME` contiene credenziali Hub e provider e va protetta (security.md).

Integrazione proposta: daemon (Docker non-root o VM dedicata) come worker; Hub opzionale per gli eventi; un Control Plane custom invoca il dispatch manuale con `deliveryKey` derivato da chiave Jira e tentativo, branch `trigger-<execution id>`, token GitHub senza merge. Rischi: Hub "early development... data loss" (README), docs/schema in movimento (incoerenze rilevate), autenticazione Claude Code dell'host, ampia autorita' di `hub.execute`, nessuna sandbox propria. Lock-in basso (Apache-2.0, self-hosted, YAML nel repo) ma API instabile.

Alternativa piu' semplice: solo daemon Paseo con CLI/SDK come runtime remoto, senza Hub ("Do I need Hub to use Paseo? No", hub/faq.md) DOC.

## 11. Riferimenti, esperimenti, limiti della verifica

Fonti primarie: https://paseo.sh/docs/hub; https://github.com/getpaseo/hub (README, LICENSE, CHANGELOG, docs/*.md, src/auth/organization-contract.ts); https://github.com/getpaseo/paseo (public-docs/*.md, public-docs/hub/*.md, LICENSE, SECURITY.md); https://github.com/getpaseo/paseo/issues (conteggio 2026-10-20).

Risultati sperimentali: vedi la sezione "Risultati sperimentali S00" in fondo. Scenari S01-S10 non eseguiti. Per R08/S06 notturno resta necessaria una VM remota.

Limiti noti della scheda:
1. Sorgente del daemon e del dispatcher Hub non letto in profondita': molte affermazioni sono DOC, non CODE.
2. Clone `paseo` parziale su Windows (5817 file non materializzati).
3. Incoerenze nei docs: "Nothing is queued" vs "remains queued" (scheduled-triggers.md riga 117); "Projects are gone" (trigger-migration.md riga 37) vs docs con progetti; Linear nel README Hub ma pagina `triggers/linear` assente dal clone.
4. self-hosting/index.md, github-app.md, slack-app.md, workflows.md non letti in dettaglio.
5. Issue del repo Hub e release GitHub non consultate (`gh` non autenticato).

## Segnalazioni dalle issue (consultate 2026-10-20 con `gh`; non riprodotte)

- **Hub #147 (aperta, 2026-10-03):** SIGTERM non completerebbe finché un daemon è connesso (`server.close()` atteso prima). Rilevante per lo stop e il riavvio controllato (R05.3, R08). ~~`UNVERIFIED`~~ `[S00: RIPRODOTTA (TESTED): con daemon connesso SIGTERM non termina (>= 90 s); termina 2,3 s dopo lo stop del daemon o con un secondo segnale]`.
- Il conteggio `open_issues_count` di GitHub include le PR: per `getpaseo/paseo` è 1474 al 2026-10-20 (la scheda riportava ~780 issue lette via web: la cifra non è confrontabile).
- Il repository Hub ha 41 elementi aperti e 56 stelle: adozione molto limitata.

## Risultati sperimentali S00

Eseguiti il 2026-10-20 (UTC 23:20-23:53), modalita' MOCK, esito complessivo **PARTIAL**, n = 1 salvo diversa indicazione. Dettagli, comandi e output sanificati: `reports/s00-paseo-hub.md`; dati: `results/s00-paseo-hub-5cfde00d.json`. Ambiente: container Linux non root (2 GiB, 2 CPU, `--cap-drop ALL`, nessuna porta, nessun mount host, un container alla volta, uscita di rete non filtrata). Versioni: Hub v0.10.0 (commit 28f6c78833065fd282f9064f92a9aa61875dd359, compilato dal sorgente), daemon Paseo 0.12.0 (immagine `ghcr.io/getpaseo/paseo:0.12.0`, digest sha256:0d17dd75a51c591907a4bbcd505013102048246a0cd6e824de3b38a6057ff862). Nessuna credenziale reale, nessuna chiamata LLM, costo 0. L'agente di prova e' un provider ACP finto con id riservato `hub-e2e` (hook di test del registro del daemon): non dimostra il comportamento con Claude/Codex/OpenCode.

| Affermazione | Etichetta | Evidenza |
|---|---|---|
| Il daemon (immagine ufficiale) parte da non root con `--cap-drop ALL`; health 200, SIGTERM exit 0 in 2,6 s | TESTED | report 3.1; senza `PASEO_PASSWORD` il daemon non richiede autenticazione |
| Il daemon scarica ~814 MB di modelli vocali da GitHub al primo avvio (disattivabile) | TESTED | report 4.2; non presente nella scheda |
| Hub v0.10.0: `npm ci` 35 s, build 66 s, avvio con DB embedded: cold 9-10 s, warm 3,5-5,6 s, `/health` `{"ok":true}`, RSS ~590 MB | TESTED | report 3.2, 6 |
| Hub con PostgreSQL / immagine ufficiale Hub / `docker compose` / `npx @getpaseo/hub` | UNVERIFIED | non eseguiti (embedded bastato) |
| Test del repo: 1.079 test PASS in 149 file; 108 falliti in 3 file solo per assenza di Docker (testcontainers) | TESTED (subset) | report 3.4 |
| RBAC owner/admin/member in runtime | TESTED | report 5.1 |
| `hub.execute` assente di default e necessario per essere target | TESTED | report 3.3 |
| Dispatch manuale idempotente per `deliveryKey` (anche concorrente) | TESTED | report 5.2 |
| SIGTERM con daemon connesso non termina (#147) | TESTED (riprodotta) | report 5.3 |
| Hub SIGKILL con run in volo: agente sopravvive, nessun duplicato, completion accettata dopo il riavvio | TESTED (lato agente) | report 5.4; stato finale del run non leggibile dopo il riavvio |
| Coda con daemon offline | TESTED: accodato, eseguito al ritorno, `timed_out` oltre `max_runtime` | report 5.5; "Nothing is queued" smentito per `manual.run` |
| Coda attraverso un riavvio di Hub | TESTED (fallimento) | report 5.5, 5.6; causa non isolata |
| Dopo il riavvio le config legacy vengono migrate e `POST /api/v1/manual-runs` risponde 500 | TESTED (sintomo); causa PARTIAL (CODE) | report 5.6; ipotesi: `daemonId` non risolto dalla migrazione |
| Trigger nuovi (`/api/v1/triggers/*`, `paseo hub init/deploy`) con agente reale | BLOCKED | accettano solo Claude/Codex/OpenCode disponibili; servono agent CLI e credenziali |
| Login CLI con approvazione, dashboard nel browser, Windows | UNVERIFIED | non provati |

Discrepanze rispetto alla scheda: (1) "Nothing is queued" e' smentito per `manual.run`; (2) la tabella SHA riportava l'oggetto tag di Hub come commit e uno SHA di Paseo troncato; (3) con daemon offline il dispatch non da' 409 ne' `daemon_not_connected` ma 200 `running`; (4) la risposta al dispatch ripetuto viene riprodotta, la doc dice di non contarci; (5) il daemon scarica ~814 MB di modelli vocali al primo avvio; (6) `/api/v1/triggers/*` e il bundle legacy hanno regole diverse sui provider (solo Claude/Codex/OpenCode contro qualunque).
