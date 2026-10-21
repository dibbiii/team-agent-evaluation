# Opzioni architetturali

Valutazione da lettura, smoke test S00 dei candidati (in container, senza LLM) e controller di riferimento provato in locale e su Jira reale. [Aggiornato 2026-10-22] La frase originale «nessuna delle opzioni è stata eseguita end to end con un agente reale» è **superata**: tutti e cinque i candidati hanno run LIVE su ISSUE-1 (tutte PASS, effetto soffitto), Warren ha anche prove S09/S07/S04; nessuna **opzione architetturale** (A, B, C) è però stata eseguita come sistema completo con coda, Jira, forge reale e CI. Per l'esito aggiornato vedere la sezione «Aggiornamento 2026-10-22» in fondo e `reports/FINAL-RECOMMENDATION.md`. Il documento (§11, §13) non sceglie l'orchestratore e preferisce validare prima Claude Code.

## Opzione A — Stack minimale: Claude Code remoto + Issue Queue Controller custom

```text
Jira ──► Issue Queue Controller (custom) ──► worker remoto (VM/container) ──► Claude Code in worktree ──► PR
             │ lease, priorità, dipendenze                                          │
             └── stato e decisioni su Git/Postgres                                  └── CI esterna + branch protection
```

- **Esistente:** Claude Code, MCP Jira/GitHub, CI e branch protection del repository.
- **Da sviluppare:** controller della coda (lease, riconciliazione, idempotenza), runner con timeout/retry/budget, dashboard minima o report, policy di sandbox.
- **Evidenza:** la logica di coda con lease, priorità, dipendenze, evento duplicato e riavvio è stata scritta e provata in 92 righe di codice (`fixtures/mock-integrations/mock-jira.mjs`, 7 test). [Superato 2026-10-22: il controller di riferimento è ora di 131 righe, con 29 test sul mock e una prova su Jira Cloud reale, S05 8/8, n=1.] Stima, non misura, per la versione di produzione: da 1.000 a 3.000 righe con Jira reale, webhook, persistenza su Postgres e test.
- **Rischi:** collaborazione multiutente, dashboard e recovery centralizzato sono da costruire; il documento (§13) dice che Claude Code «deve ancora dimostrare» coda Jira continua, multiutente e recovery. Le capacità di Claude Code non sono state provate in questa valutazione.

## Opzione B — Warren come Execution Plane + Control Plane custom minimo

```text
Jira ──► Issue Queue Controller + policy + approvazioni (custom)
              │  (estensione warren-tracker/v1 o API di Warren)
              ▼
         Warren: run isolate, harness Claude Code, trace, salvage, branch push
              ▼
         PR + CI esterna (branch protection: nessun merge automatico)
```

- **Esistente (Warren, MIT):** ciclo di vita delle run, watchdog, salvage, riconciliazione di processi persi, cost cap per run, estensione Jira sperimentale (solo lettura issue, stati, blockedBy, close).
- **Da sviluppare:** coda con lease e priorità, readiness, aggiornamento Jira con link PR, approvazioni, RBAC, supervisore; ruoli e piano (Warren ha solo un plan-run seriale).
- **Rischi:** ~~socket Docker o `SYS_ADMIN` per l'isolamento locale~~ [Superato 2026-10-22: su Linux/WSL2 il runtime `local` usa `bwrap` senza privilegi extra né socket Docker, provato con 13 run di agente reale]. Il runtime Kubernetes è citato nei sorgenti ma non verificato. Un solo bearer token con tutte le capacità, nessun RBAC. Windows nativo non supportato. Progetto del 2026-05, in evoluzione rapida. [Aggiunti dalle prove LIVE: tetto di costo a run finita, nessun lock per issue o file, idempotenza solo in memoria per 10 minuti, rete della sandbox aperta, run in volo non riprese: vedi sotto.]

## Opzione C — Paperclip (Control Plane) + Warren (Execution Plane)

```text
Jira ─► [Issue Queue Controller custom] ─► Paperclip (governance, assegnazioni, budget, audit, dashboard)
                                                │  [Execution Adapter: DA PROTOTIPARE, non esiste]
                                                ▼
                                     Warren run ─► branch/PR ─► CI esterna
```

- **Esistente:** governance di Paperclip (checkout atomico, review/approval applicati dal runtime, budget hard stop, audit, multiutente con ruoli), esecuzione di Warren.
- **Da sviluppare:** controller Jira, execution adapter Paperclip→Warren, correlazione `Jira issue ↔ task Paperclip ↔ run Warren ↔ branch/PR`, ownership unica dello stato.
- **Non verificato:** se Paperclip abbia un adapter generico (HTTP/processo) utilizzabile per lanciare Warren. Non presumerlo.
- **Rischi:** due sistemi con modello di stato diverso, doppia fonte di verità per budget e ruoli, i default permissivi di entrambi (`dangerouslySkipPermissions=true`, socket Docker). Paperclip è un control plane per «aziende di agenti» con ruoli business, quindi parte del modello non è utile al caso e va configurata o ignorata.
- **Stima qualitativa:** sforzo alto, rischio alto; l'adapter non è stato studiato nel codice.

## Opzioni scartate come base

| Candidato | Ruolo | Motivo |
|---|---|---|
| Paseo + Hub | gestione dei daemon, distribuzione, dispatch a eventi | Hub è un dispatcher, non un orchestratore del ciclo di sviluppo; nessun budget, DAG o sandbox; dichiara perdita di dati possibile. Resta riferimento per daemon e handoff |
| Gas Town | riferimento per DAG e convoy | merge diretto di default, ruoli vincolati dal prompt, `bypassPermissions`, nessun Jira, nessun budget enforcement, dipendenze pesanti (Go, Dolt, tmux) |
| OpenClaw | canale di notifica e intervento umano | un solo confine di fiducia per Gateway; `github_publish` include il merge. Non nel percorso critico; possibile su Gateway dedicato senza credenziali di scrittura |

## Confronto

| Criterio | A (minimale) | B (Warren + custom) | C (Paperclip + Warren) |
|---|---|---|---|
| Componenti da gestire | 1 prodotto + 1 custom | 1 prodotto + 1 custom | 2 prodotti + 2 custom |
| Codice custom stimato | medio | medio-alto | alto |
| Isolamento reale | da progettare (VM o container non privilegiato) | Warren, con le riserve sul socket | doppio, con le stesse riserve |
| Collaborazione e audit | da costruire | da costruire | già in Paperclip |
| Maturità del prodotto base | alta (Claude Code) | media-bassa | media-bassa x2 |
| Cosa resta non provato | tutto sulle capacità di Claude Code | tutto su Warren | tutto, compreso l'adapter |

## Aggiornamento 2026-10-21 — effetto delle prove S00

- **Opzione C (Paperclip + Warren):** la riproduzione di Paperclip #16935 (un agente senza permessi modifica budget e config propri e di altri agenti) toglie valore al «budget hard stop» come controllo di sicurezza. In C, budget e permessi andrebbero comunque imposti fuori da Paperclip, il che ne riduce il vantaggio principale. L'adapter Paperclip→Warren resta non studiato.
- **Opzione B (Warren + controller):** Warren installa e passa 7.927 test offline, e la conformance `warren-tracker/v1` con `fake-jira` è provata. L'isolamento reale non è stato provato (gli scenari verdi usano uno shim `bwrap`); serve una VM Linux. Il token operatore compare in chiaro nel log di avvio se non si imposta `WARREN_API_TOKEN`.
- **Opzione A:** il sandbox di laboratorio (13 controlli) e il controller via REST finto (21 test) sono provati; la baseline Claude Code passa 9/9 su una fixture facile. Il limite è la fixture, non l'opzione.
- **Paseo Hub come riferimento:** RBAC, dispatch idempotente e coda con daemon offline sono provati, ma v0.10.0 ha un bug dopo il riavvio e #147 (SIGTERM) è riprodotta.

## Aggiornamento 2026-10-22 — effetto delle run LIVE di tutti i candidati e delle prove S03/S04/S07/S08/S09

Fonti: `reports/comparison.md` (§2.1, §2.2), `reports/s01-*-live.md`, `reports/s09-s07-s04-warren-live.md`, `reports/s03-s08-baseline.md`, `docs/integration-paperclip-warren.md`. Tutte le run su ISSUE-1 sono PASS (**effetto soffitto**: nessuna differenza di qualità dimostrata); confronti non isolati, n piccolo, costi a listino.

**Opzione B (Warren + Control Plane custom), primaria — confermata con precisazioni.**
- Provato con agente vero (13 run, tutte con held-out PASS): sandbox `bwrap` nativa senza privilegi extra, commit, branch e PR (finta) prodotti dal sistema, parallelismo reale (2 run indipendenti in 19 s contro ~28 s in serie). Costo 2,1× la baseline su ISSUE-1.
- **Tolti come punti a favore:** il tetto di costo scatta a run finita (S09: 0,1010 USD con tetto 0,01), nessun budget cumulativo; nessun lock per issue o per file (S04: due PR in conflitto, visibili solo al merge; anche run su file di codice diversi hanno confliggito in `test/cart.test.js`); idempotenza solo con chiave fornita dal chiamante, in memoria per 10 minuti. Tutto questo va nel Control Plane (D28, D29).
- Confermati i limiti già noti: run in volo non riprese (prova con agente finto), rete aperta, modello non controllabile, credenziali copiate nel workspace come file non tracciato, identità git che dipende dall'agente, token operatore unico.
- Nuova architettura di riferimento: Warren **dietro un'interfaccia stretta** (`POST /runs` con `Idempotency-Key`, eventi, cancel), sostituibile da un runner nostro.

**Opzione A (Claude Code remoto + runner e sandbox nostri) — più forte di prima, ancora non provata come sistema.**
- Il rischio «mai provata con Claude Code dentro una sandbox nostra» è **ridotto**: lo schema `bwrap` (stessi montaggi, `env -i`, HOME dedicata) è stato provato con Claude Code dentro Paperclip, Paseo, OpenClaw e Gas Town, con run PASS; per Paseo basta sostituire il comando del provider. Sono script di laboratorio su WSL2, non un prodotto.
- Baseline S03: reviewer indipendente di sola lettura 17/17 mutanti respinti, vincolo di ruolo imposto dai permessi di Claude Code (n=1, solo non interattivo); S08: handoff fra sessioni nuove funziona ma senza vantaggio misurabile. Sono mattoni di A, non un sistema multi-agente.
- Resta da costruire: runner, PR plumbing (Paperclip, Paseo e OpenClaw non producono commit o PR da soli), watchdog, salvage, supervisore, `--resume`. Recovery non provato. Costo vicino alla baseline.
- Prossimo passo: spike (D34).

**Opzione C (Paperclip + Warren) — differita con più motivi.**
- Paperclip in LIVE: budget a 0 centesimi in abbonamento (il tetto non scatta mai), continuazione automatica che raddoppia il costo e può rilanciare la run, nessun commit/PR/work product prodotto dal sistema, confinamento via `command` aggirabile dall'agente (richieste accettate; esecuzione non provata), motore ACP predefinito che ignora il wrapper.
- Con il tetto di Warren a posteriori, **nessuno dei due sistemi limiterebbe la spesa**. L'adapter Paperclip→Warren non esiste (stima 18–34 giorni-persona, 12–25 oltre a B, `docs/integration-paperclip-warren.md` §7). Prototipo a costo zero contro un finto Warren prima di costruire; criterio di stop nel documento.

**Candidati scartati come base — confermato.**
| Candidato | Dati LIVE |
|---|---|
| Paseo + Hub | il più economico (1,6×) e il più semplice da confinare (`command`), ma è un daemon di sessioni: nessun commit/PR; senza password chiunque esegue comandi sull'host; `PASEO_PASSWORD` nell'ambiente dell'agente |
| Gas Town | 2 PASS ma `gt done` bloccato dai file propri non tracciati (run2 solo con workaround); costo 4,9×; `merge_strategy=direct` di default (Refinery non avviato nelle run); confinabile solo per intero |
| OpenClaw | costo 4,1× più heartbeat a pagamento non richiesto; Gateway ~1,5 GB; exec del Gateway: confinabile solo per intero; possibile come canale di notifica su Gateway dedicato senza credenziali di scrittura |

**Confronto aggiornato (qualitativo).**

| Criterio | A (runner nostro) | B (Warren + custom) | C (Paperclip + Warren) |
|---|---|---|---|
| Sandbox e confini | `bwrap` provato in 4 wrapper di laboratorio; da prodotto | nativo (`bwrap`), rete aperta | doppio; il confinamento di Paperclip è aggirabile |
| Commit, branch, PR | da costruire | prodotti dal sistema (forge finto) | solo Warren; Paperclip non li produce |
| Budget e arresto per spesa | da costruire nel controller | tetto a posteriori: va nel controller | doppia fonte, nessuna effettiva |
| Lock e collisioni | da costruire nel controller | nessun lock: va nel controller | idem, più continuazioni di Paperclip |
| Recovery | non provato | run in volo non riprese (agente finto); workspace distrutto | doppio stato da riconciliare |
| Costo sulla baseline (ISSUE-1) | ~1,0× | 2,1× | ≥2,1× (Paperclip aggiunge continuazioni) |
| Cosa resta non provato | recovery, runner come sistema | forge reale, recovery con agente vero, fixture difficile | adapter e tutta l'integrazione |
