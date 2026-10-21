// Costruisce un negozio completo e deterministico per i test (orologio e id iniettati, gateway finto).
import {
  Catalog,
  Inventory,
  EventBus,
  FakeGateway,
  PaymentService,
  OrderService,
  createClock,
  createIdGenerator,
} from '../src/index.js';

export const PRODUCTS = [
  { sku: 'MUG', name: 'Tazza', priceCents: 1250, category: 'standard', weightGrams: 400 },
  { sku: 'TEA', name: 'Tè, miscela', priceCents: 990, category: 'reduced', weightGrams: 150 },
  { sku: 'BOOK', name: 'Libro', priceCents: 2000, category: 'books', weightGrams: 600 },
  { sku: 'PEN', name: 'Penna', priceCents: 75, category: 'standard', weightGrams: 20 },
];

export const CUSTOMER = { id: 'c1', name: 'Mario Rossi', email: 'mario@example.com' };

export function makeShop({ stock = { MUG: 50, TEA: 50, BOOK: 50, PEN: 500 }, gateway = new FakeGateway(), events = new EventBus() } = {}) {
  const catalog = new Catalog(PRODUCTS);
  const inventory = new Inventory(stock);
  const payments = new PaymentService({ gateway });
  const orders = new OrderService({
    catalog,
    inventory,
    payments,
    events,
    clock: createClock('2026-03-01T10:00:00.000Z'),
    ids: createIdGenerator('ord'),
  });
  return { catalog, inventory, payments, gateway, events, orders };
}
