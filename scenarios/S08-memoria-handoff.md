# S08 — Memoria, aggiornamento e handoff

Stato: **NON ESEGUITO**. Non è un blocco tecnico: nessuna prova è stata scritta o lanciata (la prima versione di `reports/comparison.md` lo marcava `BLOCKED` in attesa delle run LIVE).

## ID e obiettivo
- **ID:** S08. **Requisiti:** R07.1-R07.6, R09.1-R09.3.
- **Obiettivo (§6):** un agente lavora su una issue e registra decisioni, scoperte e riferimenti ai commit; una **nuova sessione indipendente** per la issue successiva recupera il contesto utile senza leggere la chat precedente; una modifica rende obsoleta una conoscenza (invalidazione/revisione dopo merge simulato o commit); passaggio a un secondo sviluppatore (stato, blocchi, piano, diff, decisioni); distinguere handoff strutturato da subentro nella stessa sessione attiva.

## Setup e condizioni iniziali
Non realizzati. Materiale riutilizzabile: fixture difficile con ADR in `fixtures/seed-app-hard/docs/adr/` (6 decisioni approvate); catalogo `fixtures/issue-catalog/hard-issues.json` con dipendenza HARD-3 dopo HARD-1.

## Input
Non definito.

## Comandi e script reali
Nessuno specifico per S08.

## Risultati attesi
Context Pack per issue con moduli, simboli, decisioni, test e PR rilevanti; invalidazione dopo un commit che cambia un componente; secondo sviluppatore che ricostruisce stato e decisioni dai soli dati di progetto.

## Teardown
Non applicabile.

## Esito per sistema

| Sistema | Esito | Note |
|---|---|---|
| Tutti | **non eseguito** | nessun dato sperimentale sullo scenario |

Evidenza **indiretta** (non è S08): OpenClaw, dopo lo stop e il riavvio del Gateway un turno `c3` sulla stessa chiave di sessione ha risposto correttamente sulla modifica fatta in c2, con ripresa della sessione di Claude Code (`reports/s01-openclaw-live.md` §3, TESTED, n=1; è persistenza della **stessa** sessione, non un handoff a una sessione nuova). Paseo, dopo il riavvio del daemon sopravvivono `sessionId` e `persistence.nativeHandle`; la ripresa non è stata provata (`reports/s01-paseo-live.md` §3.2). Warren non ha ripresa di sessione (CODE, `docs/live-warren-recovery.md`).

## Artefatti
Nessuno.

## Costi
0 USD finora. Stima di `reports/completamento-vs-traccia.md`: circa 0,5-1 USD per sessione nuova, handoff e invalidazione sulla baseline.

## Stato e motivo
**NON ESEGUITO.** Mancano: sessione nuova che recupera il contesto, handoff a un secondo sviluppatore, invalidazione dopo un commit, multiutente con audit (RBAC di Hub provato solo come controllo di accesso in S00).
