// Aiuti dei test held-out. Usano solo l'API del seed più i contratti di docs/requirements/feature.md (nessun file di riferimento).
// Il modello atteso (penale, instradamento del rimborso, testi) è riscritto qui in modo indipendente dal codice dell'agente.
import * as api from '../seed-app-team/src/index.js';

export { api };

export const ITEMS = [
  { sku: 'DRILL', name: 'Trapano', dailyRateCents: 1500, depositCents: 5000 },
  { sku: 'LADDER', name: 'Scala', dailyRateCents: 800, depositCents: 2000 },
  { sku: 'MIXER', name: 'Betoniera', dailyRateCents: 2500, depositCents: 0 },
  { sku: 'ODD', name: 'Pezzo dispari', dailyRateCents: 1001, depositCents: 333 },
];

// ledger: true = CreditLedger vero (se esiste), false = nessun ledger, oggetto = ledger fornito dal test.
export function makeShop({ today = '2026-03-01', stock = { DRILL: 50, LADDER: 50, MIXER: 50, ODD: 50 }, ledger = true } = {}) {
  const gateway = new api.FakeGateway();
  const events = new api.EventBus();
  const outbox = new api.Outbox();
  const clock = api.createClock(today);
  const realLedger = ledger === true ? (api.CreditLedger ? new api.CreditLedger({ clock, ids: api.createIdGenerator('cr') }) : null) : ledger || null;
  const bookings = new api.BookingService({
    catalog: new api.Catalog(ITEMS),
    payments: gateway,
    events,
    outbox,
    clock,
    ids: api.createIdGenerator('bk'),
    stock,
    ...(realLedger ? { ledger: realLedger } : {}),
  });
  return { bookings, gateway, events, outbox, clock, ledger: realLedger };
}

// Prenotazione DRILL di 3 giorni dal 2026-04-10: noleggio 4500, deposito 5000, totale 9500.
export const BASE = { customerId: 'c1', sku: 'DRILL', startDate: '2026-04-10', endDate: '2026-04-13' };

// Giorni -> data di annullamento rispetto all'inizio 2026-04-10.
export const cancelOn = (daysBefore) => api.addDays('2026-04-10', -daysBefore);

// Modello atteso della penale: scaglioni di REQ-1, dopo l'inizio 100% (risposta Q1), arrotondamento per eccesso (risposta Q2).
export function expectedPercent(daysBefore) {
  if (daysBefore < 0) return 100;
  if (daysBefore >= 7) return 0;
  if (daysBefore >= 3) return 30;
  return 70;
}
export const expectedTier = (d) => (d < 0 ? 'started' : d >= 7 ? 'free' : d >= 3 ? 'partial' : 'late');
export const expectedFee = (rental, daysBefore) => Math.ceil((rental * expectedPercent(daysBefore)) / 100);

export const eur = (cents) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')} EUR`;

// Messaggio atteso (REQ-5 e CR-1).
export const expectedMessage = (id, { feeCents, refundCents, method }) =>
  method === 'original'
    ? `Prenotazione ${id} annullata. Nessuna penale. Rimborso di ${eur(refundCents)} sul metodo di pagamento originale.`
    : `Prenotazione ${id} annullata. Penale: ${eur(feeCents)}. Credito accreditato: ${eur(refundCents)}.`;

// Generatore pseudo-casuale deterministico (mulberry32).
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
