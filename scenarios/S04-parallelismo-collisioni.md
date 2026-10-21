# S04 — Parallelismo e collisioni

Stato: **PARZIALE**. Provato solo il controller di coda di riferimento (nostro, non un candidato) e l'idempotenza di Paseo Hub. **Nessun candidato è stato provato con due run in parallelo né in conflitto.**

## ID e obiettivo
- **ID:** S04. **Requisiti:** R01.4, R05.1, R05.2, R08.2.
- **Obiettivo (§6):** due task realmente indipendenti in parallelo (guadagno temporale, isolamento, correttezza); due task in conflitto sullo stesso file/modulo (rilevamento, serializzazione o segnalazione di conflitto); due worker non devono reclamare la **stessa** issue (lease/idempotenza o documentare la mancanza).

## Setup e condizioni iniziali
- Catalogo `fixtures/issue-catalog/issues.json` (6 issue, una bloccata, una ambigua, due in conflitto, secondo `README.md`).
- Mock Jira in-process `fixtures/mock-integrations/mock-jira.mjs`, REST finto aderente a Jira Cloud `fixtures/mock-integrations/mock-jira-http.mjs`, controller `fixtures/mock-integrations/queue-controller.mjs`.

## Input
5 worker concorrenti sul mock; 3 claim concorrenti su Jira reale; 6 richieste concorrenti con la stessa `deliveryKey` su Hub.

## Comandi e script reali
- `node --test "fixtures/mock-integrations/*.test.mjs"` (`mock-jira.test.mjs` 7 test, `queue-controller.test.mjs` 22 test: 29 `test(` contati nei file).
- Jira reale (richiede variabili `JIRA_*` dell'utente): `node scripts/jira-s05-live.mjs --apply` (vedi S05).
- Hub: procedura in `reports/s00-paseo-hub.md` (dispatch manuale con `deliveryKey` ripetuto).

## Risultati attesi
Nessuna issue reclamata due volte; eventi duplicati idempotenti; due task in conflitto serializzati o segnalati; guadagno temporale misurabile con task indipendenti.

## Teardown
Il controller è in-process o via HTTP finto: nessuna risorsa da pulire. Su Jira reale lo script ripristina stati, etichetta `ready`, commenti e link (cleanup anche in caso di errore).

## Esito per sistema

| Sistema | Esito | n | Dettaglio | File |
|---|---|---|---|---|
| Controller di riferimento (non un candidato) | `PASS` sul mock; `PASS` su Jira reale | mock: test; reale: n=1 | 5 worker concorrenti non prendono mai la stessa issue; su Jira reale 3 claim concorrenti distinti (KAN-5, KAN-9, KAN-6); l'ordine dei tre non è deterministico | `fixtures/mock-integrations/queue-controller.test.mjs`, `results/S05-jira-live-6a5eeb8f.json`, `reports/execution-log.md` |
| Paseo Hub | `PASS` per l'idempotenza | 1 | 6 richieste concorrenti con la stessa `deliveryKey` = 1 sola esecuzione, stessa ricevuta | `reports/s00-paseo-hub.md` |
| OpenClaw | `PARTIAL` | 1 | Workboard: claim con TTL, token, idempotency key su schede locali (senza LLM) | `reports/s00-openclaw.md` |
| Paperclip | non eseguito | 0 | lock per run (DOC/CODE) | `reports/comparison.md` §4 |
| Warren | `PASS` (parallelismo); **nessun rilevamento dei conflitti**; idempotenza solo con chiave HTTP | 4 run LIVE + 1 prova stub (costo 0) | (a) ISSUE-1 e ISSUE-6 insieme: finestre sovrapposte, nessuna collisione di porte/workspace/branch, due PR, held-out PASS x2, ma **conflitto di merge in `test/cart.test.js`** (entrambi aggiungono test in coda); (b) ISSUE-2 e ISSUE-3 insieme (stesso file): entrambe `succeeded`, due branch e due PR `open`, nessun lock/serializzazione/avviso; il conflitto (`src/pricing.js`, `test/cart.test.js`) emerge solo al merge di prova. Stessa issue due volte senza chiave = due run, due PR (nessun lease); con la stessa `Idempotency-Key` = una sola run (in memoria, TTL 10 min, stub) | `reports/s09-s07-s04-warren-live.md`, `results/S04-warren-s04a-parallel-*.json`, `S04-warren-s04b-conflict-*.json` |
| Gas Town | non eseguito | 0 | duplicazione task non provata | `reports/comparison.md` §4 |
| Baseline | non eseguito | 0 | - | - |

## Artefatti
`results/S05-jira-live-6a5eeb8f.json`; test in `fixtures/mock-integrations/`.

## Costi
0 USD (nessun LLM). Stima per le prove su Warren: circa 0,5 USD (`reports/completamento-vs-traccia.md`).

## Stato e motivo
**PARZIALE.** Non provati: due run Warren in parallelo (guadagno temporale e isolamento), due run in conflitto sullo stesso file (rilevamento o serializzazione) su qualunque candidato, collisioni di worktree. Il controller è codice nostro: non attribuisce la capacità ai prodotti.
