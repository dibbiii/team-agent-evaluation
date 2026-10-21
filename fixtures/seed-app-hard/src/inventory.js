// Scorte: giacenza fisica (onHand) e prenotazioni per ordine. available = onHand - prenotato.
export class Inventory {
  #onHand = new Map();
  #reservations = new Map();

  constructor(initial = {}) {
    for (const [sku, qty] of Object.entries(initial)) this.#onHand.set(sku, qty);
  }

  onHand(sku) {
    return this.#onHand.get(sku) ?? 0;
  }

  reserved(sku) {
    let n = 0;
    for (const r of this.#reservations.values()) n += r.get(sku) ?? 0;
    return n;
  }

  available(sku) {
    return this.onHand(sku) - this.reserved(sku);
  }

  // Tutto o niente: se una riga non è disponibile non viene prenotato nulla.
  reserve(orderId, lines) {
    if (this.#reservations.has(orderId)) throw new Error(`Order ${orderId} already has a reservation`);
    const needed = new Map();
    for (const { sku, qty } of lines) needed.set(sku, (needed.get(sku) ?? 0) + qty);
    for (const [sku, qty] of needed) {
      if (this.available(sku) < qty) throw new Error(`Insufficient stock for ${sku}`);
    }
    this.#reservations.set(orderId, needed);
  }

  release(orderId) {
    return this.#reservations.delete(orderId);
  }

  // Alla spedizione la prenotazione diventa uscita di magazzino.
  commit(orderId) {
    const r = this.#reservations.get(orderId);
    if (!r) throw new Error(`No reservation for ${orderId}`);
    for (const [sku, qty] of r) this.#onHand.set(sku, this.onHand(sku) - qty);
    this.#reservations.delete(orderId);
  }

  restock(sku, qty) {
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Invalid quantity');
    this.#onHand.set(sku, this.onHand(sku) + qty);
  }
}
