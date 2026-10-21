// Held-out HARD-4: valute multiple senza cambiare il comportamento esistente; cambio fissato alla creazione (ADR-003).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../seed-app-hard/src/cart.js';
import { CURRENCIES, formatEuro, formatMoney, convert } from '../seed-app-hard/src/money.js';
import { makeShop, CUSTOMER } from './helpers.mjs';

const RATES = { EUR: 1000000, USD: 1082500, JPY: 150000000 };

test('formatMoney: formato storico con i decimali della valuta', () => {
  assert.equal(formatMoney(1796), '17,96 EUR');
  assert.equal(formatMoney(5), '0,05 EUR');
  assert.equal(formatMoney(1796, 'EUR'), '17,96 EUR');
  assert.equal(formatMoney(1796, 'USD'), '17,96 USD');
  assert.equal(formatMoney(-250, 'USD'), '-2,50 USD');
  assert.equal(formatMoney(1234567, 'EUR'), '12345,67 EUR');
  assert.equal(formatMoney(1796, 'JPY'), '1796 JPY');
  assert.equal(formatMoney(-5, 'JPY'), '-5 JPY');
  assert.equal(formatMoney(0, 'JPY'), '0 JPY');
});

test('tabella valute: EUR e USD con 2 decimali, JPY con 0', () => {
  assert.equal(CURRENCIES.EUR.decimals, 2);
  assert.equal(CURRENCIES.USD.decimals, 2);
  assert.equal(CURRENCIES.JPY.decimals, 0);
});

test('regressione: formatEuro e il riepilogo del carrello senza valuta sono invariati', () => {
  assert.equal(formatEuro(1796), '17,96 EUR');
  assert.equal(formatEuro(-250), '-2,50 EUR');
  assert.equal(formatEuro(5), '0,05 EUR');
  const c = new Cart();
  c.add('A', 1995);
  c.add('B', 333, 3, 'reduced');
  assert.deepEqual(c.summary({ country: 'IT', code: 'SAVE10' }), {
    country: 'IT',
    lines: [
      { sku: 'A', qty: 1, unitPriceCents: 1995, category: 'standard', rateBp: 2200, netCents: 1995, discountCents: 199, taxableCents: 1796 },
      { sku: 'B', qty: 3, unitPriceCents: 333, category: 'reduced', rateBp: 1000, netCents: 999, discountCents: 100, taxableCents: 899 },
    ],
    discount: { kind: 'code', code: 'SAVE10', amountCents: 299 },
    subtotalCents: 2994,
    discountCents: 299,
    taxableCents: 2695,
    taxCents: 485,
    totalCents: 3180,
  });
});

test('convert: half-even, solo interi', () => {
  assert.equal(convert(1000, 'EUR', 'USD', RATES), 1082); // 1082,5 -> pari
  assert.equal(convert(1001, 'EUR', 'USD', RATES), 1084); // 1083,5825 -> 1084
  assert.equal(convert(1, 'EUR', 'JPY', RATES), 2); // 1,5 -> 2
  assert.equal(convert(3, 'EUR', 'JPY', RATES), 4); // 4,5 -> 4
  assert.equal(convert(5, 'EUR', 'JPY', RATES), 8); // 7,5 -> 8
  assert.equal(convert(150, 'JPY', 'EUR', RATES), 100);
  assert.equal(convert(1, 'JPY', 'EUR', RATES), 1);
  assert.equal(convert(10000, 'USD', 'JPY', RATES), 13857);
  assert.equal(convert(-3, 'EUR', 'JPY', RATES), -4);
  assert.equal(convert(0, 'EUR', 'USD', RATES), 0);
});

test('convert: stessa valuta = identità; valuta o importo non validi lanciano', () => {
  assert.equal(convert(12345, 'EUR', 'EUR', RATES), 12345);
  assert.equal(convert(12345, 'USD', 'USD', RATES), 12345);
  assert.throws(() => convert(100, 'EUR', 'XXX', RATES));
  assert.throws(() => convert(100, 'XXX', 'EUR', RATES));
  assert.throws(() => convert(100, 'EUR', 'CHF', RATES));
  assert.throws(() => convert(1.5, 'EUR', 'USD', RATES));
});

test('convert: nessuna perdita di precisione sugli importi grandi', () => {
  assert.equal(convert(123456789011, 'EUR', 'JPY', RATES), 185185183516); // ...516,5 -> pari
  assert.equal(convert(123456789013, 'EUR', 'JPY', RATES), 185185183520); // ...519,5 -> pari
  assert.equal(convert(9007199254740, 'EUR', 'JPY', RATES), 13510798882110); // esatto
});

test('ordine senza valuta: identico a prima (EUR, nessuna conversione)', async () => {
  const shop = makeShop({ rates: () => RATES });
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }] });
  assert.deepEqual(o.totals, { subtotalCents: 1250, discountCents: 0, taxCents: 275, totalCents: 1525 });
  assert.equal(o.currency, 'EUR');
  assert.equal(o.fxRatePpm, 1000000);
  assert.equal(o.payableCents, 1525);
  await shop.orders.pay(o.id);
  assert.equal(shop.gateway.captures[0].currency, 'EUR');
  assert.equal(shop.gateway.captures[0].amountCents, 1525);
  const explicit = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }], currency: 'EUR' });
  assert.equal(explicit.payableCents, 1525);
});

test('ordine in USD: totali contabili in EUR, importo da addebitare convertito e memorizzato', async () => {
  const shop = makeShop({ rates: () => RATES });
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }], currency: 'USD' });
  assert.deepEqual(o.totals, { subtotalCents: 1250, discountCents: 0, taxCents: 275, totalCents: 1525 });
  assert.equal(o.currency, 'USD');
  assert.equal(o.fxRatePpm, 1082500);
  assert.equal(o.payableCents, convert(1525, 'EUR', 'USD', RATES)); // 1650,8125 -> 1651
  assert.equal(o.payableCents, 1651);
  const paid = await shop.orders.pay(o.id);
  assert.equal(shop.gateway.captures[0].currency, 'USD');
  assert.equal(shop.gateway.captures[0].amountCents, 1651);
  assert.equal(paid.paidCents, 1651);
});

test('ordine in JPY (0 decimali)', async () => {
  const shop = makeShop({ rates: () => RATES });
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }], currency: 'JPY' });
  assert.equal(o.payableCents, 2288); // 1525 * 1,5 = 2287,5 -> pari
  await shop.orders.pay(o.id);
  assert.equal(shop.gateway.captures[0].currency, 'JPY');
  assert.equal(shop.gateway.captures[0].amountCents, 2288);
});

test('ADR-003: un cambio diverso dopo la creazione non altera l ordine, il pagamento né il rimborso', async () => {
  let current = RATES;
  let reads = 0;
  const shop = makeShop({ rates: () => (reads++, current) });
  const o = shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 2 }], currency: 'USD' });
  const readsAtCreation = reads;
  current = { ...RATES, USD: 1200000 }; // il dollaro si indebolisce
  const stored = shop.orders.getOrder(o.id);
  assert.equal(stored.fxRatePpm, 1082500);
  assert.equal(stored.payableCents, o.payableCents);
  await shop.orders.pay(o.id);
  assert.equal(shop.gateway.captures[0].amountCents, o.payableCents);
  assert.equal(shop.gateway.captures[0].currency, 'USD');
  await shop.orders.ship(o.id);
  const refunded = await shop.orders.refund(o.id);
  assert.equal(shop.gateway.refunds[0].amountCents, o.payableCents);
  assert.equal(refunded.refundedCents, o.payableCents);
  assert.equal(reads, readsAtCreation, 'nessuna lettura del cambio corrente dopo la creazione');
});

test('valuta non gestita o senza cambio: errore e nessun effetto collaterale', () => {
  const shop = makeShop({ rates: () => ({ EUR: 1000000, USD: 1082500 }) });
  for (const currency of ['XXX', 'JPY', 'CHF']) {
    assert.throws(() => shop.orders.createOrder({ customer: CUSTOMER, items: [{ sku: 'MUG', qty: 1 }], currency }), undefined, currency);
  }
  assert.equal(shop.inventory.available('MUG'), 100);
  assert.equal(shop.orders.listOrders().length, 0);
});
