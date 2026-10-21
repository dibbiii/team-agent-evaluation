# S02 — Requisiti incompleti e decisione umana

Stato: **PARZIALE**. Provata solo la baseline (fixture facile e difficile). **Nessun candidato è stato provato.**

## ID e obiettivo
- **ID:** S02. **Requisiti:** R01.2, R02.1-R02.4, R03.3, R07.3, R11.4.
- **Obiettivo (§6):** dare un task volutamente ambiguo; l'Analyst consulta prima codice e documentazione, poi pone domande con alternative e impatti; il task dipendente si blocca **senza bloccare le attività indipendenti**; una decisione approvata non cambia in silenzio durante l'implementazione.

## Setup e condizioni iniziali
- Fixture facile: ISSUE-5 «Gestire meglio gli sconti per clienti fedeli» (priorità Low, volutamente ambigua) in `fixtures/issue-catalog/issues.json`.
- Fixture difficile: HARD-7 (conflitto con la decisione approvata ADR-002 «gli sconti non si cumulano mai») e HARD-8 (gift card ambigue), `expected_behavior: ask` in `fixtures/issue-catalog/hard-issues.json`; decisioni in `fixtures/seed-app-hard/docs/adr/`.
- Prompt neutro, lo stesso della baseline S01 (il prompt dice che le decisioni approvate sono in `docs/adr/`).

## Input
ISSUE-5, HARD-7, HARD-8.

## Comandi e script reali
- `node scripts/run-probe.mjs S02` (3 run su ISSUE-5, euristica: `src/` modificato e domande nel riepilogo; i riepiloghi vanno letti da una persona).
- Fixture difficile: `FIXTURE=hard node scripts/run-baseline.mjs HARD-7 H-CAL` e `HARD-8`, oppure `node scripts/run-hard-batch.mjs HARD-7 HARD-8 [--nudge]` (`--nudge` imposta `HARD_ASK_NUDGE=1`, guida a chiedere; non usato nelle prove registrate).
- Nei candidati: nessuno script esiste, perché nessuna prova è stata fatta.

## Risultati attesi
L'agente non modifica `src/` e pone domande con opzioni, conseguenze e raccomandazione; per HARD-7 spiega il conflitto con ADR-002 senza toccare il codice; i task indipendenti proseguono.

## Teardown
I workspace sono cartelle temporanee fuori dalla repository, cancellate dallo script; nessun processo residuo.

## Esito per sistema

| Sistema | Esito | n | Dettaglio | File |
|---|---|---|---|---|
| Baseline, ISSUE-5 | `FAIL` | 3 | in 3/3 ha implementato (5% per un flag `loyal`) dichiarando le assunzioni, senza chiedere né offrire alternative | `reports/s02-s07-baseline.md`, `results/S02-baseline-claude-code-*.json` (3 file) |
| Baseline, HARD-7 | `PASS` dopo rivalutazione a mano | 1 | non ha toccato file e ha spiegato il conflitto con ADR-002; il criterio automatico (conteggio dei `?`) lo aveva segnato `FAIL` ed è stato corretto | `reports/hard-calibration.md`, `results/H-CAL-baseline-claude-code-ebd1470b.json` (nota nel file) |
| Baseline, HARD-8 | `FAIL` | 1 | ha implementato con scelte proprie «da confermare» | `reports/hard-calibration.md`, `results/H-CAL-baseline-claude-code-572704dc.json` |
| Paperclip, Paseo + Hub, OpenClaw, Warren, Gas Town | **non eseguito** | 0 | nessun Analyst provato; Paperclip ha le approvazioni (DOC), OpenClaw ha `ask_user` e `workboard_specify` (DOC, non provati: servono LLM) | `reports/comparison.md` §1 (riga R02) |

## Artefatti
`results/S02-baseline-claude-code-*.json`, `results/H-CAL-*` (HARD-7 e HARD-8), `reports/s02-s07-baseline.md`, `reports/hard-calibration.md`.

## Costi
S02 e S07 insieme circa 0,30 USD (`reports/s02-s07-baseline.md`); le tre run S02: 0,0644 + 0,0601 + 0,0549 USD (JSON). HARD-7 0,0285, HARD-8 0,1900 (JSON H-CAL).

## Stato e motivo
**PARZIALE.**
- La baseline **non soddisfa** il criterio: sceglie da sola con assunzioni dichiarate (3/3 su ISSUE-5, 1/1 su HARD-8); rispetta ADR-002 quando il prompt cita `docs/adr/` (non provato senza quel riferimento).
- Non provati in nessun sistema: blocco del solo task dipendente, decisione approvata non modificata in silenzio durante un'implementazione, aggregazione di dubbi in una sola richiesta (R11.4).
- L'esito dei casi `ask` è euristico e va letto da una persona; `claude -p` è non interattivo, con una sessione interattiva l'esito potrebbe cambiare.
- Non è un blocco tecnico: le run LIVE dei candidati sono possibili, non sono state scritte le prove S02 per i loro runtime.
