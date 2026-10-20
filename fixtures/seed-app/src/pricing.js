// Prezzi sempre in centesimi (interi).

export const DISCOUNT_CODES = {
  SAVE10: 10,
  SAVE25: 25,
};

export function percentOff(amountCents, percent) {
  // BUG noto (ISSUE-1): l'arrotondamento usa floor invece del centesimo più vicino.
  return Math.floor(amountCents * (1 - percent / 100));
}

export function applyCode(amountCents, code) {
  if (code === undefined || code === null || code === '') return amountCents;
  const percent = DISCOUNT_CODES[code];
  if (percent === undefined) throw new Error(`Unknown discount code: ${code}`);
  return percentOff(amountCents, percent);
}
