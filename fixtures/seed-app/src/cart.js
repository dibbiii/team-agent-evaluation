import { applyCode } from './pricing.js';

export class Cart {
  #items = [];

  add(sku, priceCents, qty = 1) {
    if (!Number.isInteger(priceCents) || priceCents < 0) throw new Error('Invalid price');
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Invalid quantity');
    const existing = this.#items.find((i) => i.sku === sku);
    if (existing) existing.qty += qty;
    else this.#items.push({ sku, priceCents, qty });
  }

  remove(sku) {
    this.#items = this.#items.filter((i) => i.sku !== sku);
  }

  get items() {
    return this.#items.map((i) => ({ ...i }));
  }

  subtotal() {
    return this.#items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
  }

  total(code) {
    return applyCode(this.subtotal(), code);
  }
}
