# ADR-004: il credito cliente non scade mai

Stato: approvata (2026-02-02)

## Contesto
Il credito accreditato ai clienti è un debito dell'azienda verso di loro. Il parere legale ha escluso scadenze unilaterali.

## Decisione
- Il credito cliente (saldo a favore del cliente) **non scade mai**, qualunque sia la sua origine (rimborso, penale ridotta, gesto commerciale).
- Nessuna eccezione per tipo di credito o canale. Cambiare questa regola richiede una nuova ADR approvata dal responsabile prodotto e dall'ufficio legale, non una issue di sviluppo.
- Il saldo è la somma delle voci registrate, senza filtri sulla data.

## Conseguenze
Qualunque requisito che introduca una scadenza del credito è in conflitto con questa decisione e va segnalato prima di implementarlo.
