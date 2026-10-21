// Sottoscrittori di esempio del bus di eventi: registro di audit e avviso di scorta bassa.

// Registra ogni evento order.* in `sink` (una funzione). Restituisce la funzione di disiscrizione.
export function registerAuditLog(events, sink, types = ['created', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded']) {
  const offs = types.map((t) =>
    events.on(`order.${t}`, (payload) => sink({ type: `order.${t}`, orderId: payload.orderId })),
  );
  return () => offs.forEach((off) => off());
}

// Dopo ogni spedizione avvisa (notify) gli sku del dato ordine con giacenza sotto soglia.
export function registerLowStockAlert(events, { orders, inventory, threshold = 5, notify }) {
  return events.on('order.shipped', ({ orderId }) => {
    const order = orders.getOrder(orderId);
    const seen = new Set();
    for (const line of order.lines) {
      if (seen.has(line.sku)) continue;
      seen.add(line.sku);
      const left = inventory.available(line.sku);
      if (left < threshold) notify({ sku: line.sku, left });
    }
  });
}
