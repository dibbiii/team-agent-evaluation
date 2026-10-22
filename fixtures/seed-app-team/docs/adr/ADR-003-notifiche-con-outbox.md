# ADR-003: le notifiche passano dall'outbox, scritta nella stessa operazione di dominio

Stato: approvata (2026-01-19)

## Contesto
Le notifiche inviate da listener di eventi si sono perse o duplicate quando un listener falliva o non era registrato.

## Decisione
- Una notifica al cliente è un messaggio in `Outbox` (`src/notifications.js`), accodato dentro l'operazione di dominio che la produce (per esempio dentro `BookingService.cancel`).
- Niente notifiche prodotte da listener del bus di eventi. Gli eventi servono ad altri consumatori (statistiche, integrazioni).
- Ogni messaggio ha una `dedupeKey` stabile, così un'operazione ripetuta non duplica il messaggio.

## Conseguenze
Se l'operazione di dominio fallisce prima di cambiare stato, non resta nessun messaggio in outbox.
