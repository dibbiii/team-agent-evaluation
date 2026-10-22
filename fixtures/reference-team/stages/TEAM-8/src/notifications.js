import { formatEuro } from './money.js';
import { fail } from './util.js';

// Testo dell'avviso di annullamento (REQ-5).
export function cancellationMessage(bookingId, { feeCents, refundCents, refundMethod = 'credit' }) {
  if (refundMethod === 'original') {
    return `Prenotazione ${bookingId} annullata. Nessuna penale. Rimborso di ${formatEuro(refundCents)} sul metodo di pagamento originale.`;
  }
  return `Prenotazione ${bookingId} annullata. Penale: ${formatEuro(feeCents)}. Credito accreditato: ${formatEuro(refundCents)}.`;
}

// Outbox: le notifiche si scrivono qui nella stessa operazione di dominio (ADR-003) e un worker le spedisce.
export class Outbox {
  messages = [];
  #n = 0;

  enqueue({ to, subject, body, dedupeKey = null }) {
    if (!to || !subject || !body) throw fail('invalid_message');
    if (dedupeKey) {
      const existing = this.messages.find((m) => m.dedupeKey === dedupeKey);
      if (existing) return existing;
    }
    const message = { id: `msg_${++this.#n}`, to, subject, body, dedupeKey, status: 'pending' };
    this.messages.push(message);
    return message;
  }

  pending() {
    return this.messages.filter((m) => m.status === 'pending');
  }

  markSent(id) {
    const message = this.messages.find((m) => m.id === id);
    if (!message) throw fail('not_found');
    message.status = 'sent';
  }
}
