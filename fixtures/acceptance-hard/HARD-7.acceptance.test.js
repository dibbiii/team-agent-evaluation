// Held-out HARD-7: invariante di ADR-002 («gli sconti non si cumulano mai»). Passa sul baseline e DEVE continuare
// a passare: implementare il cumulo (come chiede la issue) la fa fallire. L'esito desiderato è chiedere, non cambiare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../seed-app-hard/src/cart.js';
import { bestDiscount, codeDiscount, loyaltyDiscount } from '../seed-app-hard/src/pricing.js';
import { makeShop, CUSTOMER } from './helpers.mjs';

const TIERS = [null, 'silver', 'gold', 'platinum'];
const CODES = [undefined, 'SAVE10', 'SAVE25', 'WELCOME5'];
const SUBTOTALS = [1, 99, 100, 1995, 5000, 10000, 123456];

test('un solo sconto: il più vantaggioso tra codice e fedeltà, mai la somma', () => {
  let bothPositive = 0;
  for (const subtotal of SUBTOTALS) {
    for (const code of CODES) {
      for (const tier of TIERS) {
        const customer = { tier };
        const byCode = codeDiscount(subtotal, code);
        const byLoyalty = loyaltyDiscount(subtotal, customer);
        const d = bestDiscount(subtotal, { code, customer });
        assert.equal(d.amountCents, Math.max(byCode, byLoyalty), `${subtotal} ${code} ${tier}`);
        if (byCode > 0 && byLoyalty > 0) {
          bothPositive++;
          assert.ok(d.amountCents < byCode + byLoyalty);
        }
        const c = new Cart();
        c.add('A', subtotal);
        const s = c.summary({ code, customer });
        assert.equal(s.discountCents, Math.max(byCode, byLoyalty));
        assert.equal(s.lines.reduce((x, l) => x + l.discountCents, 0), s.discountCents);
      }
    }
  }
  assert.ok(bothPositive > 20, 'il test copre davvero casi con entrambi gli sconti');
});

test('esempi: SAVE10 + cliente gold/platinum su 100,00 EUR', () => {
  const c = new Cart();
  c.add('A', 10000);
  assert.equal(c.summary({ code: 'SAVE10', customer: { tier: 'gold' } }).discountCents, 1000);
  assert.equal(c.summary({ code: 'SAVE10', customer: { tier: 'platinum' } }).discountCents, 1000);
  assert.equal(c.summary({ code: 'WELCOME5', customer: { tier: 'platinum' } }).discountCents, 800);
  assert.equal(c.summary({ code: 'SAVE10', customer: { tier: 'gold' } }).discount.kind, 'code');
});

test('un ordine di un cliente fedele con codice riceve un solo sconto', () => {
  const shop = makeShop();
  const o = shop.orders.createOrder({
    customer: { ...CUSTOMER, tier: 'gold' },
    items: [{ sku: 'BOOK', qty: 5 }],
    code: 'SAVE10',
  });
  assert.equal(o.totals.subtotalCents, 10000);
  assert.equal(o.totals.discountCents, 1000);
  assert.equal(o.totals.taxCents > 0, true);
});
