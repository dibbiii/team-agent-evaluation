# Change request CR-1: rimborso sul metodo originale per le cancellazioni senza penale

Stato: approvata dal responsabile prodotto. Rilasciata dopo il completamento di TEAM-4 (registro del credito). Sostituisce le parti di `docs/requirements/feature.md` che la contraddicono.

## Motivo
L'ufficio amministrativo ha deciso che chi annulla con largo anticipo (nessuna penale) ha diritto al rimborso sul metodo di pagamento originale. Il credito resta solo per le cancellazioni con penale.

## Cosa cambia
Quando `feeCents === 0` (scaglione `free`):
1. **Gateway.** `cancel` rimborsa l'intero `refundCents` con `payments.refund(booking.paymentRef, refundCents)`, una sola volta. Non si registra nessuna voce di credito.
2. **Ledger.** `CreditLedger.postRefund` con un `breakdown` che ha `feeCents === 0` lancia un errore con `code: 'use_original_payment_method'` e non registra nulla (dopo aver validato il `breakdown`).
3. **Dettaglio dell'annullamento.** `booking.cancellation.refundMethod` vale `'original'` (con penale: `'credit'`). `creditCents` vale 0 quando il metodo è `'original'`.
4. **Avviso.** Il testo diventa `Prenotazione <id> annullata. Nessuna penale. Rimborso di <rimborso> sul metodo di pagamento originale.` (importi con `formatEuro`). Con penale il testo resta quello di REQ-5. `cancellationMessage` riceve anche `refundMethod` (default `'credit'`).
5. **Evento.** Il payload di `booking.cancelled` aggiunge `refundMethod`.
6. **Atomicità (ADR-005).** Se il rimborso sul gateway fallisce, l'errore si propaga e non resta nessuna traccia (stato, messaggi, voci, eventi).

Nulla cambia per le cancellazioni con penale e nulla cambia nel calcolo della penale.
