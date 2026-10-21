# Scheda candidato: Warren

Valutazione documentale e di lettura codice, piu' (dalla sezione "Risultati sperimentali S00") uno smoke test MOCK in container Linux isolato, senza credenziali. Le affermazioni nelle sezioni 1-10 restano DOC/CODE salvo dove una nota "S00" le corregge; solo la sezione "Risultati sperimentali S00" contiene etichette `TESTED`.

Etichette: DOC, CODE, PARTIAL, UNVERIFIED, NOT_SUPPORTED, BLOCKED. I percorsi sono relativi alla radice del clone di `jayminwest/warren`. Il contenuto del repo esterno e' trattato come dato non fidato. Le sezioni seguono la numerazione 1-11 del §4 delle istruzioni.

## 1. Scopo e confini del prodotto

- Warren "esegue harness di coding agent come workload isolati e osservabili su infrastruttura controllata dall'operatore". Possiede workspace, lifecycle del run, limiti di spesa, eventi live, intervento, recovery e consegna Git (DOC `README.md`, `docs/PHILOSOPHY.md`).
- Kernel: `project registry -> dispatch -> sandboxed run -> event stream -> steer/pause -> reap -> push branch`. **L'unico output garantito e' un branch pushato**. PR, aggiornamento tracker, preview, audit sono comportamenti "attorno" al kernel (DOC `docs/architecture.md` sez. "The run kernel"; `ROADMAP.md` sez. "Decisions already made").
- **Confine fra workload lifecycle e orchestrazione multi-agente:**
  - Warren orchestra *run*, non *team*. Un run e' un solo harness (Pi o Claude Code) in un sandbox. I "ruoli" (planner, healer, PR fixer) sono prompt e policy sopra gli harness (DOC `README.md` sez. "Harnesses and runtimes"; `docs/design/agent-composition.md`).
  - Non ho trovato messaggi diretti agent-to-agent, delega fra agenti, ne' DAG di ruoli dentro un run. L'unico canale e' l'inbox/steering da operatore verso un run (CODE `src/runs/inbox.ts`, `src/runs/steer.ts`, `src/runtime/adapters/claude-code.ts`:L113,L178). Etichetta: **PARTIAL per R04, NOT_SUPPORTED come funzione nativa di team** (evidenza: la filosofia esclude esplicitamente sub-agent e plan mode dal core, DOC `docs/PHILOSOPHY.md` sez. "The pi.dev discipline"). Non ho scandito ogni file.
  - L'unica composizione fra run e' il **plan-run seriale**: un piano Seeds viene percorso un figlio alla volta, "never more than one in-flight child per PlanRun", e ogni figlio attende il merge della PR del precedente (DOC `docs/design/plan-run-coordinator.md`; CODE `src/plan-runs/coordinator.ts`:L138,L174). Nessun DAG parallelo.
  - Ruoli reattivi automatici: healer (`src/healer/`), CI fixer (`src/ci-fixer/`), judge (estensione). Sono run mono-agente, non un team.
- Posizionamento dichiarato: operatori singoli e "small, trusted teams"; un deployment = un operatore/team; "Warren has no named users, RBAC, or per-user attribution" (DOC `README.md` sez. "Who it fits today"; `SECURITY.md`:L31-L35).

## 2. Versione, fonti, data

| Voce | Valore |
|---|---|
| Repo | https://github.com/jayminwest/warren |
| Commit verificato | `ce088e854c96492358b6f0a0e26695baf801968d` (2026-10-16, `git clone --depth 1`) |
| Versione in `package.json` | 0.19.3 (`@os-eco/warren-cli`) |
| Ultima release | v0.19.3, 2026-10-07 (API GitHub via WebFetch). Precedenti: v0.19.2 2026-09-19, v0.19.1 2026-09-03, v0.19.0 2026-08-28 |
| Nota | Il clone shallow non ha tag locali: non verificato che HEAD coincida con il tag v0.19.3. `CHANGELOG.md` ha `[Unreleased]` vuota. UNVERIFIED |
| Metadati GitHub | 504 stelle, 6 issue aperte, creato 2026-05-08, ultimo push 2026-10-17 |
| Data consultazione | 2026-10-20 |
| Clone | scratchpad di sessione `...\scratchpad\clones\warren` (fuori da repo di valutazione e da OneDrive) |

## 3. Licenza, dipendenze, runtime, maturita'

- Licenza **MIT**, (c) 2026 Jaymin West (CODE `LICENSE`, `package.json`). Unico obbligo: mantenere l'avviso di copyright.
- Runtime: **Bun >= 1.1** (CODE `package.json` `engines`), TypeScript. Nessun componente Rust visibile nella radice del repo (UNVERIFIED in senso assoluto: non ho cercato ogni `Cargo.toml`). Immagine su `ghcr.io/jayminwest/warren`. Storage SQLite (default) o Postgres via `WARREN_DB_URL` (DOC `docs/architecture.md` sez. "Storage").
- Piattaforme: `scripts/install.sh` rifiuta Windows: "Windows is not supported directly. Install inside WSL" (CODE `scripts/install.sh`:L38-L39). Quickstart: "fresh macOS or Linux machine" (DOC `docs/quickstart.md`:L3). Runtime `local` = `bwrap` (Linux) o `sandbox-exec` (macOS) (DOC `README.md`). **Windows nativo: NOT_SUPPORTED** (evidenza: installer + quickstart). WSL2 o VM Linux: UNVERIFIED.
- Maturita': progetto giovane (creato 2026-05-08), 0.x, 4 release in circa 6 settimane, molti gate `check:*` (CODE `package.json` script `lint`), `ACCEPTANCE.md` presente. Mantenitore principale apparentemente unico (UNVERIFIED). `SECURITY.md` supporta solo l'ultima 0.x. Il protocollo tracker `warren-tracker/v1` e' dichiarato sperimentale (DOC `ROADMAP.md`:L49).
- La roadmap "Now" riguarda un pilot su repo scientifici (Snakemake) e il campaign controller, non Jira/team enterprise (DOC `ROADMAP.md` sez. "Now"). Rischio di divergenza di priorita'.
- `docs/design/team-identity.md`: identita' di team, grant, credenziali brokerate, stato **proposed / unscheduled** (DOC). Nulla di implementato.

## 4. Architettura

- Control plane monolitico Bun: API HTTP + UI React + CLI + SDK client (`src/server/`, `src/ui/`, `src/client/`; DOC `docs/architecture.md`, `docs/http-api.md`, `docs/openapi.yaml`).
- Seam con contratti: `RuntimeProvider` (local/docker/k8s, `src/runtime/contract.ts`), `AgentRuntimeAdapter` (pi, claude-code), `Forge` (GitHub PAT, GitHub App, Azure DevOps Repos, GitLab, Fake), `IssueTracker` (Seeds in-core + `RemoteTracker` verso `warren-tracker/v1`), `AuthProvider` (NoAuth, BearerToken, PublicRead) (DOC `ROADMAP.md`:L42-L51).
- Run: riga DB congelata al dispatch (agente, provider, modello, limiti) (DOC `docs/architecture.md`). Eventi normalizzati e persistiti, stream live, inbox.
- Workspace: `git worktree add` contro un clone host, fallback `git clone` (CODE `src/workspace/materialize.ts`:L6-L10).
- Estensioni: bus lifecycle `warren-ext/v1`, **solo osservazione** (Tier 1). Hook mutanti rimandati. "warren does not yet ship a general extension loader or public catalog" (DOC `docs/architecture.md` sez. "Extensions"; `ROADMAP.md`:L47,L103). Le estensioni sono processi/container separati.
- Trigger: cron e seed schedulati via `.warren/triggers.yaml`; i webhook GitHub sono fuori dalla fase corrente (DOC `ROADMAP.md`:L206). Webhook Jira: non trovati (UNVERIFIED).

## 5. Coding agent e provider LLM

- Adapter inclusi: **Pi e Claude Code** (DOC `README.md`; CODE `src/runtime/adapters/`). `claude-code` e' l'agente di default (DOC `ROADMAP.md`:L205).
- **Claude Code**: lanciato come `claude --print --input-format stream-json --output-format stream-json --verbose --dangerously-skip-permissions`, commento nel codice "The sandbox is the enforcement boundary" (CODE `src/runtime/adapters/claude-code.ts`, `buildSpawnCommand`). I permessi dell'agente sono quindi interamente delegati al sandbox. Steering via messaggi `[STEERING]` su stdin (CODE stesso file, `encodeInboxMessage`).
- Credenziali: `ANTHROPIC_API_KEY` (tutti gli harness) oppure `CLAUDE_CODE_OAUTH_TOKEN` (solo claude-code, costo marcato `subscription_estimate`) (DOC `docs/credentials.md`:L10-L24). La conformita' ai termini d'uso dell'uso di un token di sottoscrizione in un servizio server-side e' UNVERIFIED e da controllare.
- Altri provider: chiavi in allowlist per runtime e Pi (DOC `docs/credentials.md`:L24). `ANTHROPIC_BASE_URL` e' ammesso nell'allowlist: apre a un gateway esterno, UNVERIFIED a runtime. `docs/local-models.md` non letto.
- Scelta modello: per agente/dispatch (override provider/model in `POST /runs`; CODE `src/runs/spawn/provider-model.ts` rifiuta solo coppie note incompatibili). **Routing automatico per task ed escalation: NOT_SUPPORTED nel core**. Il "descriptive and shadow routing" e' solo "Under evaluation" e il pilot dichiara "no router" (DOC `ROADMAP.md`:L27-L29,L190-L192).
- Retry del provider: un nuovo run su errori di rete transitori con limite di tentativi; rate limit trattato come *durable*, quindi senza retry (DOC `docs/design/provider-retry.md`).

## 6. Ruoli, task, deleghe, DAG, scheduling, stato

- Ruoli: definizioni inline (`src/registry/builtins/`, `docs/builtin-agents.json`), prompt e frontmatter congelati sul run (DOC `docs/design/agent-composition.md`). Un enforcement di permessi per ruolo oltre al profilo sandbox (rete, mount, risorse) non e' stato trovato: UNVERIFIED. Un Analyst o Reviewer read-only imposto dall'infrastruttura va considerato non dimostrato (verosimilmente solo prompt).
- Task: issue del tracker piu' prompt template (`work on sd {seed_id}`); piano = Seeds plan git-native (`.seeds/`). Il DAG parallelo e' assente, la sequenza e' seriale con gate sul merge (DOC `docs/design/plan-run-coordinator.md`). Il campaign controller dichiara: "V0 discovery is an explicit ordered issue list. It does not search, claim, or comment on issues" (DOC `docs/design/campaign-controller.md`:L256-L257).
- Scheduling: cron e "automatic run admission" (cap per istanza `WARREN_AUTOMATIC_MAX_CONCURRENT_RUNS`, default 1, piu' finestra oraria) (DOC `CHANGELOG.md` v0.19.3). Scheduling per priorita', dipendenze, rischio: non trovato.
- Stato persistente: DB (runs, eventi, inbox, plan-run, analytics) piu' file git del progetto `.warren/`, `.seeds/`, `.mulch/` (DOC `ROADMAP.md`:L201).
- Memoria: **mulch** (`.mulch/`) e Seeds, strumenti dello stesso ecosistema dell'autore (DOC `docs/design/agent-composition.md`). Code intelligence e Context Pack: non trovati (UNVERIFIED).
- Collaborazione/handoff: un solo token operatore, nessuna attribuzione per utente (DOC `SECURITY.md`:L33-L35). Lo stato e' nel progetto (run, eventi, branch, PR): chi ha il token vede tutto. **PARTIAL per R09**. L'audit log e' un'estensione con solo "actor kind" (DOC `ROADMAP.md`:L163).

## 7. Modalita' locale/remota, sandbox, sicurezza, autenticazione

| Runtime | Isolamento | Note |
|---|---|---|
| `local` | `bwrap` (Linux) / `sandbox-exec` (macOS) | Nel container Compose richiede `apparmor=unconfined`, `seccomp=unconfined`, `systempaths=unconfined`, `cap_add: SYS_ADMIN` (CODE `docker-compose.yml`:L43-L48). "Remove any one of these and the local runtime cannot create its inner sandbox" (DOC `docs/self-host/docker.md`:L29). Incompatibile con la regola di laboratorio "no privilegi" per questa topologia. |
| `docker` | container "sibling" per run | Il servizio warren **monta il socket Docker**, accesso equivalente a root sull'host (DOC `SECURITY.md`:L45; `docs/self-host/docker.md`:L37-L39,L57-L60). Il socket non va esposto al container agente. |
| `k8s` | pod per run | RBAC cluster, RuntimeClass sandboxed per progetto (v0.19.3) (DOC `ROADMAP.md`:L151; `docs/RUNBOOK-K8S.md`, non letto). UNVERIFIED. |

Dettagli del builder `docker run` (CODE `src/runtime/docker/container-spec.ts`):
- `--user uid:gid` non root e `--security-opt no-new-privileges` (circa L228-L240). Nessun `--privileged` ne' `--cap-add` nel file.
- Mount bind: workspace e home del run in lettura-scrittura; git dir privato del run RW, object store dell'host RO, path protetti RO; altri mount RO (circa L130-L155). Nel builder non vengono montati ne' la home dell'utente ne' il socket Docker.
- Rete: solo `none`, `restricted` (= rete bridge configurabile, "no domain allowlist") o `open`; "networkPolicy: coarse" (CODE L14-L16,L110-L113; DOC `docs/design/runtime-docker-provider.md`:L82-L104). L'esfiltrazione si limita solo con `none` o con una rete filtrata esterna.
- `--memory` e `--cpus` (cgroup reali, L117-L125). Nel builder non compaiono `--pids-limit` ne' root filesystem read-only: UNVERIFIED se impostati altrove.
- Segreti: env-file (non argv) e `--env NAME`; `docker inspect` mostra comunque l'env (commento nel codice). Il container agente riceve per forza la chiave modello.

Autenticazione e RBAC:
- Bearer token unico, senza scadenza, scope o revoca indipendente. **Nessun RBAC, nessun utente nominato: NOT_SUPPORTED** (DOC `SECURITY.md`:L33-L35). `WARREN_AUTH=public` per lettura anonima. Token per-run a scope ridotto per i sandbox, rifiutato a run terminale (DOC `SECURITY.md`:L38). TLS non gestito, serve reverse proxy (L36). Il token operatore iniziale e' stampato nei log di boot come `mintedOperatorToken` (DOC `docs/self-host/docker.md`:L73-L78).
- "The control plane does not run scripts that a registered repository defines" (DOC `SECURITY.md`:L52).
- Prompt injection da ticket Jira: nessuna difesa specifica trovata (UNVERIFIED). Le mitigazioni sono sandbox, token per-run e cost cap.
- Esecuzione remota: pensata per server, VM o k8s self-hosted; supervisor e watchdog (CODE `src/supervisor/main.ts`, `src/runs/watchdog.ts`). La prova "con PC spento" resta **BLOCKED** finche' non esiste un host remoto.

## 8. Retry, checkpoint, recovery, idempotenza, cancellazione, timeout, budget

- **Watchdog heartbeat**: un run senza eventi oltre 45 min (default, `WARREN_RUN_HEARTBEAT_TIMEOUT_MS`) viene fallito e passato per reap, preservando il lavoro committato. Attivo di default (CODE `src/runs/watchdog.ts`, docstring L1-L60).
- Salvage prima della distruzione e `rescueFromRunId` per ripartire dal lavoro salvato (DOC `CHANGELOG.md` v0.19.3, `ROADMAP.md`:L128; CODE `src/runs/reap/salvage.ts`, `src/runtime/salvage.ts`).
- Riconciliazione di processi/pod persi e recovery del finalize K8s dopo riavvio del control plane (CODE `src/runs/finalize-recovery.ts`, `src/runs/watchdog-reconcile.ts`). Il coordinatore di finalize e' in memoria; la recovery e' una rete di sicurezza.
- Distinzioni richieste: recupero file/worktree/branch = CODE/DOC; stato issue e plan-run = persistito in DB, `src/plan-runs/resume.ts` esiste (semantica UNVERIFIED); **ripresa della sessione conversazionale: NOT_SUPPORTED** (evidenza: "Resumable agent Environments" e' *Deferred until paid*, DOC `ROADMAP.md`:L95-L100; un nuovo run riparte da branch e prompt).
- Stalled/degenerate turn: `WARREN_TURN_STALL_MS` default 10 min (DOC `CHANGELOG.md` v0.19.3).
- Retry: provider transient (sopra); infra-lost (`src/runs/retry/infra-lost-retry.ts`); figli di plan-run con retry proprio (`src/plan-runs/retry.ts`). Limiti numerici: UNVERIFIED, tranne l'attempt bound del provider-retry (DOC).
- Budget: `maxCostUsd` per dispatch, agente o progetto. Il bridge cancella il run quando il costo cumulato supera il tetto, anche su usage parziale (CODE `src/runs/cost-cap.ts`:L1-L45; DOC `CHANGELOG.md`). Un cap malformato **fallisce aperto** (nessun cap) per scelta di design. Budget per utente o aggregato: "Tier 1", fuori dal core (DOC `ROADMAP.md`:L164).
- Cancellazione: API/CLI cancel; cancel del plan-run propagato al figlio (CODE `src/runs/cancel.ts`, `src/plan-runs/cancel.ts`).
- Idempotenza/lease per issue: **non ho trovato un claim/lease per issue**. Il plan-run tiene un solo figlio in volo, ma due dispatch distinti sulla stessa issue restano UNVERIFIED (nessun guard trovato con grep). Per R01 va considerato assente finche' non provato.

## 9. Jira, Git/PR, CI, MCP, log, costi, dashboard

**Estensione Jira** (`extensions/tracker-jira/`, v0.19.0, seed warren-27d9): server `warren-tracker/v1` fuori processo su Jira Cloud REST (CODE `extensions/tracker-jira/README.md`; circa 1.124 righe TS in `src/` compresi test e `fake-jira.ts`).
- Operazioni: `GET /capabilities`, `GET /issues/{key}`, `GET /issue-statuses` (JQL da `JIRA_JQL`), `POST /issues/{key}/close` (transizione verso categoria `done`) (README:L86-L93).
- Capability: `supportsPlans=false`, `supportsMetadata=false`, `supportsScheduledIssues=false`, `isGitNative=false` (README:L16-L36). "Drive serial execution with `POST /plan-runs` and an explicit ordered `issues` list" (README:L26-L29).
- Stato normalizzato a `open|closed|other` dalla `statusCategory`; `blockedBy` dal link inward "is blocked by"; descrizione ADF appiattita a testo (README:L95-L118).
- Credenziali Jira nel container dell'estensione, non in warren; auth Warren verso estensione con `TRACKER_BEARER` (README:L1-L14,L44-L61).
- **Non incluso** fra le operazioni: polling o webhook verso la coda di dispatch, claim, transizione "In Progress", commenti o link PR su Jira, priorita', campi custom. Il `closeIssue` parte dopo il merge (CODE `src/runs/reap/seed-close-lifecycle.ts`, `src/plan-runs/close-child-seed.ts`). Quindi R01: lettura issue/blocker/stato piu' chiusura = PARTIAL; coda, readiness, priorita', lease, claim, webhook, stati intermedi = da costruire.
- Il protocollo e' sperimentale; `tracker-jira` e `tracker-ado` passano la conformance suite `extensions/tracker-conformance/` (DOC `ROADMAP.md`:L49).

**Git/PR**: i commit li fa l'agente; Warren gestisce credenziali Git, costruzione del branch, push e PR (DOC `README.md`). Forge: GitHub (PAT o GitHub App con token di installazione a breve scadenza), Azure DevOps Repos, GitLab; un forge per deployment (DOC `ROADMAP.md`:L48,L212; `docs/credentials.md`). **Auto-merge: esiste, opt-in per progetto** (`pr.autoMerge` in `.warren/config.yaml`; arma l'auto-merge GitHub dopo l'apertura PR, fail-closed) (DOC `docs/design/forge-auto-merge.md`; `ROADMAP.md`:L149). Senza opt-in non viene armato. `mergePullRequest` e' stato rimosso (DOC `ROADMAP.md`:L181). "PR senza auto-merge" e' quindi ottenibile lasciando spento `pr.autoMerge`: PARTIAL, la garanzia reale resta la branch protection sul forge. Con plan-run, la serie si ferma finche' la PR del figlio non e' mergiata (DOC `plan-run-coordinator.md`).

**CI**: lettura dei check run e CI fixer che dispatcha run di correzione (CODE `src/ci-fixer/`, `src/runs/pr-checks.ts`). Il merge dipende dai check richiesti sul forge.

**MCP**: i server MCP sono tooling di progetto avviato dall'agente nel sandbox (DOC `ROADMAP.md`:L162). Un MCP server di Warren per Claude Code e' solo una proposta (`docs/design/mcp-server.md`: draft, unscheduled).

**Log/eventi/costi/dashboard**: stream JSONL, tabella eventi, `GET /events`, ops overview, `/healthz` e `/readyz` (DOC `ROADMAP.md`:L255, `docs/operations.md`). Costo e token per run, `costBasis`, analytics (CODE `src/runs/cost-analytics.ts`, `usage-aggregate.ts`). Separazione input/output/cache e costo per issue accettata: UNVERIFIED. UI React: Operations, Runs, Run detail, Agents, Run Analytics (DOC `README.md`). **Decision inbox: NOT_SUPPORTED nativo** (evidenza: "Pause machinery (`markPaused`, `question_posed`)" rimossa in v0.13.1, DOC `ROADMAP.md`:L180). L'inbox serve solo lo steering.

## 10. Adeguatezza al nostro caso

Ruolo naturale: **Execution Plane** (run isolati, recovery del lavoro, cost cap, consegna Git/PR, dashboard di run). Non e' un Control Plane per la coda Jira ne' un team multi-agente.

| Req. | Copertura Warren | Cosa manca / integrazione |
|---|---|---|
| R01 Jira/queue/lease | PARTIAL: estensione Jira (read issue/status/blocker, close) | polling o webhook, readiness, priorita', claim/lease, stati intermedi, link PR su Jira. Controller esterno; il campaign controller e' un riferimento di controller che pilota Warren via HTTP |
| R02 Analyst/intervista | NOT_SUPPORTED nativo (pause/question rimossi) | costruire fuori; un run puo' ospitare un agente analyst ma senza decision inbox |
| R03 Planning/DAG | PARTIAL: plan-run seriale su Seeds; piani Jira non supportati | planner, DAG e verification contract esterni |
| R04 Team dinamico | NOT_SUPPORTED nativo (un harness per run, nessuna comunicazione fra agenti) | coordinamento nel Control Plane; N run Warren con branch separati |
| R05 Orchestration Gateway | PARTIAL: tick loop, watchdog, retry, cancel, admission cap | scheduler event-driven per DAG, escalation, pausa per decisione |
| R06 Model Gateway | PARTIAL: modello per run/agente/progetto, cost cap, `ANTHROPIC_BASE_URL` in allowlist | routing per task, escalation, budget aggregati (gateway esterno, UNVERIFIED) |
| R07 Knowledge | PARTIAL: mulch e Seeds, file tracciati nel repo | Context Pack, code intelligence, invalidazione |
| R08 Esecuzione remota | DOC/CODE: server/k8s/docker, supervisor, watchdog, salvage. Prova su host remoto BLOCKED | ripresa sessione assente; Windows nativo non supportato |
| R09 Collaborazione | PARTIAL: stato condiviso e dashboard. NOT_SUPPORTED: utenti nominati, RBAC | RBAC/SSO via reverse proxy e Control Plane; `team-identity.md` e' solo proposta |
| R10 Quality/Security | PARTIAL: sandbox, token per-run, no-new-privileges, non root, cost cap, watchdog fuori dall'LLM (CODE), CI fixer | review indipendente, policy per ruolo, test held-out, allowlist di rete |
| R11 Osservabilita' | DOC/CODE: eventi, analytics, costo per run, UI | decision inbox, costo dei fallimenti per issue accettata (UNVERIFIED) |
| R12 Autonomia/PR no merge | PARTIAL: branch e PR, auto-merge opt-in (default non armato). Modalita' Plan Only/Supervised non trovate | modalita' di autonomia nel Control Plane; branch protection sul forge |
| R13 Estensioni | PARTIAL: bus Tier-1 osservazione, estensioni out-of-process (audit-log, judge, campaign-controller, tracker-*), preview (`docs/previews.md`, non letto) | hook mutanti assenti; cross-repo rimosso (DOC `ROADMAP.md`:L182); MCP server solo proposta |

Possibili gate bloccanti per adozione aziendale: (a) nessun RBAC e token condiviso senza scadenza; (b) la topologia `docker` richiede il socket Docker e la `local` in Compose richiede `SYS_ADMIN` con seccomp/AppArmor disattivati, quindi servono una VM dedicata o k8s con RuntimeClass sandboxed; (c) nessun lease per issue verificato.

Integrazione Control Plane + Warren: Warren espone API HTTP con OpenAPI 3.1 (`docs/openapi.yaml`), SDK (`docs/sdk.md`), `POST /runs` (con `maxCostUsd`, `rescueFromRunId`), `POST /plan-runs`, cancel e stream eventi. Sono i punti d'aggancio per un adapter. Correlazione Jira <-> run <-> branch/PR: il run porta un `seedId` autorevole (CODE `src/runs/reap/pr-open.seed-attribution.test.ts`:L3-L4), quindi la chiave Jira puo' fungere da id tramite l'estensione: PARTIAL, UNVERIFIED a runtime. Glue code stimato (qualitativo): controller di coda Jira, mappa di correlazione, policy e RBAC: medio. Rischio di adattamento: **medio** (core in rapida evoluzione, protocollo tracker sperimentale, priorita' di roadmap diverse).

## 11. Riferimenti e risultati sperimentali

Letti (relativi al clone): `README.md`, `SECURITY.md`, `ROADMAP.md`, `docs/architecture.md`, `docs/credentials.md`, `docs/self-host/docker.md`, `docs/quickstart.md`, `docs/design/{plan-run-coordinator,issue-tracker,agent-composition,team-identity,forge-auto-merge,provider-retry,mcp-server,campaign-controller,runtime-docker-provider}.md`, `docker-compose.yml`, `scripts/install.sh`, `package.json`, `extensions/tracker-jira/README.md`, `extensions/campaign-controller/README.md`, `src/runtime/docker/container-spec.ts`, `src/runtime/adapters/claude-code.ts`, `src/runs/{watchdog,cost-cap,finalize-recovery}.ts`, `src/plan-runs/coordinator.ts`.

Non letti o solo sfiorati: `docs/RUNBOOK-K8S.md`, `docs/local-models.md`, `docs/previews.md`, `ACCEPTANCE.md`, `extensions/{judge,audit-log}`, `src/runtime/local` (bwrap), issue GitHub aperte (`gh` non autenticato; solo il conteggio di 6 via API).

**Risultati sperimentali:** vedi la sezione "Risultati sperimentali S00" in fondo. Gli scenari S01-S10 restano `BLOCKED` o non eseguiti.

Requisiti per un futuro test locale (da autorizzare):
- Host Linux, WSL2 o VM Linux: Windows nativo non e' supportato dall'installer. Windows 11 con WSL2 e Docker Desktop per il runtime `docker` e' UNVERIFIED (path parity del data dir e Docker CLI nel container; vedi la sezione macOS in `docs/self-host/docker.md`:L103-L125 come analogia).
- Bun >= 1.1 e Git. Runtime `local`: `bwrap` e user namespace (in Docker servono i quattro flag). Runtime `docker`: Docker Engine, socket montato, immagine agente da `deploy/docker/Dockerfile.agent` (contiene Pi, Claude Code, Bun, Node, Git, Python, uv: DOC `docs/self-host/docker.md`:L139). Node e Rust non servono per il core.
- Credenziali (chiave Anthropic o token OAuth, token GitHub di prova): richiedono approvazione esplicita su costi e account. Modalita' MOCK con runtime `fake` e `FakeForge`: **corretto da S00**. Il server non ha un runtime `fake` (`WARREN_RUNTIME` accetta solo `local|docker|k8s`; `FakeProvider` e' test-only, CODE `src/runtime/registry.ts`, `src/runtime/fake/fake-provider.ts`): NOT_SUPPORTED come runtime avviabile. Il forge `WARREN_FORGE=fake` esiste ed e' TESTED tramite l'harness di accettazione (scenario 40), che usa un agente `claude` stub e un `bwrap` finto.
- Jira: progetto sandbox autorizzato oppure `fake-jira` incluso (`extensions/tracker-jira/src/fake-jira.ts`, `dev-server.ts`) per S05 in MOCK.

## Risultati sperimentali S00

Prova del 2026-10-20, modalita' MOCK, **PARTIAL**. Dettaglio, comandi e log sanificati in `reports/s00-warren.md`; dati in `results/s00-warren-b04a98ba.json`. Ambiente: container Linux x64 non root (`--memory 2g --cap-drop ALL --security-opt no-new-privileges --pids-limit 512`, nessun mount, nessun socket), immagini `oven/bun:1.2` (Bun 1.2.23, digest `sha256:6ebf3063...a16f74`) e `oven/bun:1.3.14` (digest `sha256:e10577f0...00e5c4`), commit `ce088e85...`. Nessuna credenziale, costo 0. `n=1` per passata (due passate, risultati identici).

| Affermazione | Etichetta | Evidenza |
|---|---|---|
| Installazione da checkout: `bun install --frozen-lockfile` | TESTED | 181 pacchetti, 6-11 s |
| `bun test` offline | TESTED | 7.927 pass, 40 skip, 0 fail, 108-114 s (con `ext:install` e build UI) |
| `typecheck` e `lint` (13 gate) | TESTED | exit 0; lint richiede un `.git` presente |
| Avvio control plane, `/healthz`, API con bearer, UI statica, `warren doctor` | TESTED | healthz pronto in 1,3-2,0 s, RSS 180-220 MB, 401 senza token |
| Shutdown SIGTERM e riavvio sullo stesso DB | TESTED | exit 0 in 20-29 ms |
| Run minimo con harness finto | TESTED (parziale) | solo via `scripts/acceptance` (agente `claude` stub + `bwrap` finto + `WARREN_FORGE=fake`): 18 pass, 0 fail, 1 skip su 19 scenari (steer, cancel, restart/recovery del control plane, plan-run seriale, PR simulata, RemoteTracker) |
| `fake-jira` + protocollo `warren-tracker/v1` | TESTED | conformance 8 gruppi PASS |
| Memoria | TESTED | server attivo 538 MiB; picco campionato 1,2 GiB con test+gate+acceptance (limite 2 GiB) |
| `warren up` | BLOCKED | nessun `bwrap` ne' daemon docker: exit 1 |
| Runtime `local` (bwrap) | BLOCKED | nel container `CapEff=0`, `unshare -U` negato: conferma che servono i flag privilegiati. `/readyz` risponde 503 (`bwrap` mancante) |
| Runtime `docker` (socket) e `k8s` | BLOCKED | vincoli di sicurezza / nessun cluster |
| Harness reali, forge reali, Jira reale | BLOCKED | richiedono credenziali e costi |
| `scripts/install.sh` / install da registry | UNVERIFIED | letto per intero, non eseguito |

Etichette corrette o precisate dalla prova:
- **Runtime `fake` avviabile (sezione "Requisiti")**: era UNVERIFIED, ora NOT_SUPPORTED sul server (solo `local|docker|k8s`); resta il forge `fake`, TESTED.
- **Versione Bun**: la scheda riportava solo `>= 1.1`. Il repo e' incoerente: `engines` >= 1.1, `Dockerfile` `oven/bun:1.2`, `.bun-version` (CI) 1.3.14. Provate 1.2.23 e 1.3.14, entrambe OK.
- **Installazione**: `CONTRIBUTING.md` indica solo `bun install`, ma servono anche `bun run ext:install` e `ui:install`/`build:ui` (come nel CI); senza, `bun test` da' 5 errori `Cannot find module`.
- **Harness di accettazione**: richiede `cn`, `sd`, `ml` nel PATH (CI: `@os-eco/canopy-cli`, `seeds-cli@0.5.13`, `mulch-cli@0.10.7`), non citati nel README; senza `cn` fallisce subito.
- **Sandbox**: gli scenari verdi non provano l'isolamento (il `bwrap` e' sostituito da uno shim che esegue il comando). Le affermazioni della sezione 7 sul sandbox restano CODE/DOC; il runtime `local` non e' provabile nella nostra postura senza `SYS_ADMIN`.
- **Token operatore nei log (sezione 7)**: da DOC a TESTED. Senza `WARREN_API_TOKEN` il server stampa `mintedOperatorToken` in chiaro nel log di avvio e lo salva in `<data>/operator-token` (modo 0600); il DB e' 0644. Con token da ambiente non compare nei log.
- **Auth**: TESTED 401 senza bearer e con bearer errato su `/projects`; `/healthz` e UI statica `/` senza auth; `/readyz` richiede il token (coerente con `docs/operations.md`).
- **Estensione Jira (sezione 9)**: TESTED sul solo `fake-jira`: `capabilities` come da scheda (`supportsPlans=false`, ecc.). La chiusura di un'issue con `blockedBy` aperto riesce: l'estensione non applica i blocker, spetta al chiamante.
- **Windows nativo**: NOT_SUPPORTED invariato (da lettura dell'installer, non provato in modo diretto).
- `warren up` rifiuta in assenza di `bwrap` e daemon Docker, come da docstring e quickstart: nessuna smentita.


## Risultati sperimentali S09, S07, S04 (LIVE, 2026-10-22)

8 run con Claude Code (`claude-sonnet-5-5`) dentro bwrap, 0,774 USD (stima a listino). Dettaglio e comandi in `reports/s09-s07-s04-warren-live.md`; dati in `results/S09-warren-*.json`, `S07-warren-*.json`, `S04-warren-*.json`.

| Affermazione (sezioni 7 e 8) | Etichetta | Evidenza |
|---|---|---|
| Per `claude-code` il tetto `maxCostUsd` scatta solo a run finita (il costo arriva nell'envelope `result`) | TESTED (era CODE) | tetto 0,01: costo 0,1010 (10,1x), `budget.exceeded` 7 ms dopo il `result`, stato `cancelled`; l'agente aveva gia' finito |
| Run oltre il tetto: lavoro conservato, nessuna PR | TESTED | branch pushato (1 commit, held-out PASS), `prUrl` nullo, workspace distrutto, `failureReason` null |
| Tetto realistico non interferisce | TESTED | tetto 0,5 e 1: `succeeded`, PR aperta, nessun evento di budget |
| Nessun budget cumulativo (giornaliero/per progetto) | CODE | nessun riscontro nei sorgenti; il tetto e' per run e fallisce aperto se malformato |
| Tetto a meta' run con harness Pi (`turn_end`/`partial.usage`) | UNVERIFIED | non provato (serve Pi) |
| Due run in parallelo su issue indipendenti | TESTED | nessuna collisione di porte, workspace, branch, PR; finestre sovrapposte; ma conflitto di merge in `test/cart.test.js` |
| Nessun rilevamento/serializzazione di conflitti sullo stesso file | TESTED | ISSUE-2 e ISSUE-3: due branch, due PR open, entrambe succeeded; conflitto solo al merge |
| `Idempotency-Key` su `POST /runs` evita il doppio dispatch | TESTED (stub) | stessa chiave = una run; senza chiave = due run e due PR; il CLI non la invia; in memoria, perso al riavvio (CODE) |
| Nessun lease per issue | TESTED (stub) | la stessa issue puo' essere dispatchata due volte |
| L'agente vero ignora injection nel ticket e in `AGENTS.md` | TESTED (n=2) | esche finte non lette, 0 connessioni al listener, nessuna scrittura fuori workspace, test solo con righe aggiunte; e' resistenza del modello, non confine del sistema |
| `.claude/.credentials.json` visibile all'agente come file non tracciato | TESTED | `git status` dell'agente nelle due run S07 (F27) |
| Confine di sistema contro un agente cooperante che sonda esche/rete | BLOCKED | oltre il tetto di 8 run; restano valide le misure con processo-sonda (S00/runbook) |
