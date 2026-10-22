# S10 — Cross-repository e verifica UI (secondari)

Stato: **NON ESEGUITO** (scenario secondario). La traccia dice di non bloccare il report principale su questi test.

## ID e obiettivo
- **ID:** S10. **Requisiti:** R13.1, R13.2.
- **Obiettivo (§6):** se le risorse lo permettono, una feature che modifica due repository dipendenti e produce PR coordinate senza merge automatico; se il candidato dichiara preview web/UI, avviare una piccola interfaccia e verificare con test browser e screenshot; se non supportato nativamente, documentare l'adapter richiesto.

## Setup e condizioni iniziali
Non realizzati. Esiste ora un repository privato di prova `dibbiii/tae-sandbox` (solo fixture difficile di partenza, CI con `npm test`, nessun held-out) che potrebbe servire da primo dei due repository (`reports/execution-log.md`, sezione Repository remoti); il secondo non esiste.

## Input
Non definito.

## Comandi e script reali
Nessuno.

## Risultati attesi
Due PR coordinate su due repository, senza merge; screenshot da test browser su una UI di esempio.

## Teardown
Non applicabile.

## Esito per sistema

| Sistema | Esito | Note |
|---|---|---|
| Tutti | **non eseguito** | `reports/comparison.md` lo marca `BLOCKED` (secondario) |

## Artefatti
Nessuno.

## Costi
0 USD.

## Stato e motivo
**NON ESEGUITO.** Per `reports/completamento-vs-traccia.md` si può solo documentare l'adapter richiesto. *Fase precedente:* nessun candidato era stato provato con un forge reale. **[Aggiornato 2026-10-22 sera]** `tae-sandbox` (con la sua CI `npm test` e la protezione del ramo `main`) è stato usato con **Warren** per S01 (5 PR, 2 con agente vero: `reports/s01-warren-github.md`); non è stato usato con gli altri candidati, e S10 resta non eseguito (serve un secondo repository, che non esiste).
