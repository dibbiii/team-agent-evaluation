import { roundHalfUp } from './money.js';
import { LOYALTY_TIERS_BP } from './config.js';

export const DISCOUNT_CODES = {
  SAVE10: { percent: 10 },
  SAVE25: { percent: 25 },
  WELCOME5: { fixedCents: 500 },
};

// Importo dello sconto (non il totale scontato), arrotondato half-up al centesimo.
export function percentOff(amountCents, percent) {
  return roundHalfUp(amountCents * percent, 100);
}

export function codeDiscount(subtotalCents, code) {
  if (code === undefined || code === null || code === '') return 0;
  if (!Object.hasOwn(DISCOUNT_CODES, code)) throw new Error(`Unknown discount code: ${code}`);
  const def = DISCOUNT_CODES[code];
  if (def.fixedCents !== undefined) return Math.min(def.fixedCents, subtotalCents);
  return percentOff(subtotalCents, def.percent);
}

export function loyaltyDiscount(subtotalCents, customer) {
  const bp = customer?.tier ? LOYALTY_TIERS_BP[customer.tier] : undefined;
  return bp ? roundHalfUp(subtotalCents * bp, 10000) : 0;
}

// ADR-002: gli sconti non si cumulano mai. Si applica un solo sconto, il più vantaggioso per il cliente
// (a parità vince il codice).
export function bestDiscount(subtotalCents, { code, customer } = {}) {
  const byCode = codeDiscount(subtotalCents, code);
  const byLoyalty = loyaltyDiscount(subtotalCents, customer);
  if (byCode === 0 && byLoyalty === 0) return { kind: 'none', amountCents: 0 };
  if (byCode >= byLoyalty) return { kind: 'code', code, amountCents: byCode };
  return { kind: 'loyalty', tier: customer.tier, amountCents: byLoyalty };
}

// Compatibilità: totale scontato con il solo codice.
export function applyCode(amountCents, code) {
  return amountCents - codeDiscount(amountCents, code);
}
