# Confronto — due matrici distinte

Data: 2026-10-20. **Nessun candidato è stato installato né eseguito.** La prima matrice descrive ciò che è stato letto (documentazione e sorgente, SHA nelle schede); la seconda descrive ciò che è stato provato. Le due cose non vanno confuse.

Versioni verificate (consultazione 2026-10-20):

| Candidato | Versione / commit | Licenza |
|---|---|---|
| Paperclip | master `05f7079`, ultimo tag stabile v2026.1012.0 | MIT |
| Paseo (daemon) | v0.12.0 `cafe4b0` | Apache-2.0 |
| Paseo Hub | v0.10.0 `38bfafd` (dichiara «early development, expect breaking changes and data loss») | Apache-2.0 |
| OpenClaw | main `6beb671`, release 2026.10.5 | MIT |
| Warren | 0.19.3 `ce088e8` (HEAD, tag non verificabile nel clone shallow) | MIT |
| Gas Town | `649b832` (2026-07-23), ultima release v1.2.1 | MIT |

## 1. Copertura funzionale R01–R13 (letta, non provata)

Legenda: **N** nativo (DOC/CODE), **P** parziale o via configurazione, **A** assente (evidenza trovata), **?** non verificato, **BL** baseline Claude Code. Per BL le colonne sono `?`: il documento (§13) dice che deve ancora dimostrarle, e non sono state provate.

| Req. | Paperclip | Paseo + Hub | OpenClaw | Warren | Gas Town | BL |
|---|---|---|---|---|---|---|
| R01 Jira e coda con lease | A: nessun connettore Jira (spec in bozza); checkout atomico per run, non lease con TTL | A: Jira non supportato; dispatch idempotente per `deliveryKey` (P) | P: Workboard (plugin spento) ha claim con TTL ma su schede locali; Jira assente | P: estensione Jira sperimentale (get, stati JQL, blockedBy, close); niente webhook, lease, priorità | A: nessuna integrazione Jira | ? |
| R02 Analyst e intervista | P: approvazioni, nessun Analyst | A | P: `ask_user`, `workboard_specify` | A | A | ? |
| R03 Piano e DAG | P: piano come documento, DAG costruito dagli agenti | A (docs) | P: dipendenze e decompose, niente verification contract | P: plan-run seriale, nessun DAG | P: `convoy stage` calcola wave (solo design doc) | ? |
| R04 Team dinamico | P: ruoli da azienda (CEO, CMO…) | P | P: preset coordinator/researcher/writer/reviewer | A | P: Mayor, Polecat, Witness, Refinery | ? |
| R04.3 Permessi di ruolo dell'infrastruttura | P: governance applicata dal runtime, ma permessi agente ampi | A | A: ruoli non sono confini di sicurezza | A | A: vincoli da prompt e guardie su pattern | ? |
| R05 Scheduler deterministico | P: agenti-manager | P: dispatcher a eventi | P: dispatch locale, batch piccolo | P | P: coordinamento affidato a LLM | ? |
| R06 Model gateway e budget | P: modello per agente, budget hard stop | P: modello statico, nessun budget | P: provider e failover, niente routing per task | P: cost cap per run | P: routing per ruolo, nessun enforcement budget | ? |
| R07 Knowledge | P: memoria sperimentale | A | P: memoria in Markdown | P: mulch/Seeds | P | ? |
| R08 Esecuzione remota e recovery | P: runtime esterno (sandbox via plugin provider) | P (forte): daemon e Hub | P: cloud worker documentati | P (forte): watchdog, salvage, riconciliazione; sessione non ripresa | P | ? |
| R09 Collaborazione e audit | N (migliore): più utenti con ruoli, audit | P: RBAC base owner/admin/member | P: handoff di sessione tra persone che si fidano | A: un solo bearer token | A | ? |
| R10 Quality e Security | P: gateway MCP, preset low_trust; niente gate CI | P: token GitHub a scope e scadenza 1 h; niente sandbox | P: sandbox opzionale, default permissivi | P: container non-root, ma socket Docker e `SYS_ADMIN` | P: guardie su comandi, `bypassPermissions` | ? |
| R11 Osservabilità e costi | N (migliore): budget, audit, costi | P | P: OpenTelemetry, Prometheus | P | P: `gt costs` con prezzi fermi a gen 2025 | ? |
| R12 PR senza merge automatico | P: nessuna policy, serve branch protection | P: serve branch protection | A: `github_publish` include il merge | P: `pr.autoMerge` opt-in, spento di default | A: merge diretto di default | ? |
| R13 Estensioni | P | P | P: plugin, MCP, A2A | P: cross-repo rimosso | P | ? |

Fatti verificati direttamente nei sorgenti il 2026-10-20 (etichetta `CODE`):
- Warren monta `/var/run/docker.sock` per il runtime `docker` (`docs/design/runtime-docker-provider.md:21`) e lancia Claude Code con `--dangerously-skip-permissions` (`deploy/docker/Dockerfile.agent:120`).
- Gas Town: il Refinery fa merge diretto per default (`internal/refinery/engineer.go:163`, `internal/config/types.go:1340`); il merge via PR si attiva con `merge_strategy=pr` (`engineer.go:636`).
- Paperclip: `dangerouslySkipPermissions` ha default `true` (`packages/adapters/claude-local/src/index.ts:71`).
- OpenClaw: `github_publish` ammette `action: "merge"` (`docs/gateway/config-tools/github-identity.md:162`).

## 2. Risultati sperimentali S00–S10

| Scenario | Esito | n | Ambiente | Nota |
|---|---|---|---|---|
| S00 Installazione e smoke | `BLOCKED` per tutti i candidati | 0 | — | Nessuna installazione autorizzata. Docker spento; Warren e Gas Town richiedono WSL2 o Linux (Windows nativo non supportato). Bun, Go, Dolt, tmux non presenti |
| S01 Issue semplice → PR | `BLOCKED` (LIVE) | 0 | — | Serve budget approvato. Harness `scripts/evaluate.mjs` pronto e verificato (PASS con fix, FAIL senza) |
| S02 Requisiti incompleti | `BLOCKED` | 0 | — | Serve LIVE. ISSUE-5 pronta come input |
| S03 Planning e ruoli | `BLOCKED` | 0 | — | Serve LIVE |
| S04 Parallelismo e collisioni | `PARTIAL` solo per il controller di riferimento | 1 | locale, MOCK | Il mock Jira impedisce il doppio claim (test **TESTED**, 7/7). Nessun candidato provato; ISSUE-2/3 sono pronte come conflitto |
| S05 Coda continua e Jira | `PARTIAL` solo per il controller di riferimento | 1 | locale, MOCK | Issue bloccata e ambigua mai scelte, evento duplicato idempotente, riconciliazione lease dopo riavvio: **TESTED** sul mock. Jira sandbox `BLOCKED` |
| S06 Crash e recovery | `PARTIAL` solo per il controller di riferimento | 1 | locale, MOCK | Riavvio dell'orchestratore con lease scaduta: **TESTED** sul mock. Kill del worker, provider e CI: `BLOCKED` |
| S07 Sicurezza e blast radius | `BLOCKED` | 0 | — | Serve Docker o VM. Analisi solo documentale nel threat model |
| S08 Memoria e handoff | `BLOCKED` | 0 | — | Serve LIVE |
| S09 Modelli, costi e budget | `BLOCKED` | 0 | — | Serve LIVE; token e costi restano `null` |
| S10 Cross-repo e UI | `BLOCKED` (secondario) | 0 | — | Non bloccante per il report |

Il «mock Jira» è un controller di riferimento scritto da noi (92 righe, più 71 di test): misura la complessità dell'adapter richiesto, **non** una capacità dei candidati.

## 3. Rubrica pesata

Nessun criterio è valutabile in modo difendibile: i voti 0–5 richiedono evidenza sperimentale, che non esiste. Riportare numeri sarebbe arbitrario. Indicazioni documentali, senza punteggio e con confidenza `bassa`:

| Criterio (peso) | Indicazione dalla sola lettura |
|---|---|
| Correttezza del codice e PR (20%) | non valutabile |
| Recovery, persistenza, idempotenza (20%) | non valutabile. Lettura: Warren (watchdog, salvage, riconciliazione) e Paseo Hub (dispatch idempotente) hanno il meccanismo più chiaro; nessuno riprende la sessione conversazionale |
| Sicurezza, policy, controllo umano (20%) | non valutabile. Lettura: tutti i candidati partono da default permissivi (`bypassPermissions`, `--dangerously-skip-permissions`, socket Docker). Paperclip ha la governance più completa |
| Workflow Jira → PR e autonomia della coda (15%) | non valutabile. Lettura: nessun candidato lo copre nativamente |
| Multi-agente e handoff (10%) | non valutabile. Lettura: Paperclip e OpenClaw i più avanzati sull'handoff tra persone |
| Costi e prestazioni per issue accettata (10%) | non valutabile |
| Semplicità, maturità, manutenzione (5%) | non valutabile. Lettura: Hub dichiara perdita di dati possibile; Warren è del 2026-05; Gas Town ha una catena di dipendenze pesante |

## 4. Gate bloccanti per l'adozione aziendale (stato da lettura)

| Gate | Paperclip | Paseo+Hub | OpenClaw | Warren | Gas Town |
|---|---|---|---|---|---|
| Perdita di segreti | non verificato | non verificato | rischio: un solo confine di fiducia per Gateway | non verificato | non verificato |
| Esecuzione non confinabile | rischio: adapter locali non sandboxati | rischio: nessuna sandbox | rischio: sandbox spenta di default | **rischio documentato**: socket Docker (root equivalente) o `SYS_ADMIN` senza seccomp | rischio: `bypassPermissions` senza confini di infrastruttura |
| Duplicazione task | serve lease | idempotenza per execution id (P) | lease solo locale | nessun lease per issue | non verificato |
| Arresto affidabile | non verificato | non verificato | non verificato | cancellazione e watchdog (P) | E-stop esistente, non provato |
| Impedire merge non autorizzati | solo branch protection | solo branch protection | **da disattivare** | opt-in spento | **merge diretto di default** |
| Verifica con CI esterna | non nativa | non nativa | non nativa | non nativa | non nativa |

Nessun gate è stato verificato in esecuzione. Un `rischio` indica una configurazione di default letta nel codice, non un exploit dimostrato.
