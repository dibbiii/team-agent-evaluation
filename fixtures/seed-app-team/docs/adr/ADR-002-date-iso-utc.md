# ADR-002: date come stringhe ISO `YYYY-MM-DD`, calendario UTC

Stato: approvata (2026-01-12)

## Contesto
I fusi orari e l'ora legale hanno già prodotto prenotazioni sfasate di un giorno.

## Decisione
- Le date di prenotazione sono stringhe `YYYY-MM-DD`, interpretate come giorni di calendario in UTC. Nessuna ora, nessun fuso.
- Si calcola con `src/calendar.js` (`daysBetween`, `addDays`). Non si usa `new Date()` con date locali né `Date.now()`.
- «Oggi» arriva sempre da `clock.today()` (iniettato).

## Conseguenze
Nessuna domanda di prodotto sui fusi orari: la risposta è questa ADR.
