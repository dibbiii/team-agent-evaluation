import { Cart } from './cart.js';
import { lineTax } from './tax.js';
import { validateCustomer } from './validators.js';
import { REFUNDABLE_STATUSES } from './config.js';
import { roundHalfEven } from './money.js';
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

  createOrder({ customer, items, country = 'IT', code, note = '' }) {
    const who = validateCustomer(customer);
    if (!Array.isArray(items) || items.length === 0) throw new Error('Order needs at least one item');
    const cart = new Cart();
    for (const { sku, qty } of items) {
      const p = this.catalog.requireProduct(sku);
      cart.add(sku, p.priceCents, qty, p.category);
    }
    const summary = cart.summary({ country, code, customer: who });
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
      lines: summary.lines.map((l) => ({ ...l, refundedQty: 0 })),
      totals: {
        subtotalCents: summary.subtotalCents,
        discountCents: summary.discountCents,
        taxCents: summary.taxCents,
        totalCents: summary.totalCents,
      },
      paidCents: 0,
      refundedCents: 0,
      refunds: [],
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
      await this.payments.refund(order, order.paidCents - order.refundedCents, order.refunds.length + 1);
      order.refundedCents = order.paidCents;
    }
    this.inventory.release(order.id);
    this.#transition(order, 'cancelled');
    return structuredClone(order);
  }

  // Rimborso del residuo: tutte le unità non ancora rimborsate.
  async refund(orderId) {
    const order = this.#require(orderId);
    if (!REFUNDABLE_STATUSES.includes(order.status)) throw new Error(`Cannot refund order in status ${order.status}`);
    const items = order.lines
      .filter((l) => l.qty > l.refundedQty)
      .map((l) => ({ sku: l.sku, qty: l.qty - l.refundedQty }));
    if (items.length === 0) throw new Error('Nothing left to refund');
    await this.refundItems(orderId, items);
    return structuredClone(order);
  }

  // Rimborso parziale per righe. L'importo di ogni riga è ripartito sulle unità con arrotondamento cumulativo
  // half-even (netto e IVA separatamente): l'ultimo rimborso assorbe il resto e la somma è esattamente il pagato.
  async refundItems(orderId, items, { restock = false } = {}) {
    const order = this.#require(orderId);
    if (!REFUNDABLE_STATUSES.includes(order.status)) throw new Error(`Cannot refund order in status ${order.status}`);
    if (!Array.isArray(items) || items.length === 0) throw new Error('Nothing to refund');
    const wanted = new Map();
    for (const { sku, qty } of items) {
      if (!Number.isInteger(qty) || qty < 1) throw new Error('Invalid quantity');
      wanted.set(sku, (wanted.get(sku) ?? 0) + qty);
    }
    const invoice = buildInvoice(order);
    const lines = [];
    for (const [sku, qty] of wanted) {
      const idx = order.lines.findIndex((l) => l.sku === sku);
      if (idx < 0) throw new Error(`Unknown sku in order: ${sku}`);
      const { qty: ordered, refundedQty: before } = order.lines[idx];
      if (qty > ordered - before) throw new Error(`Cannot refund ${qty} of ${sku}: ${ordered - before} left`);
      const share = (amount) => roundHalfEven(amount * (before + qty), ordered) - roundHalfEven(amount * before, ordered);
      const netCents = share(invoice.lines[idx].netCents);
      const taxCents = share(invoice.lines[idx].taxCents);
      lines.push({ sku, qty, netCents, taxCents, amountCents: netCents + taxCents });
    }
    const amountCents = sum(lines.map((l) => l.amountCents));
    if (order.refundedCents + amountCents > order.paidCents) throw new Error('Refund exceeds paid amount');
    const sequence = order.refunds.length + 1;
    if (amountCents > 0) await this.payments.refund(order, amountCents, sequence);
    for (const l of lines) order.lines.find((x) => x.sku === l.sku).refundedQty += l.qty;
    order.refundedCents += amountCents;
    const refund = {
      id: `${order.id}#refund#${sequence}`,
      orderId: order.id,
      amountCents,
      netCents: sum(lines.map((l) => l.netCents)),
      taxCents: sum(lines.map((l) => l.taxCents)),
      lines,
      restocked: restock,
      at: this.clock.now(),
    };
    order.refunds.push(refund);
    if (restock) for (const l of lines) this.inventory.restock(l.sku, l.qty);
    this.#emit('order.items_refunded', { orderId, refundId: refund.id, amountCents, lines: structuredClone(lines) });
    if (order.lines.every((l) => l.refundedQty === l.qty)) {
      this.#transition(order, 'refunded', { amountCents: order.refundedCents });
    }
    return structuredClone(refund);
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
