# S08 — Memoria, aggiornamento e handoff

Stato: **PARZIALE (solo baseline)**. Eseguita il 2026-10-21 sulla baseline Claude Code (n=1 per variante): handoff fra sessioni nuove e invalidazione. Candidati NON eseguiti. Dettagli e limiti: `reports/s03-s08-baseline.md`.

## ID e obiettivo
- **ID:** S08. **Requisiti:** R07.1-R07.6, R09.1-R09.3.
- **Obiettivo (§6):** un agente lavora su una issue e registra decisioni, scoperte e riferimenti ai commit; una **nuova sessione indipendente** per la issue successiva recupera il contesto utile senza leggere la chat precedente; una modifica rende obsoleta una conoscenza (invalidazione/revisione dopo merge simulato o commit); passaggio a un secondo sviluppatore (stato, blocchi, piano, diff, decisioni); distinguere handoff strutturato da subentro nella stessa sessione attiva.

## Setup e condizioni iniziali
Non realizzati. Materiale riutilizzabile: fixture difficile con ADR in `fixtures/seed-app-hard/docs/adr/` (6 decisioni approvate); catalogo `fixtures/issue-catalog/hard-issues.json` con dipendenza HARD-3 dopo HARD-1.

## Input
HARD-1 (sessione 1, scrive HANDOFF.md) -> HARD-3 (sessione 2 nuova, con handoff; controllo senza) -> sessione 3 nuova di sola lettura dopo un commit che porta l'aliquota IT standard da 22% a 21% (domanda generica U e mirata T).

## Comandi e script reali
`node scripts/run-s08-handoff.mjs run [--control] [--dry]` (script nuovo, baseline).

## Risultati attesi
Context Pack per issue con moduli, simboli, decisioni, test e PR rilevanti; invalidazione dopo un commit che cambia un componente; secondo sviluppatore che ricostruisce stato e decisioni dai soli dati di progetto.

## Teardown
Non applicabile.

## Esito per sistema

| Sistema | Esito | Note |
|---|---|---|
| Baseline, sessione 1 (HARD-1 + handoff) | **PASS** | held-out PASS, handoff di 45 righe con 10 assunzioni |
| Baseline, sessione 2 con handoff | **PASS** | held-out HARD-3 PASS; handoff letto per primo |
| Baseline, sessione 2 senza handoff (controllo) | **PASS** | stesso esito e stesso costo (0,36 USD): nessun vantaggio misurabile dell'handoff, effetto soffitto |
| Baseline, sessione 3 invalidazione | **PASS** (mirata e generica; euristico) | ha rilevato il cambio di aliquota 22%->21% dal commit e dall'ispezione del codice, senza falso allarme sull'assunzione non cambiata. Aveva accesso a git; n=1 |
| Candidati | **non eseguito** | nessun dato |

Evidenza **indiretta** (non è S08): OpenClaw, dopo lo stop e il riavvio del Gateway un turno `c3` sulla stessa chiave di sessione ha risposto correttamente sulla modifica fatta in c2, con ripresa della sessione di Claude Code (`reports/s01-openclaw-live.md` §3, TESTED, n=1; è persistenza della **stessa** sessione, non un handoff a una sessione nuova). Paseo, dopo il riavvio del daemon sopravvivono `sessionId` e `persistence.nativeHandle`; la ripresa non è stata provata (`reports/s01-paseo-live.md` §3.2). Warren non ha ripresa di sessione (CODE, `docs/live-warren-recovery.md`).

## Artefatti
`results/S08-baseline-*.json` (5 record), `results/raw/s08-*`, `reports/s03-s08-baseline.md`, `scripts/run-s08-handoff.mjs`.

## Costi
Misurato per la baseline: 1,13 USD (stima a listino; 5 sessioni). Stima precedente di `reports/completamento-vs-traccia.md`: circa 0,5-1 USD per sessione nuova, handoff e invalidazione sulla baseline.

## Stato e motivo
**PARZIALE.** Fatti: handoff fra sessioni nuove e invalidazione sulla baseline. Finding: F66 (nessun vantaggio misurabile dell'handoff; l'invalidazione è un comportamento dell'agente, non del sistema). Mancano: i candidati, memoria persistente/Context Pack, secondo sviluppatore umano, subentro nella stessa sessione, multiutente con audit.
