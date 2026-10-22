import { overlaps } from './calendar.js';
import { Outbox, cancellationMessage } from './notifications.js';
import { refundBreakdown } from './policy.js';
import { quote } from './pricing.js';
import { fail } from './util.js';

export class BookingService {
  #bookings = new Map();

  constructor({ catalog, payments, events, clock, ids, stock = {}, outbox = new Outbox() }) {
    this.catalog = catalog;
    this.payments = payments;
    this.events = events;
    this.clock = clock;
    this.ids = ids;
    this.stock = stock;
    this.outbox = outbox;
  }

  #require(id) {
    const booking = this.#bookings.get(id);
    if (!booking) throw fail('not_found');
    return booking;
  }

  #view(booking) {
    return { ...booking, ...(booking.cancellation ? { cancellation: { ...booking.cancellation } } : {}) };
  }

  availableUnits(sku, startDate, endDate) {
    let used = 0;
    for (const b of this.#bookings.values()) {
      if (b.status !== 'cancelled' && b.sku === sku && overlaps(b.startDate, b.endDate, startDate, endDate)) used += b.qty;
    }
    return (this.stock[sku] ?? 0) - used;
  }

  create({ customerId, sku, startDate, endDate, qty = 1 }) {
    if (!customerId) throw fail('invalid_customer');
    const item = this.catalog.get(sku);
    const q = quote({ item, startDate, endDate, qty });
    if (this.availableUnits(sku, startDate, endDate) < qty) throw fail('not_available');
    const id = this.ids();
    const { paymentRef } = this.payments.charge({ customerId, cents: q.totalCents, ref: id });
    const booking = {
      id,
      customerId,
      sku,
      qty,
      startDate,
      endDate,
      rentalCents: q.rentalCents,
      depositCents: q.depositCents,
      paidCents: q.totalCents,
      paymentRef,
      status: 'confirmed',
      createdOn: this.clock.today(),
    };
    this.#bookings.set(id, booking);
    this.events.emit('booking.created', { bookingId: id, customerId });
    return this.#view(booking);
  }

  get(id) {
    return this.#view(this.#require(id));
  }

  list({ customerId } = {}) {
    return [...this.#bookings.values()].filter((b) => !customerId || b.customerId === customerId).map((b) => this.#view(b));
  }

  // Annullamento con penale (REQ-2): prima si valida e si calcola, poi si cambia lo stato (ADR-005).
  cancel(id, { on } = {}) {
    const booking = this.#require(id);
    if (booking.status === 'cancelled') throw fail('already_cancelled');
    const cancelledOn = on ?? this.clock.today();
    const breakdown = refundBreakdown({
      rentalCents: booking.rentalCents,
      depositCents: booking.depositCents,
      startDate: booking.startDate,
      cancelDate: cancelledOn,
    });
    // Avviso al cliente nella stessa operazione (ADR-003), prima di cambiare lo stato (ADR-005).
    this.outbox.enqueue({
      to: booking.customerId,
      subject: 'Prenotazione annullata',
      body: cancellationMessage(booking.id, breakdown),
      dedupeKey: `cancel:${booking.id}`,
    });
    booking.status = 'cancelled';
    booking.cancellation = { ...breakdown, cancelledOn };
    this.events.emit('booking.cancelled', {
      bookingId: booking.id,
      customerId: booking.customerId,
      feeCents: breakdown.feeCents,
      refundCents: breakdown.refundCents,
    });
    return this.#view(booking);
  }
}
