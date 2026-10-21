import { Cart } from './cart.js';
import { lineTax } from './tax.js';
import { validateCustomer } from './validators.js';
import { BASE_CURRENCY, REFUNDABLE_STATUSES } from './config.js';
import { CURRENCIES, convert } from './money.js';
import { systemClock, createIdGenerator, sum } from './util.js';

// Macchina a stati: created -> paid -> shipped -> delivered; cancelled e refunded sono terminali.
const TRANSITIONS = {
  created: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

export class OrderStore {
  #orders = new Map();

  put(order) {
    this.#orders.set(order.id, order);
  }

  get(id) {
    return this.#orders.get(id);
  }

  list() {
    return [...this.#orders.values()];
  }
}

// Fattura: IVA per riga (ADR-001), il totale è la somma delle righe.
export function buildInvoice(order) {
  const lines = order.lines.map((l) => {
    const taxCents = lineTax(l.taxableCents, l.rateBp);
    return {
      sku: l.sku,
      qty: l.qty,
      netCents: l.taxableCents,
      rateBp: l.rateBp,
      taxCents,
      grossCents: l.taxableCents + taxCents,
    };
  });
  const netCents = sum(lines.map((l) => l.netCents));
  const taxCents = sum(lines.map((l) => l.taxCents));
  return { orderId: order.id, lines, netCents, taxCents, totalCents: netCents + taxCents };
}

export class OrderService {
  constructor({
    catalog,
    inventory,
    payments,
    events,
    clock = systemClock,
    ids = createIdGenerator('ord'),
    store = new OrderStore(),
    rates,
  }) {
    Object.assign(this, { catalog, inventory, payments, events, clock, ids, store, rates });
  }

  createOrder({ customer, items, country = 'IT', code, note = '', currency = BASE_CURRENCY }) {
    const who = validateCustomer(customer);
    if (!Array.isArray(items) || items.length === 0) throw new Error('Order needs at least one item');
    const cart = new Cart();
    for (const { sku, qty } of items) {
      const p = this.catalog.requireProduct(sku);
      cart.add(sku, p.priceCents, qty, p.category);
    }
    const summary = cart.summary({ country, code, customer: who });
    const { fxRatePpm, payableCents } = this.#quote(summary.totalCents, currency);
    const id = this.ids();
    this.inventory.reserve(id, summary.lines.map(({ sku, qty }) => ({ sku, qty })));
    const at = this.clock.now();
    const order = {
      id,
      status: 'created',
      customer: who,
      country,
      code: code ?? null,
      note,
      currency,
      fxRatePpm,
      payableCents,
      lines: summary.lines.map((l) => ({ ...l })),
      totals: {
        subtotalCents: summary.subtotalCents,
        discountCents: summary.discountCents,
        taxCents: summary.taxCents,
        totalCents: summary.totalCents,
      },
      paidCents: 0,
      refundedCents: 0,
      chargeId: null,
      payAttempts: 0,
      createdAt: at,
      history: [{ status: 'created', at }],
    };
    this.store.put(order);
    this.#emit('order.created', { orderId: id });
    return structuredClone(order);
  }

  getOrder(orderId) {
    return structuredClone(this.#require(orderId));
  }

  listOrders() {
    return this.store.list().map((o) => structuredClone(o));
  }

  invoice(orderId) {
    return buildInvoice(this.#require(orderId));
  }

  async pay(orderId) {
    const order = this.#require(orderId);
    if (order.status !== 'created') throw new Error(`Cannot pay order in status ${order.status}`);
    order.payAttempts += 1;
    const charge = await this.payments.collect(order);
    order.chargeId = charge.id;
    order.paidCents = charge.amountCents;
    this.#transition(order, 'paid', { chargeId: charge.id, amountCents: charge.amountCents });
    return structuredClone(order);
  }

  ship(orderId) {
    const order = this.#require(orderId);
    this.#assertCan(order, 'shipped');
    this.inventory.commit(order.id);
    this.#transition(order, 'shipped');
    return structuredClone(order);
  }

  deliver(orderId) {
    const order = this.#require(orderId);
    this.#transition(order, 'delivered');
    return structuredClone(order);
  }

  async cancel(orderId) {
    const order = this.#require(orderId);
    this.#assertCan(order, 'cancelled');
    if (order.status === 'paid') {
      await this.payments.refund(order, order.paidCents - order.refundedCents, 1);
      order.refundedCents = order.paidCents;
    }
    this.inventory.release(order.id);
    this.#transition(order, 'cancelled');
    return structuredClone(order);
  }

  // Rimborso totale del residuo.
  async refund(orderId) {
    const order = this.#require(orderId);
    if (!REFUNDABLE_STATUSES.includes(order.status)) throw new Error(`Cannot refund order in status ${order.status}`);
    const remaining = order.paidCents - order.refundedCents;
    await this.payments.refund(order, remaining, 1);
    order.refundedCents = order.paidCents;
    this.#transition(order, 'refunded', { amountCents: remaining });
    return structuredClone(order);
  }

  // ADR-003: cambio e importo da addebitare si calcolano una sola volta, alla creazione.
  #quote(totalCents, currency) {
    if (currency === BASE_CURRENCY) return { fxRatePpm: 1_000_000, payableCents: totalCents };
    if (!Object.hasOwn(CURRENCIES, currency)) throw new Error(`Unsupported currency: ${currency}`);
    if (typeof this.rates !== 'function') throw new Error('Exchange rates not configured');
    const table = this.rates();
    if (!Number.isSafeInteger(table?.[currency])) throw new Error(`No exchange rate for ${currency}`);
    const payableCents = convert(totalCents, BASE_CURRENCY, currency, { ...table, [BASE_CURRENCY]: 1_000_000 });
    return { fxRatePpm: table[currency], payableCents };
  }

  #require(orderId) {
    const order = this.store.get(orderId);
    if (!order) throw new Error(`Unknown order: ${orderId}`);
    return order;
  }

  #assertCan(order, to) {
    if (!TRANSITIONS[order.status].includes(to)) throw new Error(`Invalid transition ${order.status} -> ${to}`);
  }

  #transition(order, to, extra = {}) {
    this.#assertCan(order, to);
    order.status = to;
    order.history.push({ status: to, at: this.clock.now() });
    this.#emit(`order.${to}`, { orderId: order.id, ...extra });
  }

  #emit(type, payload) {
    try {
      this.events.emit(type, payload);
    } catch {
      // Gli handler non devono rompere il flusso degli ordini.
    }
  }
}
