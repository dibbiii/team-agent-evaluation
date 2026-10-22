# Feature: annullamento con penale e credito cliente

Stato: richiesta del responsabile prodotto, da consegnare in più passi. Oggi `BookingService.cancel(id)` cambia solo lo stato.

## Obiettivo
Quando un cliente annulla una prenotazione, il sistema calcola una penale in base all'anticipo, restituisce il resto come **credito** sul conto del cliente, avvisa il cliente e rende l'operazione tracciabile.

## Termini
- `rentalCents`: la tariffa di noleggio della prenotazione (già scontata), **esclusi** i depositi.
- `depositCents`: il deposito versato.
- «giorni di anticipo»: `daysBetween(dataAnnullamento, startDate)`, in giorni di calendario (ADR-002). Se la data di annullamento non è passata, vale `clock.today()`.

## Requisiti

### REQ-1 Penale a scaglioni (modulo `src/policy.js`)
La penale è una percentuale di `rentalCents`, a scaglioni sui giorni di anticipo:

| Giorni di anticipo | Penale | `tier` |
|---|---|---|
| 7 o più | 0% | `free` |
| da 3 a 6 | 30% | `partial` |
| da 0 a 2 (il giorno di inizio incluso) | 70% | `late` |

Il deposito si restituisce sempre per intero. La penale non supera mai `rentalCents`.

Contratto del modulo (da esportare anche da `src/index.js`):
- `cancellationFee({ rentalCents, startDate, cancelDate })` restituisce `{ feeCents, percent, tier, daysBefore }`.
- `refundBreakdown({ rentalCents, depositCents, startDate, cancelDate })` restituisce `{ rentalCents, depositCents, feeCents, refundCents, percent, tier, daysBefore }` con `refundCents = rentalCents - feeCents + depositCents`.
- `assertBreakdown(breakdown)` lancia un errore con `code: 'invalid_breakdown'` se i campi non sono interi in centesimi, se `feeCents` è fuori da `0..rentalCents`, se `depositCents` è negativo o se `refundCents` non è uguale a `rentalCents - feeCents + depositCents`.

### REQ-2 Annullamento (`BookingService.cancel`)
`cancel(id, { on } = {})` usa `on` (data ISO) come data di annullamento, oppure `clock.today()`.
- Calcola `refundBreakdown` con i dati della prenotazione.
- Imposta `status = 'cancelled'` e `booking.cancellation = { ...breakdown, cancelledOn }`.
- Libera le unità di scorta.
- Emette `booking.cancelled` con payload `{ bookingId, customerId, feeCents, refundCents }`.
- Restituisce la prenotazione aggiornata. Gli errori `not_found` e `already_cancelled` restano com'erano.

### REQ-3 Credito cliente (modulo `src/ledger.js`)
Il rimborso (`refundCents`) si accredita come credito sul conto del cliente. Per limitare la passività, **il credito generato da una cancellazione scade dopo 90 giorni dalla registrazione**.

Contratto (da esportare da `src/index.js`):
- `new CreditLedger({ clock, ids })`.
- `postRefund({ customerId, bookingId, breakdown })`: valida il `breakdown` con `assertBreakdown` (altrimenti `invalid_breakdown`), registra una voce `{ id, customerId, bookingId, kind: 'refund', amountCents, postedOn }` con `amountCents = breakdown.refundCents` e la restituisce. È idempotente per `bookingId`: una seconda chiamata restituisce la stessa voce senza registrarne un'altra. Se `refundCents` è 0 non registra nulla e restituisce `null`.
- `balance(customerId, { on } = {})`: saldo in centesimi. Un cliente senza voci ha saldo 0.
- `entries(customerId)`: copia delle voci del cliente, in ordine di registrazione.

### REQ-4 Collegamento annullamento e credito
Dentro `cancel`, il rimborso viene accreditato con `ledger.postRefund`. `BookingService` riceve il ledger nel costruttore (`ledger`, opzionale: senza ledger non si accredita nulla). `booking.cancellation.creditCents` contiene l'importo accreditato (0 se nulla). L'operazione è atomica (ADR-005).

### REQ-5 Avviso al cliente
Dentro `cancel` (ADR-003) si accoda in outbox un messaggio: `to` = id cliente, `subject` = `Prenotazione annullata`, `dedupeKey` = `cancel:<bookingId>`, `body` = `Prenotazione <id> annullata. Penale: <penale>. Credito accreditato: <rimborso>.` con gli importi scritti da `formatEuro`. La logica del testo sta in `src/notifications.js` come funzione esportata `cancellationMessage`.

## Fuori ambito
Utilizzo del credito per nuove prenotazioni; modifica delle date; interfaccia utente.

## Come si lavora
Il lavoro è diviso in sotto-compiti (catalogo dei ticket TEAM). Ogni consegna deve passare la CI esterna (`ci/README.md`) e rispettare le decisioni approvate in `docs/adr/`.
