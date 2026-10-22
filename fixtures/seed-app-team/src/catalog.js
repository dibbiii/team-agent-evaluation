import { assertCents } from './money.js';
import { fail } from './util.js';

export class Catalog {
  #items = new Map();

  constructor(items = []) {
    for (const item of items) this.add(item);
  }

  add({ sku, name, dailyRateCents, depositCents = 0 }) {
    if (!sku || !name) throw fail('invalid_item');
    assertCents(dailyRateCents, 'dailyRateCents');
    assertCents(depositCents, 'depositCents');
    if (this.#items.has(sku)) throw fail('duplicate_sku');
    this.#items.set(sku, { sku, name, dailyRateCents, depositCents });
  }

  get(sku) {
    const item = this.#items.get(sku);
    if (!item) throw fail('unknown_sku');
    return { ...item };
  }

  list() {
    return [...this.#items.values()].map((i) => ({ ...i }));
  }
}
