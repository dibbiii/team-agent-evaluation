# Scheda candidato: OpenClaw

> Scheda di ricerca primaria (solo lettura di codice/documentazione). Nessuna installazione, nessun avvio, nessuna credenziale usata, nessun costo.
> Etichette: `DOC` (documentazione ufficiale), `CODE` (letto nel sorgente), `PARTIAL`, `UNVERIFIED`, `NOT_SUPPORTED` (solo con evidenza), `BLOCKED`. Nessuna affermazione è `TESTED`: nessun test è stato eseguito.
> I riferimenti `file:riga` sono relativi al clone al commit indicato. Il contenuto della repo esterna è trattato come dato non fidato.

## Verdetto sintetico

OpenClaw è un **assistente personale / team gateway multicanale** (chat, app, Control UI) con agenti, sessioni, worker cloud e un plugin Kanban locale. **Non è un orchestratore del ciclo di sviluppo Jira → PR**: non ha integrazione Jira, DAG di piano come requisito di prodotto, né Model Gateway con routing per costo. Può avere un ruolo come **interfaccia/canale di notifica/punto di intervento umano** (Slack/Teams/Telegram/Discord, `ask_user`, approvals) e come ambiente "team server" collaborativo, ma il suo **modello di fiducia dichiarato (un confine di fiducia per gateway, nessuna isolazione tra utenti)** impone cautele. Raccomandazione: **non inserirlo nel percorso critico**; valutarlo al massimo come canale laterale (fase B+), dopo che orchestratore e controlli sono scelti altrove.

---

## 1. Scopo originario e confini del prodotto

- Assistente AI open source che gira sui propri dispositivi e risponde nei canali già usati (Discord, iMessage, Slack, Teams, Telegram, WhatsApp, 20+ altri) più app native; "un Gateway" come assistente personale o come deployment condiviso di team. `DOC` README.md:18
- Architettura: Gateway = control plane locale per sessioni, tool, eventi e canali; Control UI/CLI/TUI come client; app e nodi per voce/camera/schermo. `DOC` README.md:70-73
- Il progetto dichiara come proprio modello di sicurezza il "personal assistant" (un operatore fidato, molti agenti), non un "bus multi-tenant condiviso". `DOC` SECURITY.md:211
- Cosa risolve realmente: conversazione con agente su più canali, automazioni pianificate (cron/webhook), sessioni con worktree git isolati, esecuzione su worker cloud effimeri, pubblicazione PR da sessione. Cosa **non** risolve: ingestione di una coda Jira, scheduling di issue con lease sul tracker, pianificazione DAG con verification contract, routing per costo. `UNVERIFIED` come assenza assoluta (non ho eseguito ricerca esaustiva su ClawHub/plugin di terzi); nel repo core nessun riferimento Jira operativo (solo la frase che Workboard non sostituisce Jira, vedi §9). `DOC` docs/plugins/workboard.md:18-20

## 2. Versione, URL, data consultazione

| Voce | Valore |
|---|---|
| Repo | https://github.com/openclaw/openclaw (clone `--depth 1` di `main`) |
| Commit SHA | `6beb671cda9dd964bc16abf4ecb07d1922313134` (committer date 2026-10-20 18:23:30 +0000) |
| Versione in `package.json` | `2026.10.5` (package.json, campo `version`) |
| Ultima release stabile (pagina Releases) | `2026.10.5` del 18 ott 2026, marcata Latest; pre-release `2026.10.10-beta.2` (19 ott) e `beta.1` (15 ott) `DOC` https://github.com/openclaw/openclaw/releases (letto parzialmente: 100000 di ~177000 caratteri) |
| Tag nel clone | nessuno (shallow clone, `git tag` vuoto): il SHA è di `main`, successivo alla 2026.10.5, non un tag |
| Docs | https://docs.openclaw.ai (versione italiana indicata dal task non consultata; usati i sorgenti `docs/` del clone, in inglese) |
| Data consultazione | 2026-10-20 |

Anomalia di ambiente: il checkout su Windows ha segnalato errori e `git status` mostra ~58 400 voci come cancellate in working tree (probabile limite lunghezza path/file system), quindi alcune parti del clone possono mancare. I file citati sotto sono stati letti realmente; l'assenza di un file nel clone **non** è usata come prova di assenza di funzione. `UNVERIFIED` completezza del clone.

## 3. Licenza, dipendenze, maturità

- Licenza **MIT**, "Copyright (c) 2026 OpenClaw Foundation". `CODE` LICENSE:1-3; package.json `"license": "MIT"`. Obblighi: conservare avviso di copyright/licenza; esiste anche THIRD_PARTY_NOTICES.md (non analizzato).
- Governance: OpenClaw Foundation (501(c)(3)), nessun tier a pagamento/servizio hosted/token dichiarati. `DOC` README.md:20,108-110
- Runtime: Node `>=24.16.0 <25 || >=26.1.0`, pnpm workspace (pnpm 12). `CODE` package.json:2474-2477; README.md:38,96
- Superficie enorme: ~230 cartelle in `extensions/` (provider, canali, plugin), app macOS/iOS/Android, crates Rust. `CODE` listing `extensions/`, `apps/`, `crates/`
- Maturità/manutenzione: cadenza di rilascio molto alta (release 2026.10.x con beta a pochi giorni; 2.704 commit, 2.250 PR, 638 contributor nella 2026.10.5). `DOC` pagina Releases. Rischio: churn elevato, versionamento calendariale, molte funzioni "dopo la release X" (es. decision model aggiunto dopo 2026.9.5, docs/concepts/decision-models.md:19-21). `DOC`
- Install ufficiale raccomandata: `curl ... | bash` / `iwr ... | iex` oppure `npm install -g openclaw@latest --allow-scripts=openclaw`. `DOC` README.md:28-42. Non eseguiti (regola di laboratorio: non usare `curl | sh`).
- Telemetria: solo controllo versione giornaliero di default; statistiche anonime opt-in; `update.checkOnStart: false` le disattiva. `DOC` README.md:20

## 4. Architettura

- **Gateway** (processo unico, daemon) = control plane: sessioni, tool, eventi, connessioni canale, scheduler (automazioni), plugin. Protocollo WebSocket con ruoli `operator` e `node`. `DOC` README.md:70; docs/gateway/operator-scopes.md:18-28
- **Storage**: database SQLite di stato (`state/openclaw.sqlite`) per sessioni, profili, credenziali identity-scoped; opzione PostgreSQL (docs/gateway/postgresql.md, non letta) e store Workboard con backend SQLite o Postgres. `DOC` docs/concepts/multi-user.md:122; `CODE` extensions/workboard/src/ (sqlite-store.ts, postgres-store.test.ts, workboard-postgres-schema.ts)
- **Nodi** = estensione di esecuzione del Gateway; il pairing concede capacità a livello operatore sul nodo. `DOC` SECURITY.md:247-256
- **Worker cloud** ("Cloud Workers"): sessione eseguita su macchina cloud effimera (Crabbox) in modalità `worker-turn` (loop agente sul box, inferenza e autenticazione modello sul Gateway) o Codex `remote-exec`; trascrizione e modifiche workspace accettate restano sul Gateway. `DOC` docs/gateway/cloud-workers.md:1-8,54-60
- **Eventi/API**: RPC Gateway, endpoint HTTP compatibili OpenAI (`/v1/chat/completions`, `/v1/responses`), `/tools/invoke`, hook HTTP in ingresso (`/hooks/wake`, `/hooks/agent`, hook mappati) disattivati di default, plugin `admin-http-rpc`, `mcp-events`, `a2a` (protocollo A2A v1.0 come canale). `DOC` SECURITY.md:132; docs/automation/cron-jobs/webhooks.md:11-30; `CODE` extensions/{admin-http-rpc,mcp-events,a2a}/package.json (solo descrizioni)

## 5. Coding agent e provider LLM

- Provider: molti (anthropic, openai, google, bedrock, vertex, ollama, vllm, litellm, openrouter, ecc.) come plugin. `CODE` elenco `extensions/`
- **Claude Code**: due vie distinte. (a) *CLI backend* `claude-cli`: i turni dell'agente OpenClaw girano tramite l'eseguibile Claude Code installato e autenticato sull'host del Gateway, con subprocess caldo; i tool del Gateway arrivano via bridge MCP, senza controlli ACP. `DOC` docs/gateway/cli-backends.md:10,29-36,127,153. (b) *ACP*: Claude Code come sessione "harness" esterna (`/acp spawn`, `sessions_spawn({runtime:"acp"})`) con controlli, resume e task in background. `DOC` docs/tools/acp-agents.md:15,35,69-78. Compatibilità reale con il nostro flusso: `UNVERIFIED`.
- Autenticazione: il Gateway ospita le credenziali modello; ogni persona può collegare un account personale. Anthropic: solo API key per l'account personale, "non un token di abbonamento Claude". `DOC` docs/concepts/multi-user.md:94. Rischio da verificare con Anthropic ToS per uso di sessioni Claude Code in servizio condiviso: `UNVERIFIED`.
- Codex: runtime nativo e `remote-exec`. `DOC` docs/gateway/cloud-workers.md:54-60

## 6. Ruoli, task, deleghe, DAG, scheduling, stato persistente

- **Agenti multipli** nello stesso Gateway con workspace, `agentDir` e storico SQLite separati; routing per canale/binding. `DOC` docs/concepts/multi-agent.md:8
- **Team preset**: `openclaw agents team create` crea coordinator ("chief of staff"), researcher, writer, reviewer; i ruoli vivono in `AGENTS.md` (prompt), i specialisti non delegano ulteriormente. `DOC` docs/concepts/multi-agent.md:112-127. Non esistono Developer/Architect/QA/Integrator nel preset; sono configurabili manualmente. Il rispetto dei ruoli è per prompt, salvo policy tool/sandbox per agente (vedi §7). `PARTIAL`
- **Sub-agenti / swarm / lane specializzate**: `sessions_spawn`, fan-out limitato da Code Mode, code per sessione e parallelismo globale limitato dalla command queue. `DOC` docs/tools/swarm.md:3; docs/concepts/parallel-specialist-lanes.md:12-38
- **Workboard** (plugin bundled, **disabilitato di default**): schede Kanban per lavoro agent-sized, con `parents`/`workboard_link` (figli restano `todo` finché ogni genitore è `done`, poi promossi a `ready`), `workboard_decompose` (fan-out di una scheda orchestratrice in figli), `workboard_specify`, `workboard_complete` con proof/artifact, `workboard_block`, notifiche con cursore durevole. `DOC` docs/plugins/workboard.md:12-20,22-24,428-449. Il piano è quindi un grafo di schede (di fatto un DAG di dipendenze genitore→figlio) **locale a un Gateway**. `PARTIAL` rispetto a R03: nessun verification contract, scope file, rischio o budget per task come campi di prodotto (campo `retry budget` e `runtime limit` sì in `workboard_create`, `DOC` workboard.md:430).
- **Dispatch**: un passaggio promuove schede pronte, blocca claim scaduti/run oltre timeout, marca triage, reclama un piccolo batch di schede `ready` e avvia worker tramite il runtime subagent del Gateway; "non avvia processi OS arbitrari". `DOC` docs/plugins/workboard.md (sezione Dispatch, ~r. 495-505); `CODE` extensions/workboard/src/dispatcher.ts:275-302 (`maxStarts`, `maxAttempts = maxStarts * 2`)
- **Claim/lease**: `claim()` assegna token (UUID) e `expiresAt` con TTL di default, rifiuta di rubare un claim attivo (anche con grace sull'heartbeat per schede `running`), controlla che l'autorità del workspace non sia cambiata; mutazioni di altri agenti rifiutate senza token; token redatto nelle risposte; recupero via `promote/reassign/reclaim`. `CODE` extensions/workboard/src/store-workflow.ts:80-130; `DOC` workboard.md:475-487. Questo è un meccanismo di lease **sulle schede locali**, non sulle issue Jira. `PARTIAL`
- **Proof non indipendente**: "Proof statuses are worker-reported outcomes, not independent verification". `DOC` docs/plugins/workboard.md:456-458
- **Goal di sessione**: obiettivo durevole per sessione con budget token opzionale impostabile dal tool del modello `create_goal` (non da `/goal start`). `DOC` docs/tools/goal.md:97,124-134
- **Memoria**: file Markdown nel workspace (`MEMORY.md`, `USER.md`, `memory/*.md`), più plugin (memory-core, memory-lancedb, memory-wiki, active-memory, honcho); trattati come stato locale fidato. `DOC` docs/concepts/memory.md:7-25; SECURITY.md:258-260. Non è un Knowledge Engine con Code Intelligence/ADR/invalidazione per commit. `PARTIAL` per R07 (nessuna evidenza di invalidazione dopo merge: `UNVERIFIED`).
- **Standing orders**: autorità operativa permanente definita in `AGENTS.md` + automazioni; i gate di approvazione sono istruzioni nel prompt. `DOC` docs/automation/standing-orders.md:3-34
- **Lobster**: runtime di workflow tipizzato con gate di approvazione/input e resume token. `DOC` docs/tools/lobster.md:3-12. Valutabile come meccanismo di workflow, non provato.

## 7. Esecuzione locale/remota, sandbox, worktree, sicurezza, autenticazione, RBAC

### 7.1 Modello di fiducia multiutente (analisi centrale)

Fatti documentali:

1. **Un confine di fiducia per Gateway.** Supportato: un singolo operatore o un team che si fida reciprocamente; **non supportato**: un gateway/agente condiviso fra utenti non fidati o avversari. `DOC` docs/gateway/security/trust-model.md:13-16; SECURITY.md:5,128-145,205
2. **Chiunque possa operare un agente può fargli fare tutto ciò che l'agente può fare.** Proprietà di sessione, visibilità e presenza sono "funzionalità di usabilità, non confini di sicurezza"; l'attribuzione del turno è best-effort perché lo steering può fondere input in un turno attivo. `DOC` SECURITY.md:13; docs/concepts/multi-user.md:15-17
3. **Gli utenti autenticati sono operatori fidati.** Auth con segreto condiviso (token/password) = accesso pieno da operatore, scope `x-openclaw-scopes` ignorati sugli endpoint HTTP compatibili e su `/tools/invoke`; solo modalità con identità (trusted-proxy, `mode="none"` su ingresso privato) rispettano scope per richiesta. `DOC` SECURITY.md:130-139
4. **`sessionKey` è un selettore di routing, non un token di autorizzazione**; vedere dati di altri operatori sullo stesso gateway è atteso. `DOC` SECURITY.md:140-141; trust-model.md:21
5. **Default permissivi**: `tools.sessions.visibility` = `all` e `tools.agentToAgent.enabled` = `true`: un agente con tool abilitati e non sandboxed può elencare, leggere, cercare e scrivere alle sessioni di tutti gli agenti, incluse trascrizioni di altri utenti. `DOC` trust-model.md:17
6. **Esecuzione host-first**: `agents.defaults.sandbox.mode` default `off`; `tools.exec.host` default `auto`; default operatore singolo `security="full"`, `ask="off"` (nessun prompt di approvazione). `DOC` SECURITY.md:146-149; trust-model.md:67
7. **Plugin = parte del TCB**: installare/abilitare un plugin equivale a codice locale sull'host del Gateway. `DOC` SECURITY.md:153-157
8. **Exec approvals** sono guardrail per l'intento dell'operatore, non isolamento multi-tenant, e non modellano semanticamente ogni interprete/loader. `DOC` SECURITY.md:190,253-254
9. **Il modello/agente non è un principale fidato**; prompt injection fuori scope come vulnerabilità finché non scavalca auth/policy/sandbox/approvals. `DOC` SECURITY.md:241-243
10. **Il contesto supplementare** (quote, thread, forward) può non essere filtrato per allowlist: le allowlist gestiscono il *trigger*, non la visibilità del contesto. `DOC` SECURITY.md:221-237

Funzioni di collaborazione (reali, ma dentro un confine unico):

- **Multi-user mode**: creator immutabile, owner assegnabile (stile assignee), partecipanti storici, presenza, filtro "Involving me", menzioni tra persone, account modello personali per profilo. `DOC` docs/concepts/multi-user.md:11,39-71,73-134. Per R09 questo è un **handoff reale di responsabilità di sessione** (`sessions.assignOwner`, `operator.write`), ma "assegnare un owner non trasferisce l'autorità di condivisione" e non è un confine di sicurezza. `DOC` multi-user.md:56-71
- **Ruoli nominati** per Team Gateway: per ruolo si definiscono visibilità sulle sessioni altrui (`view`/`write`), agenti utilizzabili, tetto di scope operator, `sandbox: "required"` e plugin di access policy; assegnabili con `users.setRole` o `byGithubLogin`; il cambio ruolo chiude le connessioni attive. `DOC` docs/gateway/operator-scopes.md:152-192; docs/gateway/team-server.md:142-161. Logica in `src/gateway/operator-role-policy.ts` e `operator-access-policy.ts` (esistenza `CODE`; contenuto non analizzato → applicazione effettiva `UNVERIFIED`).
- **Team server** documentato: Cloudflare Tunnel + Access, identità verificate (GitHub), ruoli default `observer`, sessioni su worktree gestiti, "Publish PR", e dichiarazione esplicita "Roles and session ownership support collaboration; they do not isolate hostile users from each other". `DOC` docs/gateway/team-server.md:11-47,59-62,246-254. Il progetto la usa per sviluppare OpenClaw stesso (dogfooding). `DOC` team-server.md:22-47
- Nota: nel profilo `trusted-proxy` OpenClaw controlla la sorgente proxy e gli header richiesti, ma "la presenza degli header non è verifica della firma del JWT Access"; il confine esterno è Access + origine privata. `DOC` team-server.md:177-182
- **Link pubblici di trascrizione** opt-in (creatore o admin); lettura anonima. `DOC` multi-user.md:21-37 (rischio di esposizione dati).
- **Guest** con `sandbox: required`: possono aprire/marcare pronte PR draft dalle proprie sessioni, **non** fare merge. `DOC` team-server.md:287-289

Valutazione per il nostro caso (R09/R10): adatto a **un team di sviluppatori che si fidano reciprocamente e condividono lo stesso confine di fiducia aziendale**, con ruoli come guardrail di collaborazione; **non** adatto a imporre permessi forti per-sviluppatore o per-agente come "RBAC infrastrutturale" nel senso del requisito (§4 idea-progetto: "permessi applicati dall'infrastruttura"). Un Analyst/Reviewer read-only va ottenuto con policy tool per agente e sandbox (`DOC` docs/gateway/config-tools/tool-policy.md, non letta in dettaglio), ma con visibilità sessioni di default `all` e un solo utente OS: `PARTIAL`. Un'isolazione reale richiede più gateway/utenti OS/host: costo operativo alto.

### 7.2 Sandbox, worktree, remoto

- Sandbox off di default; backend Docker, Podman, SSH, OpenShell, Crabbox; "non è un confine di sicurezza perfetto". `DOC` docs/gateway/sandboxing.md:9-12,22-32; SECURITY.md:149
- `node:vm` per Code Mode non è un confine di sicurezza; QuickJS-WASI è l'executor hardened opzionale. `DOC` SECURITY.md:159-169
- **Managed worktrees**: checkout git isolati per task con snapshot automatici e cleanup, registrati nel DB di stato. `DOC` docs/concepts/managed-worktrees.md:3,11-14
- **Cloud workers**: ingresso chiuso, autorità tool sul Gateway, credenziali coniate, binding di enrollment (docs/gateway/cloud-workers/security-model.md, non letto) — `DOC` solo indice; efficacia reale `UNVERIFIED`. Il Gateway deve restare raggiungibile dal worker (WebSocket in uscita verso endpoint TLS pubblico del Gateway). `DOC` cloud-workers.md:80+
- Credenziali GitHub del Gateway escluse dalle sandbox di default (opt-in per agente). `DOC` docs/gateway/config-tools/github-identity.md:99

## 8. Retry, checkpoint, crash recovery, idempotenza, cancellazione, timeout, budget

- **Restart recovery**: conversazioni, trascrizioni, job pianificati, record subagent e consegne in coda sono su disco; i turni principali interrotti da riavvio/crash/kill entrano in recupero automatico (sempre attivo, con crash-loop breaker e budget di retry; può "tombstonare" una sessione dopo retry esauriti); lo Stop esplicito è terminale. `DOC` docs/gateway/restart-recovery.md:11-22. Cron: un job agente a tempo interrotto prima della consegna ha un solo retry; job command/script/event non vengono riprodotti. `DOC` restart-recovery.md:24-31
- **Cloud**: dopo riavvio, recupero conferma l'arresto del vecchio worker, regola i risultati workspace pendenti e ritira il turno mantenendo la macchina; il Gateway conserva claim e risultati pendenti. `DOC` docs/gateway/cloud-workers/session-lifecycle.md (sezione Update/riavvio). Distinguere (istruzioni §S06): recupero file/workspace, stato task e ripresa della conversazione sono documentati come tre livelli; nessuno è provato. `UNVERIFIED` in pratica.
- **Workboard**: claim con TTL e heartbeat, blocco di claim scaduti/timeout, budget di retry e limite di runtime per scheda, chiave di idempotenza in creazione e per run (`idempotencyKey: runId`), notifiche replay-safe con cursore. `DOC` workboard.md:430,449,505; `CODE` dispatcher.ts:479 (idempotencyKey), store-workflow.ts:80-130. Idempotenza per eventi duplicati da Jira: non applicabile (nessun Jira).
- **Failover modelli**: rotazione profili auth e fallback tra modelli con cooldown e disabilitazioni per billing. `DOC` docs/concepts/model-failover.md:83-102,304-393. È resilienza di disponibilità, non escalation per difficoltà del task. `PARTIAL` per R06.
- **Budget**: budget token per *goal* di sessione (opzionale); tracking di costo e uso (`/usage cost`, Control UI Usage, `usage-cost`), costo stimato solo per modelli con API key. Nessun budget per issue/progetto che fermi nuove esecuzioni con enforcement dimostrato. `DOC` docs/tools/goal.md:124-134; docs/concepts/usage-tracking.md:17-22; stop-on-budget a livello progetto `UNVERIFIED`.
- **Supervisor indipendente** che fermi run anche senza LLM: non trovato come funzione dedicata; esistono Stop/cancel, loop detection (docs/tools/loop-detection.md, non letto) e crash-loop breaker. `UNVERIFIED`.

## 9. Jira / tracker, GitHub, PR, CI, MCP, logging, costi, dashboard

- **Jira**: nessuna integrazione nel core. La documentazione di Workboard afferma esplicitamente che non sostituisce GitHub Issues, Linear, Jira. `DOC` docs/plugins/workboard.md:18-20. Ricerca testuale su `docs`, `extensions`, `src`: nessun adapter Jira. Via MCP (server Jira esterno collegabile a OpenClaw) o via hook HTTP in ingresso: `PARTIAL` (richiede glue custom; non provato). `DOC` docs/tools/mcp.md:10-14; docs/automation/cron-jobs/webhooks.md:11-30
- **GitHub**: plugin `github` = lettore di link pubblici (issue/PR/commit/check); **pubblicazione PR** dal Gateway con identità GitHub di sistema/agente/personale tramite tool `github_publish`. `DOC` extensions/github/README.md; docs/gateway/config-tools/github-identity.md:99-168
- **Merge**: `github_publish` ha azioni `inspect`, `ready`, `merge`, `close`; il merge è esposto solo a un utente con "full operator write", richiede `requestId`, `expectedHeadCommit` e `mergeMethod`, non abilita auto-merge né cancella branch; i guest non possono fare merge. `DOC` github-identity.md:162-168; `CODE` src/agents/tools/github-publish-tool.ts:40,47. Rischio per R12 ("nessun merge automatico"): la capacità di merge **esiste** nel prodotto e andrebbe disabilitata/negata via tool policy o credenziali GitHub senza permesso di merge/branch protection; verifica della disattivazione: `UNVERIFIED`. GitHub continua a imporre permessi repository e requisiti di merge.
- **CI**: i check del commit head sono leggibili nel reader e la PR pubblicata mostra i dettagli CI nella conversazione. `DOC` team-server.md:36-38; extensions/github/README.md. Gating con CI esterna: nessun enforcement nel flusso documentato oltre ai required checks di GitHub. `PARTIAL`
- **Avviso rilevante**: la pubblicazione modifica workflow `.github/workflows/*.yml` solo con autorità piena, ma i workflow eseguono comunque codice del branch (rischio generico CI). `DOC` github-identity.md:178-180
- **Logging/osservabilità**: log file e JSONL, export OpenTelemetry (OTLP/HTTP) via plugin `diagnostics-otel`, Prometheus, audit history metadata-only con identità di esecuzione e decision receipts. `DOC` docs/gateway/opentelemetry.md:3-15; docs/gateway/audit.md:3; `CODE` extensions/diagnostics-prometheus, diagnostics-otel (esistenza). Costo per issue accettata, costo dei fallimenti: `UNVERIFIED`.
- **Dashboard**: Control UI web (sessioni, owner, presenza, Usage, Workboard Kanban, Sessions board con colonne su stato sessione/salute osservatore/stato PR). `DOC` docs/plugins/workboard.md:12-16; docs/concepts/multi-user.md:138-146. Non corrisponde alle quattro viste richieste, ma sovrappone parzialmente Agent Activity e Observability & Costs. `PARTIAL`
- **Decision/Review Inbox**: `ask_user` (1-3 domande strutturate, solo sessione principale, su Discord/Slack/Telegram/WebChat incluso Control UI), scope `operator.questions` e `operator.approvals`. `DOC` docs/tools/ask-user.md:11-20; operator-scopes.md:39-41. Nessuna aggregazione di decisioni duplicate in un'unica richiesta (`UNVERIFIED`).

## 10. Adeguatezza al nostro caso

### 10.1 Ruolo plausibile: interfaccia / notifica / automazione (non percorso critico)

| Funzione | Come OpenClaw potrebbe servire | Stato |
|---|---|---|
| Canale di notifica per sviluppatori (Slack/Teams/Telegram/Discord) su PR pronta, decisione richiesta, errore | Consegna di output di automazioni o `ask_user`/approvals su canale; hook HTTP in ingresso per ricevere eventi dalla nostra piattaforma | `DOC`; `UNVERIFIED` (non provato) |
| Decision inbox conversazionale | `ask_user` su canali supportati; risposte riportate alla sessione | `PARTIAL` |
| Trigger pianificati / webhook | Automazioni cron e `/hooks/agent` (disabilitati di default, token dedicato) | `DOC` |
| Dashboard condivisa per un team fidato | Control UI team server con ruoli, owner, presenza, Usage | `PARTIAL`; vincolata al confine unico |
| Esecuzione agente "chat-driven" su worker cloud | Cloud workers (Crabbox) | `DOC`; richiede Crabbox; `UNVERIFIED` |

Considerazioni di sicurezza per questo ruolo: i messaggi in ingresso sono input non fidato (pairing DM per mittenti ignoti di default, `DOC` README.md:79); i payload da hook/webhook vanno trattati come non fidati (`DOC` SECURITY.md:244); un agente esposto a canali dovrebbe avere profilo tool restrittivo (es. `tools.profile: "messaging"`) e modelli forti (`DOC` SECURITY.md:245). Una soluzione sicura è un **gateway dedicato di sola notifica**, senza tool exec, senza credenziali Git/Jira di scrittura e separato (utente OS/host) dall'Execution Plane, che riceva solo eventi "puliti" dal nostro Control Plane.

### 10.2 Perché non nel percorso critico (Control/Execution Plane)

- **R01 Jira/queue/lease**: assente per Jira; Workboard fornisce lease su schede locali, utilizzabili solo con adapter custom Jira → Workboard (mappatura, riconciliazione eventi duplicati, stato di ritorno a Jira): sforzo da stimare, non quantificabile senza prototipo. `PARTIAL`
- **R05**: dispatch di Workboard è deterministico (promozione dipendenze, claim, scadenze), ma limitato a "batch piccolo" e a un Gateway; scheduling per priorità/rischio/risorse non documentato. `PARTIAL`
- **R06**: molti provider e failover, ma nessun router per task su complessità/rischio/costo con escalation automatica documentato. Decision model (classificazione/punteggio) è una primitiva per costruirlo, aggiunta dopo la 2026.9.5. `DOC` decision-models.md:3-21. `PARTIAL`
- **R10**: nessun Reviewer indipendente imposto dall'infrastruttura (ruoli via prompt/`AGENTS.md`); proof "non verificata indipendentemente" (workboard.md:456-458). Isolamento reale solo con sandbox/worker/host separati, con default off. `PARTIAL`
- **R12**: mode "Autonomous PR" non come modalità di prodotto; si può approssimare (agenti con `github_publish` senza permesso merge, draft PR). Capacità di merge presente → da disattivare esplicitamente. `PARTIAL`
- **Lock-in/complessità**: superficie molto ampia (>200 estensioni), churn alto, assunzioni "personal assistant" non allineate a una piattaforma enterprise multi-tenant.

### 10.3 Cosa manca e come integrarlo

Manca: adapter Jira, analyst/intervista strutturata con specifica approvata, planning con verification contract, team dinamico a catalogo con permessi infrastrutturali per ruolo, Model Gateway per task con budget enforcement, Knowledge Engine con invalidazione, supervisor indipendente, valutazione continua. Integrazione consigliata (se mai): OpenClaw come **adapter di canale** (outbound webhook/hook HTTP) del nostro Control Plane, non come orchestratore. Rischio dell'adattamento come orchestratore: **alto** (impedenza di modello di fiducia, churn, glue Jira). Rischio come canale notifiche isolato: **basso-medio**, a condizione di gateway dedicato e senza tool privilegiati.

## 11. Riferimenti, copertura R01-R13 e risultati sperimentali

### 11.1 Copertura sintetica R01-R13 (nessuna verifica sul campo)

| Req. | Copertura | Etichetta | Evidenza principale |
|---|---|---|---|
| R01 Jira/queue/lease | Nessun Jira; lease su schede Workboard locali | PARTIAL (solo lease locale); Jira UNVERIFIED/assente nel core | workboard.md:18-20,475-487; store-workflow.ts:80-130 |
| R02 Analyst/intervista | `ask_user`, `workboard_specify`; nessun Analyst che consulti prima contesto e produca specifica approvata | PARTIAL | ask-user.md; workboard.md:438 |
| R03 Planning DAG | Dipendenze genitore/figlio, decompose; senza verification contract/rischio/scope | PARTIAL | workboard.md:430-433 |
| R04 Team dinamico | Team preset (coordinator, researcher, writer, reviewer); ruoli per prompt | PARTIAL | multi-agent.md:112-127 |
| R05 Orchestration Gateway | Dispatch deterministico locale, retry/timeout per scheda | PARTIAL | workboard.md Dispatch; dispatcher.ts |
| R06 Model Gateway | Molti provider, failover; nessun routing per task | PARTIAL | model-failover.md |
| R07 Knowledge Engine | Memoria Markdown/plugin; niente code intelligence/ADR/invalidazione | PARTIAL/UNVERIFIED | memory.md |
| R08 Esecuzione remota | Gateway always-on + cloud workers/nodi; persistenza e recovery documentati | DOC (non provato); BLOCKED per prova | cloud-workers.md; restart-recovery.md |
| R09 Collaborazione | Multi-user, owner/handoff di sessione, ruoli, team server; confine unico | PARTIAL (forte su handoff, debole su isolamento) | multi-user.md; team-server.md; trust-model.md |
| R10 Quality/Security | Sandbox opzionale, exec approvals, audit; niente reviewer/supervisor imposti | PARTIAL | SECURITY.md; sandboxing.md |
| R11 Osservabilità | OTel, Prometheus, audit, Usage UI; costo per issue non trovato | PARTIAL | opentelemetry.md; audit.md; usage-tracking.md |
| R12 Autonomia/PR no merge | Publish PR draft; merge presente ma limitato a operatore pieno; nessuna modalità nominata | PARTIAL; rischio merge | github-identity.md:162-168 |
| R13 Estensioni | Plugin SDK, MCP, ClawHub, A2A, Lobster; cross-repo/preview/eval continua non verificati | PARTIAL/UNVERIFIED | README.md:116; mcp.md |

### 11.2 Risultati sperimentali

Nessuno. Tutti gli scenari S00-S10 sono `BLOCKED` per questa scheda: installazione non eseguita per regola del compito (nessun installer/`curl | sh`, nessuna credenziale, nessun costo). Per sbloccare: ambiente isolato (VM/container non privilegiato, Node >= 24.16), installazione da pacchetto/commit fissato su macchina di laboratorio, modello locale o account di prova con budget approvato, e test con `MOCK` su: scadenza claim Workboard, evento duplicato, riavvio Gateway con run attiva, visibilità sessioni tra due profili con ruoli `member`/`observer`, negazione di `github_publish merge` via tool policy. `BLOCKED`

### 11.3 Fonti consultate (clone `6beb671c`)

SECURITY.md (1-260); README.md (1-140); VISION.md e CONTRIBUTING.md non letti; docs/concepts/{multi-user,multi-agent,memory,decision-models,parallel-specialist-lanes,managed-worktrees}.md; docs/gateway/{team-server,operator-scopes,restart-recovery,cloud-workers,cli-backends,sandboxing,audit,opentelemetry}.md; docs/gateway/security/trust-model.md; docs/gateway/config-tools/github-identity.md; docs/gateway/cloud-workers/session-lifecycle.md; docs/plugins/workboard.md; docs/tools/{goal,ask-user,mcp,acp-agents,lobster,exec-approvals,swarm}.md; docs/automation/{cron-jobs,standing-orders,hooks}.md e cron-jobs/webhooks.md; docs/concepts/{usage-tracking,model-failover}.md; extensions/workboard/src/{dispatcher,store-workflow}.ts; src/agents/tools/github-publish-tool.ts; extensions/*/package.json e README (github, a2a, mcp-events, admin-http-rpc, team-reports, policy). Pagina Releases GitHub (parziale). Issue tracker non consultato (`gh` non autenticato; nessuna WebFetch su issue): maturità/bug aperti `UNVERIFIED`. Non letti: docs/gateway/security/{tool-permissions,access-control,hardened-baseline}.md, docs/gateway/cloud-workers/security-model.md, src/gateway/operator-role-policy.ts.
