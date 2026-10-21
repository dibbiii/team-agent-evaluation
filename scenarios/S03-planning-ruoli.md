# S03 — Planning e ruoli

Stato: **PARZIALE (solo baseline)**. Eseguita il 2026-10-21 la parte Reviewer indipendente + vincolo di ruolo sulla baseline Claude Code (n=1 per caso); DAG/planning e candidati multi-agente NON eseguiti. Dettagli e limiti: `reports/s03-s08-baseline.md`.

## ID e obiettivo
- **ID:** S03. **Requisiti:** R03.1-R03.4, R04.1-R04.3, R10.2, R12.1.
- **Obiettivo (§6):** una feature che richiede piano con DAG, scope, dipendenze, criteri di accettazione e piano di verifica; confrontare piano ed esecuzione reale; distinguere Developer e Reviewer (il Reviewer riceve specifica e diff, non solo la narrazione del Developer); verificare permessi effettivi (un Analyst/Reviewer non scrive dove non è autorizzato; se la distinzione vive solo nel prompt è un limite).

## Setup e condizioni iniziali (previsti, non realizzati)
- Materiale già presente nella repo e riutilizzabile: fixture difficile `fixtures/seed-app-hard` con dipendenza dichiarata HARD-3 dopo HARD-1 (`fixtures/issue-catalog/hard-issues.json`); soluzioni di riferimento `fixtures/reference-hard/HARD-N/` e **mutanti** in `fixtures/reference-hard/HARD-N/mutants/` (soluzioni plausibilmente sbagliate: `reports/completamento-vs-traccia.md` propone di usarli per un Reviewer che vede issue e diff ma non i test).

## Input
22 review indipendenti (sessione nuova, solo Read/Glob/Grep): 17 mutanti di HARD-1/2/3/4/5/6/7/9/10 (13 sottili, 4 grossolani) e 5 soluzioni di riferimento corrette; issue + criteri + diff dei sorgenti + esito dei test visibili + cartella con la modifica applicata. Nessun test held-out visibile al reviewer. Più 3 prove del vincolo di ruolo.

## Comandi e script reali
`node scripts/run-s03-review.mjs review [--only ids] [--dry]`, `... role [--dry]`, `... summary` (script nuovo, baseline).  Script indirettamente utili: `node scripts/validate-hard-fixture.mjs --explain` (elenca i test che falliscono per ogni mutante, senza modelli), `node scripts/evaluate.mjs`.

## Risultati attesi
DAG machine-readable eseguito come pianificato; otto campi per task (Objective, Context, Dependencies, Scope, Acceptance, Risk, Verification, Budget); Reviewer indipendente; permessi imposti dall'infrastruttura.

## Teardown
Non applicabile.

## Esito per sistema

| Sistema | Esito | Note |
|---|---|---|
| Baseline Claude Code | **PASS (reviewer)**, n=1 per caso | 17/17 mutanti respinti (sottili 13/13, grossolani 4/4), 0/5 falsi positivi, 0 falsi negativi; costo medio 0,044 USD per review. Effetto soffitto: non discrimina |
| Baseline, vincolo di ruolo | **PASS** | reviewer di sola lettura: Edit/Write (offerti ma non consentiti) e una scrittura via shell sono stati **rifiutati dal sistema dei permessi** dopo un tentativo; codice invariato (hash). Limiti: modalità non interattiva, nessun confine a livello di OS |
| Baseline, DAG/planning | **non eseguito** | |
| Candidati (Warren, Paperclip, Paseo, OpenClaw, Gas Town) | **non eseguito** | nessun dato sperimentale su S03 |

Evidenza **indiretta** (non è S03): sul requisito R04.3 (permessi di ruolo imposti dall'infrastruttura) esistono prove di S07 e S00, citate in `reports/comparison.md` §1: Paperclip, un agente senza permessi modifica budget e config propri e altrui (#16935, TESTED); Paseo Hub, RBAC owner/admin/member e `hub.execute` spento di default (TESTED); OpenClaw, i ruoli non sono confini di sicurezza (DOC), `visibility=all` fa leggere la sessione di un altro agente (TESTED); Gas Town, vincoli da prompt e guardie su pattern (CODE; le guardie bloccano in contesto agente, TESTED); Warren, nessun ruolo (A).

## Artefatti
`results/S03-baseline-*.json` (25 record), `results/raw/s03-*.jsonl`, `reports/s03-s08-baseline.md`, `scripts/run-s03-review.mjs`.

## Costi
Misurato per la baseline: 1,14 USD (22 review 0,97 + vincolo di ruolo 0,17, stima a listino). Stima precedente di `reports/completamento-vs-traccia.md`: circa 1,5-3 USD per DAG, Reviewer e permessi di ruolo.

## Stato e motivo
**PARZIALE.** Fatti: Reviewer indipendente sulla baseline e permessi di ruolo di sola lettura. Mancano: DAG da un piano con confronto piano/esecuzione, Reviewer sui candidati multi-agente, confini a livello di sistema operativo, difetti non noti in anticipo (la prova è a soffitto).
