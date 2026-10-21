# ADR-004: idempotency key stabile per ordine

Stato: approvata (2026-02-02)

## Contesto
I gateway di pagamento possono addebitare e poi perdere la risposta (timeout). Se il client ripete la richiesta con una chiave nuova, il cliente viene addebitato due volte.

## Decisione
- Ogni richiesta di addebito per un ordine usa una **idempotency key stabile per ordine**: la stessa chiave per tutti i tentativi, chiavi diverse per ordini diversi. Non dipende dal numero di tentativi né dal tempo.
- Una richiesta di pagamento ripetuta o concorrente non deve mai produrre un secondo addebito.
- Un rifiuto della carta non invalida la chiave: il cliente può riprovare.

## Conseguenze
La chiave si costruisce in `PaymentService`, non nei chiamanti.
