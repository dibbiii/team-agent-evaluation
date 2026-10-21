import { assertCents } from './money.js';

export class Catalog {
  #products = new Map();

  constructor(products = []) {
    for (const p of products) this.add(p);
  }

  add({ sku, name, priceCents, category = 'standard', weightGrams = 0 }) {
    if (typeof sku !== 'string' || sku === '') throw new Error('Invalid sku');
    assertCents(priceCents, 'priceCents');
    this.#products.set(sku, { sku, name: name ?? sku, priceCents, category, weightGrams });
  }

  getProduct(sku) {
    const p = this.#products.get(sku);
    return p ? { ...p } : undefined;
  }

  requireProduct(sku) {
    const p = this.getProduct(sku);
    if (!p) throw new Error(`Unknown product: ${sku}`);
    return p;
  }

  list() {
    return [...this.#products.values()].map((p) => ({ ...p }));
  }
}
