# S03 — Planning e ruoli

Stato: **NON ESEGUITO**. Non è un blocco tecnico: non è stata scritta né lanciata alcuna prova (a differenza di quanto diceva la prima versione di `reports/comparison.md`, che lo marcava `BLOCKED` perché le run LIVE non c'erano ancora).

## ID e obiettivo
- **ID:** S03. **Requisiti:** R03.1-R03.4, R04.1-R04.3, R10.2, R12.1.
- **Obiettivo (§6):** una feature che richiede piano con DAG, scope, dipendenze, criteri di accettazione e piano di verifica; confrontare piano ed esecuzione reale; distinguere Developer e Reviewer (il Reviewer riceve specifica e diff, non solo la narrazione del Developer); verificare permessi effettivi (un Analyst/Reviewer non scrive dove non è autorizzato; se la distinzione vive solo nel prompt è un limite).

## Setup e condizioni iniziali (previsti, non realizzati)
- Materiale già presente nella repo e riutilizzabile: fixture difficile `fixtures/seed-app-hard` con dipendenza dichiarata HARD-3 dopo HARD-1 (`fixtures/issue-catalog/hard-issues.json`); soluzioni di riferimento `fixtures/reference-hard/HARD-N/` e **mutanti** in `fixtures/reference-hard/HARD-N/mutants/` (soluzioni plausibilmente sbagliate: `reports/completamento-vs-traccia.md` propone di usarli per un Reviewer che vede issue e diff ma non i test).

## Input
Non definito (nessuna prova eseguita).

## Comandi e script reali
Nessuno specifico per S03. Script indirettamente utili: `node scripts/validate-hard-fixture.mjs --explain` (elenca i test che falliscono per ogni mutante, senza modelli), `node scripts/evaluate.mjs`.

## Risultati attesi
DAG machine-readable eseguito come pianificato; otto campi per task (Objective, Context, Dependencies, Scope, Acceptance, Risk, Verification, Budget); Reviewer indipendente; permessi imposti dall'infrastruttura.

## Teardown
Non applicabile.

## Esito per sistema

| Sistema | Esito | Note |
|---|---|---|
| Tutti i candidati e la baseline | **non eseguito** | nessun dato sperimentale sullo scenario |

Evidenza **indiretta** (non è S03): sul requisito R04.3 (permessi di ruolo imposti dall'infrastruttura) esistono prove di S07 e S00, citate in `reports/comparison.md` §1: Paperclip, un agente senza permessi modifica budget e config propri e altrui (#16935, TESTED); Paseo Hub, RBAC owner/admin/member e `hub.execute` spento di default (TESTED); OpenClaw, i ruoli non sono confini di sicurezza (DOC), `visibility=all` fa leggere la sessione di un altro agente (TESTED); Gas Town, vincoli da prompt e guardie su pattern (CODE; le guardie bloccano in contesto agente, TESTED); Warren, nessun ruolo (A).

## Artefatti
Nessuno.

## Costi
0 USD finora. Stima di `reports/completamento-vs-traccia.md`: circa 1,5-3 USD per DAG, Reviewer e permessi di ruolo.

## Stato e motivo
**NON ESEGUITO.** Mancano: DAG da un piano, Reviewer indipendente, permessi di ruolo con strumenti vietati. Le funzioni multi-agente non sono state esercitate nemmeno in S01 (ogni run era una singola issue con un solo agente).
