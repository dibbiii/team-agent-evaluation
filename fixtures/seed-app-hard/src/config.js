// Costanti di configurazione. Gli importi sono sempre centesimi interi (ADR-006).
export const BASE_CURRENCY = 'EUR';

// Sconto fedeltà in punti base (1 bp = 0,01%).
export const LOYALTY_TIERS_BP = { silver: 300, gold: 500, platinum: 800 };

export const MAX_TEXT_LENGTH = 200;
export const MAX_QTY_PER_LINE = 99;

// Stati che contano come venduto nei report.
export const COUNTED_STATUSES = ['paid', 'shipped', 'delivered'];
export const REFUNDABLE_STATUSES = ['paid', 'shipped', 'delivered'];
