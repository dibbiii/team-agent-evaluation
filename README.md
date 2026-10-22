# Team Agent Evaluation

Valutazione tecnica riproducibile di Paperclip, Paseo/Paseo Hub, OpenClaw, Warren e Gas Town, più una baseline con un solo coding agent, rispetto ai requisiti di `idea-progetto.md` (originale, non modificare). Le regole operative sono in `TEAM_AGENT_EVALUATION_INSTRUCTIONS.md`.

## Mappa

| Percorso | Contenuto |
|---|---|
| `idea-progetto.md` | Requisiti (fonte autorevole) |
| `docs/requirements/traceability.md` | Requisiti R01–R13, priorità, test |
| `docs/candidates/*.md` | Schede dei cinque candidati, con etichette DOC/CODE/TESTED/… |
| `docs/architecture-options.md`, `docs/decisions.md`, `docs/security-threat-model.md` | Analisi architetturale |
| `fixtures/seed-app/` | Fixture neutra (carrello, Node, nessuna dipendenza) |
| `fixtures/acceptance/` | Test held-out, eseguiti fuori dal workspace dell'agente |
| `fixtures/issue-catalog/` | 6 issue sintetiche (una bloccata, una ambigua, due in conflitto) |
| `fixtures/seed-app-hard/`, `fixtures/acceptance-hard/`, `fixtures/reference-hard/` | Fixture difficile (10 issue HARD), test held-out, soluzioni di riferimento e mutanti (usati per S03); descrizione in `docs/hard-fixture.md` |
| `fixtures/mock-integrations/` | Mock Jira con lease, eventi idempotenti, riconciliazione; controller di coda di riferimento |
| `scenarios/` | Schede degli scenari S00–S10 (alcune descrivono ancora lo stato del 2026-10-21: per l'esito aggiornato vale `reports/comparison.md` §2) |
| `scripts/evaluate.mjs` | Valuta un workspace con i test held-out e scrive il JSON del run (`status`/`code_acceptance` = solo codice; la consegna sta in `workflow_acceptance`, schema in `docs/results-schema.md`) |
| `reports/MATRIX.md` | **Matrice autorevole dei risultati**, generata: si rigenera con `node scripts/build-matrix.mjs` (dati: `results/*.json`, `results/budget-ledger.json`; annotazioni a mano: `docs/matrix-annotations.json`) |
| `scripts/run-baseline.mjs`, `run-probe.mjs`, `run-hard-batch.mjs`, `run-s03-review.mjs`, `run-s08-handoff.mjs` | Baseline LIVE (S01, S02, S07, fixture difficile, S03, S08) |
| `scripts/live/` | Script per le run LIVE dei candidati nella distribuzione WSL2 dedicata (`warren-*`, `paperclip-*`, `paseo-*`, `openclaw-*`, `gastown-*`); i comandi esatti sono nei report |
| `reports/` | Preflight, log, S00 per candidato (`s00-*.md`), run LIVE (`s01-*-live.md`, `s09-s07-s04-warren-live.md`, `s03-s08-baseline.md`), baseline (`s01-baseline.md`, `s02-s07-baseline.md`, `hard-calibration.md`), budget, **confronto** (`comparison.md`), **finding** (`findings.md`, F01–F71), **rubrica** (`rubric.md`), raccomandazione finale, handoff, stato rispetto alla traccia (`completamento-vs-traccia.md`) |
| `docs/integration-paperclip-warren.md` | Studio del codice (costo zero) sull'integrazione Paperclip + Warren: verdetto «da prototipare» |
| `results/` | JSON per run (schema §7); `invalid-contaminated/` = run escluse; `budget-ledger.json` = spesa; `raw/` (non versionato) = log grezzi |

## Comandi

```bash
# Test della fixture (baseline: 5 test passano, il bug ISSUE-1 non è coperto dai test visibili)
(cd fixtures/seed-app && npm test)

# Mock Jira in-process e controller via REST finto, aderente a Jira Cloud (21 test)
node --test "fixtures/mock-integrations/*.test.mjs"

# Test di evaluate (opzioni di consegna) e del generatore della matrice
node --test scripts/*.test.mjs

# Valutare un workspace modificato da un agente
node scripts/evaluate.mjs <workspace> ISSUE-1 <candidato> S01 MOCK|LIVE [modello]

# Prove LIVE a costo zero per controllare prompt e workspace senza chiamare il modello
node scripts/run-s03-review.mjs review --dry
node scripts/run-s08-handoff.mjs run --dry
```

Le run LIVE dei candidati girano nella distribuzione WSL2 `Ubuntu-26.04` (non su Windows): procedure e comandi esatti in `reports/s01-warren-live.md`, `reports/s01-paperclip-live.md` §8, `reports/s01-paseo-live.md` §10, `reports/s01-openclaw-live.md` §10, `reports/s01-gastown-live.md` §10-11, `reports/s09-s07-s04-warren-live.md`, e nell'allegato di `reports/FINAL-RECOMMENDATION.md`. Consumano l'uso del piano Claude dell'utente: serve un'approvazione esplicita. **Attenzione al login:** prima di ogni lotto un ping minimo e, dopo ogni run, `cmp` dell'originale (F46, D31).

Requisiti: Node ≥ 22. Python non è necessario.

## Regole

- I risultati MOCK non dimostrano capacità di coding autonomo.
- Quantità non misurate valgono `null`, mai valori inventati.
- Nessun segreto nel repository. I cloni di terze parti stanno fuori dalla repo.

## Stato (2026-10-22)

- **Run LIVE con un agente reale su ISSUE-1 per tutti e cinque i candidati** (run valide: baseline 3 per ISSUE-1, ISSUE-2 e ISSUE-6 = 9; Warren 3 su ISSUE-1 più ISSUE-2 e ISSUE-6 = 5; Paperclip 2, Paseo 2, OpenClaw 2, Gas Town 2 su ISSUE-1): tutte con test held-out PASS, quindi **effetto soffitto** e nessuna differenza di qualità dimostrata. Prove di sicurezza e controllo: Warren S09/S07/S04, Paperclip #16935 con `claude_local`, baseline S03/S08.
- **Raccomandazione provvisoria** in `reports/FINAL-RECOMMENDATION.md` (confidenza media): Opzione B (Warren come Execution Plane dietro un'interfaccia stretta + Control Plane nostro) primaria, Opzione A (runner e sandbox nostri) seconda forte, Opzione C (Paperclip + Warren) differita. Nessuna opzione è pronta per la produzione.
- **Risultati chiave nuovi:** il tetto di costo di Warren scatta a run finita (10×) e non c'è un budget cumulativo; nessun lock fra run sullo stesso file (due PR in conflitto); Paseo senza password = esecuzione di comandi sull'host; Gas Town: `gt done` bloccato dai file propri non tracciati; OpenClaw solo con l'intero Gateway in sandbox e costo 2–4×; Paperclip: budget a 0 centesimi in abbonamento e aggirabile dall'agente.
- **Fatti dopo la prima stesura:** forge GitHub reale con Warren, webhook Jira reali, fixture difficile a n=3 (baseline 11/12, Warren 12/12), logout e `wsl --unregister Ubuntu-26.04` (22 ottobre). **Ancora da riprendere** (in `reports/HANDOFF.md`): VM remota per «PC spento», spike del runner A (D34), workflow completo end to end con un agente vero, recupero di una run Claude Code interrotta a metà, agente che sonda davvero i confini.
- Spesa nel registro: 11,36 USD su 15 (stime a listino con abbonamento, non fatture). I numeri autorevoli sono in `reports/MATRIX.md` (generata dai dati).
- **Preparata a costo zero la fixture di squadra** (`fixtures/seed-app-team/`, `docs/team-fixture.md`) per misurare il valore di un team di agenti contro un agente solo, e il piano delle tre fasi successive con criteri scritti prima delle prove (`docs/next-phase-plan.md`, proposta da approvare). Nessuna run con un agente è stata fatta su di essa.

Altri comandi: `scripts/s07-sandbox-check.sh` (13 controlli sul sandbox di laboratorio, richiede Docker) e `node scripts/run-baseline.mjs ISSUE-1 S01` (LIVE: consuma budget, vedi `reports/budget.md`).
