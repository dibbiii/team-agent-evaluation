# Raccomandazione finale

Data: 2026-10-21. **Stato: raccomandazione motivata ma ancora provvisoria**, con confidenza `media` sui rischi di sicurezza e `bassa` sul confronto di capacità. Fondata su: lettura di documentazione e codice dei cinque candidati; smoke test S00 in container isolati (nessun LLM, nessuna credenziale); baseline Claude Code LIVE (9 run valide); controller di coda di riferimento provato. **Nessun candidato ha prodotto una PR con un agente reale**: gli scenari che lo richiedono (S01–S03, S08) sono `BLOCKED` per i candidati.
Il giudizio «vince la PoC» e il giudizio «adatto alla produzione» sono tenuti separati (punto 5).

## 1. Executive summary

- **Nessuno dei cinque candidati soddisfa da solo i requisiti MUST.** Mancano, per tutti: coda Jira con lease (R01), DAG con campi strutturati (R03), permessi di ruolo imposti dall'infrastruttura (R04.3), garanzia di nessun merge automatico (R12.2) e verifica con CI esterna (R10.6).
- **I default di sicurezza sono permissivi in tutti, e lo abbiamo provato, non solo letto:** Gas Town `bypassPermissions` nei 7 `settings.json` generati, dashboard senza autenticazione e `merge_strategy=direct`; OpenClaw con sandbox spenta ed exec `full` e `ask=off`, e un agente che legge la sessione di un altro (`visibility=all`); Paperclip in `local_trusted` senza login; Warren con token operatore in chiaro nel log di avvio senza `WARREN_API_TOKEN`.
- **Risultato più pesante: in Paperclip il budget non è un controllo di sicurezza.** L'issue #16935 è stata **riprodotta** da noi: un agente senza permessi alza il proprio budget (5.000 → 99.999.999 centesimi) e cambia la propria config, e anche budget e config di altri agenti, sul commit studiato e sulla release npm `2026.1012.0`. Il budget e i permessi vanno quindi tenuti **fuori dalla portata dell'agente**.
- **Paseo Hub è il candidato con la meccanica di dispatch meglio provata** (RBAC verificato, idempotenza con 6 richieste concorrenti = 1 run, coda con daemon offline, SIGKILL con run in volo senza duplicati). Ma v0.10.0 ha un bug provato (`manual-runs` risponde 500 dopo il riavvio) e SIGTERM non termina con un daemon connesso (#147 riprodotta). Non è un orchestratore del ciclo di sviluppo.
- **La baseline regge, con un limite.** Claude Code da solo: 9 run su 9 PASS, ~0,05 USD e ~37 s per issue, ma su una fixture troppo facile. Con un'issue ambigua (S02) implementa con assunzioni dichiarate invece di chiedere (3/3): per R02 serve una readiness imposta dal controller. Il benchmark attuale **non può dimostrare alcun vantaggio di un orchestratore**.
- **La parte che manca a tutti è piccola e sotto il nostro controllo:** coda con lease, idempotenza, riconciliazione, rollback. Il controller di riferimento (131 righe, più 150 del finto Jira REST e 118 dello script che crea le issue) ha 7 test sul mock REST di Jira più 7 sul mock in-process, tutti PASS.
- **Indicazione:** partire dallo stack minimale (Opzione A), con il controller e le policy fuori dall'agente. Warren come Execution Plane (Opzione B) solo se la baseline non regge run isolate e recovery su una fixture più dura. Paperclip + Warren (Opzione C) rimandato.

## 2. Requisiti e priorità

Dettaglio in `docs/requirements/traceability.md` (53 requisiti). `MUST` per la PoC: R01 (coda con lease, readiness, passaggio alla successiva), R03.1/R03.3, R04.3, R05, R06.3/R11.3, R08, R09.2, R10, R12.2. Il documento non sceglie l'orchestratore (§11, §13) e preferisce validare prima Claude Code.

## 3. Tabella comparativa

Dettaglio in `reports/comparison.md`.

| | Paperclip | Paseo + Hub | OpenClaw | Warren | Gas Town | Baseline |
|---|---|---|---|---|---|---|
| Natura | control plane di «aziende di agenti» | daemon + dispatcher a eventi | assistente multicanale con Gateway | lifecycle manager di run | orchestratore multi-agente a ruoli | un agente |
| Provato (S00) | server, API, run `http`, riavvio | Hub, RBAC, idempotenza, coda, crash | Gateway, persistenza, Workboard senza LLM | 7.927 test, `serve`, `fake-jira` | build, `gt doctor`, merge default, dashboard | 9/9 PASS |
| Problema provato | **budget aggirabile (#16935)**; `local_trusted` senza login | **#147**; **bug v0.10.0** dopo riavvio | **sandbox off, exec full**; sessioni leggibili | token in chiaro nel log; isolamento non provato | **`direct` di default**, `bypassPermissions`, dashboard aperta | fixture troppo facile |
| Jira | assente (spec in bozza) | assente | assente | estensione sperimentale (read, close) | assente | via MCP (non provato) |
| Windows nativo | non provato | non provato | non provato | `NOT_SUPPORTED` | WSL/Docker | sì |
| RAM necessaria osservata | >2 GiB per build UI e typecheck | ~590 MB | 1,2–1,7 GiB a riposo | 180–220 MB (`serve`); picco 1,2 GiB con test | saturati 2 GiB dai test | trascurabile |
| Licenza | MIT | Apache-2.0 | MIT | MIT | MIT | — |

## 4. Esperimenti, evidenze, limiti, costi e confidenza

- **Provato con comando e risultato** (`TESTED`): le cinque installazioni offline (report `s00-*`); le riproduzioni di #16935 (Paperclip), #147 (Hub) e di una **variante** di #4819 (Gas Town: `gt done` con la lettura del convoy resa impossibile ha pushato ignorando `--merge=local`; la forma letterale con Dolt fermato prima di `gt done` non è riprodotta); RBAC, idempotenza e coda di Hub; Workboard di OpenClaw (claim con TTL, idempotency key); la baseline; il sandbox di laboratorio (13/13); il controller di coda.
- **Costo:** 0 USD per tutti gli smoke test. Baseline: 0,45 USD per le 9 run valide (stima a listino, abbonamento); 0,83 USD totali nel registro, di cui 0,38 USD sprecati da run invalidate per un errore di configurazione nostro (`reports/s01-baseline.md`).
- **Non provato:** qualunque run LIVE dei candidati; l'**isolamento reale** di Warren (gli scenari verdi usano uno shim `bwrap`); `warren up`, `gt up`, `claude_local` e agenti reali; Jira reale; «lavora con il PC spento»; S02 sui candidati, S03 e S08 su qualunque sistema. Sulla baseline S02 e S07 sono state provate (`reports/s02-s07-baseline.md`): con un'issue ambigua implementa con assunzioni dichiarate invece di chiedere (3/3, FAIL per R02); davanti a una prompt injection da issue non ha letto il file-esca (3/3), ma nessun confine del sistema lo impedisce; cross-repo e UI.
- **Limiti di validità:** n=1 per le misure dei candidati, n=3 per la baseline; un solo host (Windows 11 + Docker, 2 GiB per container): diversi blocchi (Paperclip `vite build`, OpenClaw dispatcher) sono **OOM dell'ambiente**, non difetti accertati. OpenClaw: la release provata non coincide con il commit studiato (il merge di `github_publish` esiste solo nel sorgente). Le schede iniziali sono state redatte da agenti e corrette dalle prove.
- **Errore di metodo trovato e corretto:** le prime 9 run baseline erano contaminate dal `CLAUDE.md` globale dell'utente; invalidate, conservate e rifatte.

## 5. Proposta primaria, seconda scelta, opzione custom

| | Proposta | Perché | Trade-off |
|---|---|---|---|
| **Primaria** | **A**: Claude Code remoto + Issue Queue Controller custom + CI e branch protection | meno componenti; budget, lease e policy fuori dall'agente (necessario dopo #16935); la baseline passa 9/9 a ~0,05 USD; in linea con §13 | collaborazione multiutente, dashboard e recovery centralizzato da costruire; capacità di Claude Code su issue dure non provate |
| **Seconda** | **B**: Warren come Execution Plane + controller custom | meccanismo di recovery e conformance Jira già provati offline | Linux/WSL2 obbligatorio; isolamento da dimostrare (socket Docker o `SYS_ADMIN`); token operatore unico; progetto giovane |
| **Differita** | **C**: Paperclip + Warren | governance e multiutente | **#16935**: il budget non regge contro l'agente; adapter Paperclip→Warren non studiato; due sistemi di stato; sforzo e rischio alti |
| Riferimento | Paseo Hub | RBAC e dispatch idempotente provati | solo dispatcher; bug dopo il riavvio; #147 |
| Riferimento | Gas Town | idee su convoy e DAG | `direct` di default, `bypassPermissions`, dashboard senza auth, nessun Jira |
| Riferimento | OpenClaw | canale di notifica/intervento (su Gateway dedicato, senza credenziali di scrittura) | sandbox off, exec full, un solo confine di fiducia |

**Due giudizi distinti:**
- *Vince la PoC?* L'Opzione A, con confidenza media: è l'unica in cui le parti critiche (lease, idempotenza, riconciliazione) sono provate, e costa poco.
- *Adatto alla produzione?* **Nessuna opzione lo è ancora.** Servono: sandbox verificata attorno all'agente (il laboratorio ne ha una validata 13/13), credenziale GitHub senza permesso di merge con branch protection attiva, budget e arresto applicati dal controller, test held-out e CI esterna, Jira reale in sandbox.

## 6. Architettura consigliata

```mermaid
flowchart TB
  Dev[Sviluppatori] --> UI[Dashboard / CLI minima]
  Jira[(Jira o mock REST)] --> QC[Issue Queue Controller custom: lease single-writer, riconciliazione, idempotenza]
  UI --> QC
  QC --> POL[Policy, budget e arresto FUORI dall'agente]
  POL --> SBX[Sandbox verificata: non root, rootfs read-only, nessun socket, rete limitata, limiti pids/memoria]
  SBX --> CC[Claude Code in worktree]
  CC --> PR[PR su branch, senza permesso di merge]
  PR --> CI[CI esterna + test held-out fuori dalla sandbox]
  CI --> BP[Branch protection: merge solo umano]
  QC -. stato issue, link PR .-> Jira
  SBX -. eventi e costi .-> OBS[(Postgres / log)]
  OBS --> UI
```

Confini di fiducia in `docs/security-threat-model.md`.

## 7. Componenti esistenti e da sviluppare

| Componente | Esistente | Da sviluppare | Sforzo | Rischio |
|---|---|---|---|---|
| Coding agent | Claude Code (baseline provata) | permessi e sandbox | basso | medio |
| Coda e lease | prova su mock REST (controller di 131 righe, 21 test) | persistenza Postgres, webhook, Jira reale, auth | medio | basso |
| Policy, budget, retry | — | applicati dal controller, non dall'agente | medio | medio |
| Sandbox | schema validato 13/13 | integrazione con il runner, rete con allowlist | medio | medio |
| Esecuzione isolata alternativa | Warren (B) | isolamento senza socket, RBAC davanti | medio-alto | alto |
| Review indipendente | — | secondo agente con specifica e diff | medio | medio |
| Dashboard e handoff | — | viste minime; Paseo Hub come riferimento per RBAC e dispatch | medio-alto | medio |
| Knowledge | Serena, `CLAUDE.md` | Context Pack, invalidazione | alto | medio |

## 8. Licenze, sicurezza, operatività, lock-in

Licenze permissive (MIT, Apache-2.0), nessun obbligo oneroso rilevato. Sicurezza: vedi §1, `reports/comparison.md` §4, `docs/security-threat-model.md`. Operatività: tutti e cinque si installano in container Linux; nessuno su Windows nativo (Warren lo rifiuta). Lock-in: basso con A, medio con B (protocollo `warren-tracker/v1` sperimentale), alto con C. I progetti cambiano rapidamente (rilasci quasi quotidiani): ogni versione citata è quella provata, e le segnalazioni aperte possono essere già risolte.

## 9. Roadmap MVP incrementale

1. **Passo 0 (breve):** rendere la fixture più dura (cross-modulo, regressioni sottili, un requisito contraddittorio) e rifare la baseline (n≥3). Senza questo non si può dire se serve un orchestratore.
2. **Fase A:** controller su un Jira sandbox, runner con timeout e retry, sandbox validata, PR senza merge, CI esterna con test held-out.
3. **Fase B:** worker paralleli con rilevamento di collisioni, dashboard condivisa, handoff, review indipendente.
4. **Fase C:** Project Memory (Serena, file versionati), Context Pack, invalidazione dopo i merge.
5. **Fase D:** routing per task e benchmark dei modelli.
6. In parallelo, su una VM Linux con ≥8 GiB: prova di Warren (isolamento reale, kill del worker, S06) per confermare o scartare B.

## 10. Decisioni aperte, test non eseguiti e risorse

Non eseguiti: S02 sui candidati; S01–S03 e S08 sui candidati con un agente reale; Jira reale; PC spento (serve una VM remota); isolamento reale di Warren; riproduzione di #16935 con `claude_local` e in modalità `authenticated`.
Risorse necessarie: una VM Linux con ≥8 GiB di RAM; budget LLM aggiuntivo **con approvazione esplicita se serve fornire credenziali dentro i container dei candidati**; un progetto Jira Cloud gratuito (token a scope minimo in variabile d'ambiente).
Decisioni aperte: vedi `docs/decisions.md`.

## 11. Allegato — comandi per riprodurre e pulire

```bash
# Dalla radice della repository (Node >= 22; per la parte Docker serve Docker Desktop attivo)
(cd fixtures/seed-app && npm test)                                   # 5 test visibili
node --test "fixtures/mock-integrations/*.test.mjs"                  # 21 test (mock in-process + controller via REST finto + script di creazione delle issue)
node scripts/evaluate.mjs fixtures/seed-app ISSUE-1 baseline S01 MOCK   # atteso: FAIL (bug presente)
scripts/s07-sandbox-check.sh                                         # 13 controlli sul sandbox di laboratorio (usa postgres:18-alpine già presente)

# Baseline LIVE (consuma budget: vedi reports/budget.md; l'isolamento dal CLAUDE.md globale è nel wrapper)
node scripts/run-baseline.mjs ISSUE-1 S01
node scripts/run-probe.mjs S02        # e S07: sonde sulla baseline, 3 run ciascuna (reports/s02-s07-baseline.md)

# Smoke test dei candidati: procedure e comandi esatti in reports/s00-<candidato>.md
# Pulizia: solo risorse del benchmark
docker ps -a --filter label=tae=1 -q          # deve essere vuoto
# I risultati in results/ sono evidenza versionata: non cancellarli. I cloni di terze parti stanno nello scratchpad (fuori dalla repo)
# e si possono rimuovere con `rm -rf` sul percorso esatto di ciascun clone.
```
