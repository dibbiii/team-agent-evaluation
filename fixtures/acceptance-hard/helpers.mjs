// Aiuti condivisi dai test held-out. Usano solo l'API già presente nella baseline (nessun file di riferimento).
import {
  Catalog,
  Inventory,
  EventBus,
  FakeGateway,
  PaymentService,
  OrderService,
  createClock,
  createIdGenerator,
} from '../seed-app-hard/src/index.js';

export const CUSTOMER = { id: 'c1', name: 'Mario Rossi', email: 'mario@example.com' };

export const PRODUCTS = [
  { sku: 'MUG', name: 'Tazza', priceCents: 1250, category: 'standard', weightGrams: 400 },
  { sku: 'TEA', name: 'Tè', priceCents: 990, category: 'reduced', weightGrams: 150 },
  { sku: 'BOOK', name: 'Libro', priceCents: 2000, category: 'books', weightGrams: 600 },
  { sku: 'PEN', name: 'Penna', priceCents: 75, category: 'standard', weightGrams: 20 },
  { sku: 'P1', name: 'Prodotto 1', priceCents: 75, category: 'standard' },
  { sku: 'P2', name: 'Prodotto 2', priceCents: 75, category: 'standard' },
  { sku: 'P3', name: 'Prodotto 3', priceCents: 75, category: 'standard' },
  { sku: 'S1', name: 'Spilla', priceCents: 333, category: 'standard' },
  { sku: 'S2', name: 'Cartolina', priceCents: 199, category: 'reduced' },
  { sku: 'S3', name: 'Quaderno', priceCents: 1499, category: 'books' },
];

export function makeShop({ products = PRODUCTS, stock, gateway = new FakeGateway(), events = new EventBus(), rates } = {}) {
  const catalog = new Catalog(products);
  const inventory = new Inventory(stock ?? Object.fromEntries(products.map((p) => [p.sku, 100])));
  const payments = new PaymentService({ gateway });
  const orders = new OrderService({
    catalog,
    inventory,
    payments,
    events,
    clock: createClock('2026-03-01T10:00:00.000Z'),
    ids: createIdGenerator('ord'),
    rates,
  });
  return { catalog, inventory, payments, gateway, events, orders };
}

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

// Cede ai microtask abbastanza a lungo da far completare le catene di promise (nessun timer reale).
export async function flush(times = 20) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
