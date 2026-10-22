// Negozio di noleggio completo e deterministico per i test (orologio, id e gateway iniettati).
import { BookingService, Catalog, EventBus, FakeGateway, Outbox, createClock, createIdGenerator } from '../src/index.js';

export const ITEMS = [
  { sku: 'DRILL', name: 'Trapano', dailyRateCents: 1500, depositCents: 5000 },
  { sku: 'LADDER', name: 'Scala', dailyRateCents: 800, depositCents: 2000 },
  { sku: 'MIXER', name: 'Betoniera', dailyRateCents: 2500, depositCents: 0 },
];

export function makeShop({ today = '2026-03-01', stock = { DRILL: 2, LADDER: 1, MIXER: 3 } } = {}) {
  const gateway = new FakeGateway();
  const events = new EventBus();
  const outbox = new Outbox();
  const clock = createClock(today);
  const bookings = new BookingService({
    catalog: new Catalog(ITEMS),
    payments: gateway,
    events,
    outbox,
    clock,
    ids: createIdGenerator('bk'),
    stock,
  });
  return { bookings, gateway, events, outbox, clock };
}
