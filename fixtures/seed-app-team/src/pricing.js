import { daysBetween } from './calendar.js';
import { WEEKLY_DISCOUNT_FROM_DAYS, WEEKLY_DISCOUNT_PERCENT } from './config.js';
import { pct } from './money.js';
import { fail } from './util.js';

// Preventivo di noleggio: tariffa giornaliera x giorni x quantità, sconto settimanale, deposito a parte.
// Il giorno di fine non si paga (intervallo [start, end)).
export function quote({ item, startDate, endDate, qty = 1 }) {
  const days = daysBetween(startDate, endDate);
  if (days < 1) throw fail('invalid_period');
  if (!Number.isInteger(qty) || qty < 1) throw fail('invalid_quantity');
  let rentalCents = item.dailyRateCents * days * qty;
  if (days >= WEEKLY_DISCOUNT_FROM_DAYS) rentalCents -= pct(rentalCents, WEEKLY_DISCOUNT_PERCENT);
  const depositCents = item.depositCents * qty;
  return { days, rentalCents, depositCents, totalCents: rentalCents + depositCents };
}
