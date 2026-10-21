# S05 — Coda continua e integrazione Jira

Stato: **PARZIALE**. Il controller di riferimento (adapter minimo nostro) è `PASS` su mock e su **Jira Cloud reale** (n=1); **nessun candidato è stato provato con la coda**; webhook non provati.

## ID e obiettivo
- **ID:** S05. **Requisiti:** R01.1-R01.6, R05.1.
- **Obiettivo (§6):** catalogo di almeno 5 issue con priorità e dipendenze, una bloccata e una ambigua; prima mock Jira, poi (se autorizzato) progetto sandbox reale con API/webhook; passaggio automatico alla issue successiva, rispetto dei lock, riavvio dello scheduler, riconciliazione se un evento arriva due volte. Se serve un controller esterno, adapter minimo con codice e complessità quantificati, senza attribuire la capacità al prodotto base.

## Setup e condizioni iniziali
- Catalogo sintetico: `fixtures/issue-catalog/issues.json` (6 issue).
- Mock: `fixtures/mock-integrations/mock-jira.mjs` e `mock-jira-http.mjs` (rifiuta ciò che rifiuterebbe Jira: commenti non ADF, ID di transizione sbagliati, richieste non autenticate).
- Jira reale: progetto `KAN` («test jira») dell'utente, 6 issue `KAN-4`…`KAN-9` create con `scripts/jira-seed.mjs --apply` ed etichetta `tae-benchmark`; link «blocca» con direzione verificata. Workflow osservato: Da completare, In corso, In revisione, Completata. Il controller opera solo sulle issue con etichetta `tae-benchmark`.
- Il token API non è mai stato scritto in file né usato dall'agente di valutazione (`reports/execution-log.md`).

## Input
Il catalogo di 6 issue; variabili `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT` fornite dall'utente nell'ambiente.

## Comandi e script reali
- Test su mock: `node --test "fixtures/mock-integrations/*.test.mjs"` (29 `test(` nei due file).
- Creazione delle issue (dry-run di default): `node scripts/jira-seed.mjs [--apply]`; controllo in sola lettura: `node scripts/jira-check.mjs`.
- Prova S05 su Jira reale (dry-run di default, rifiuta di partire se le issue non sono 6 tutte «To Do»): `node scripts/jira-s05-live.mjs --apply`.
- Conformance Jira di Warren con finto: `reports/s00-warren.md` (`fake-jira`, protocollo `warren-tracker/v1`, 8 gruppi).

## Risultati attesi
Primo claim = issue a priorità più alta e non bloccata; claim concorrenti distinti; la PR porta l'issue in «In revisione»; la dipendenza si sblocca solo con «Completata»; riconciliazione al riavvio; evento duplicato idempotente; ticket non del benchmark invariati.

## Teardown
`scripts/jira-s05-live.mjs` rimette stati, etichetta `ready` e rimuove commenti e link creati; verifica visiva del ripristino chiesta all'utente. Il token va revocato a fine prova (decisione dell'utente).

## Esito per sistema

| Sistema | Esito | n | Dettaglio | File |
|---|---|---|---|---|
| Controller di riferimento, mock | `PASS` | test | coda drenata in ordine; bloccata e ambigua mai scelte; evento duplicato idempotente anche dopo riavvio; rollback se Jira rifiuta la transizione | `fixtures/mock-integrations/queue-controller.test.mjs` |
| Controller di riferimento, **Jira Cloud reale** | `PASS` | 1 | 8 controlli su 8, 17,6 s, 0 USD, nessun LLM; il campo `mode` del JSON dice MOCK perché indica l'assenza di LLM, ma il Jira era reale (scritto nelle note) | `results/S05-jira-live-6a5eeb8f.json`, `reports/execution-log.md` |
| Warren | `PARTIAL` | 1 | conformance di `fake-jira` 8 gruppi (TESTED); estensione Jira sperimentale: sola lettura, stati, blockedBy, close (CODE); niente lease né webhook | `reports/s00-warren.md`, `reports/comparison.md` §1 |
| OpenClaw | `PARTIAL` | 1 | Workboard con claim/TTL/idempotency su schede locali, spento di default; Jira assente | `reports/s00-openclaw.md` |
| Paseo Hub | `PARTIAL` | 1 | dispatch idempotente per `deliveryKey`, coda con daemon offline; Jira assente | `reports/s00-paseo-hub.md` |
| Paperclip, Gas Town | non eseguito | 0 | nessun connettore Jira (spec in bozza per Paperclip; CODE) | `reports/comparison.md` §1 |
| Baseline | non eseguito | 0 | via MCP, non provato | `reports/comparison.md` §1 |

## Artefatti
`results/S05-jira-live-6a5eeb8f.json`, `results/jira-seed-map.json`.

## Costi
0 USD (nessun LLM, nessun Jira a pagamento).

## Stato e motivo
**PARZIALE.**
- Il controller (`fixtures/mock-integrations/queue-controller.mjs`) è codice nostro: 133 righe contate nel file (i report citano 131 o 97 a seconda della data), più 193 del finto REST e 145 dello script di creazione (`wc -l`). Non attribuisce la capacità ai prodotti.
- Il test sul Jira reale ha **smentito due ipotesi del mock** (direzione dell'`issueLink`; `reconcile` poteva toccare ticket non del benchmark), corrette.
- Non provati: webhook reali (serve un endpoint raggiungibile da Jira), riavvio del controller con persistenza reale (Postgres), qualunque candidato con Jira reale.
