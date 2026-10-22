import { daysBetween } from './calendar.js';
import { assertCents, ceilDiv } from './money.js';
import { fail } from './util.js';

// Scaglioni di penale sui giorni di anticipo (REQ-1). Dopo la data di inizio vale il 100% (risposta dell'oracolo).
export const FEE_TIERS = [
  { tier: 'free', minDays: 7, percent: 0 },
  { tier: 'partial', minDays: 3, percent: 30 },
  { tier: 'late', minDays: 0, percent: 70 },
];
const STARTED = { tier: 'started', percent: 100 };

export function cancellationFee({ rentalCents, startDate, cancelDate }) {
  assertCents(rentalCents, 'rentalCents');
  if (rentalCents < 0) throw fail('invalid_amount');
  const daysBefore = daysBetween(cancelDate, startDate);
  const { tier, percent } = daysBefore < 0 ? STARTED : FEE_TIERS.find((t) => daysBefore >= t.minDays);
  // La penale si arrotonda per eccesso al centesimo (risposta dell'oracolo).
  return { feeCents: ceilDiv(rentalCents * percent, 100), percent, tier, daysBefore };
}

export function refundBreakdown({ rentalCents, depositCents, startDate, cancelDate }) {
  assertCents(depositCents, 'depositCents');
  const { feeCents, percent, tier, daysBefore } = cancellationFee({ rentalCents, startDate, cancelDate });
  return { rentalCents, depositCents, feeCents, refundCents: rentalCents - feeCents + depositCents, percent, tier, daysBefore };
}

export function assertBreakdown(b) {
  const bad = (why) => fail('invalid_breakdown', `breakdown non valido: ${why}`);
  if (!b || typeof b !== 'object') throw bad('assente');
  for (const key of ['rentalCents', 'depositCents', 'feeCents', 'refundCents']) {
    if (!Number.isInteger(b[key])) throw bad(`${key} non è un intero`);
  }
  if (b.depositCents < 0) throw bad('deposito negativo');
  if (b.feeCents < 0 || b.feeCents > b.rentalCents) throw bad('penale fuori da 0..rentalCents');
  if (b.refundCents !== b.rentalCents - b.feeCents + b.depositCents) throw bad('rimborso incoerente');
  return b;
}
