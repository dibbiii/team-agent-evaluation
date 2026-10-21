import { bestDiscount, applyCode } from './pricing.js';
import { allocate } from './money.js';
import { taxRate, lineTax } from './tax.js';
import { validateCountry } from './validators.js';
import { sum } from './util.js';

export class Cart {
  #items = [];

  add(sku, unitPriceCents, qty = 1, category = 'standard') {
    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) throw new Error('Invalid price');
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Invalid quantity');
    const existing = this.#items.find((i) => i.sku === sku);
    if (existing) existing.qty += qty;
    else this.#items.push({ sku, unitPriceCents, qty, category });
  }

  remove(sku) {
    this.#items = this.#items.filter((i) => i.sku !== sku);
  }

  get items() {
    return this.#items.map((i) => ({ ...i }));
  }

  subtotal() {
    return this.#items.reduce((s, i) => s + i.unitPriceCents * i.qty, 0);
  }

  // Totale scontato con il solo codice, senza IVA (API storica).
  total(code) {
    return applyCode(this.subtotal(), code);
  }

  // Riepilogo con sconto ripartito sulle righe e IVA.
  summary({ country = 'IT', code, customer } = {}) {
    validateCountry(country);
    const subtotalCents = this.subtotal();
    const discount = bestDiscount(subtotalCents, { code, customer });
    const nets = this.#items.map((i) => i.unitPriceCents * i.qty);
    const shares = allocate(discount.amountCents, nets);
    const lines = this.#items.map((i, idx) => ({
      sku: i.sku,
      qty: i.qty,
      unitPriceCents: i.unitPriceCents,
      category: i.category,
      rateBp: taxRate(country, i.category),
      netCents: nets[idx],
      discountCents: shares[idx],
      taxableCents: nets[idx] - shares[idx],
    }));
    // IVA per aliquota: si somma l'imponibile di ogni aliquota e si arrotonda una volta (calcolo storico del riepilogo).
    const byRate = new Map();
    for (const l of lines) byRate.set(l.rateBp, (byRate.get(l.rateBp) ?? 0) + l.taxableCents);
    let taxCents = 0;
    for (const [rate, taxable] of byRate) taxCents += lineTax(taxable, rate);
    const taxableCents = sum(lines.map((l) => l.taxableCents));
    return {
      country,
      lines,
      discount,
      subtotalCents,
      discountCents: discount.amountCents,
      taxableCents,
      taxCents,
      totalCents: taxableCents + taxCents,
    };
  }
}
