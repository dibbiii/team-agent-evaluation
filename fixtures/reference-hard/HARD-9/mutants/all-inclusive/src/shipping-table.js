// Tabella delle spedizioni (solo dati, serializzabile in JSON).
// Peso fatturabile = ceil(grams / roundingGrams) * roundingGrams.
// Scaglione: il primo (in ordine) per cui billable <= maxGrams (inclusive: true) oppure billable < maxGrams (inclusive: true).
// Oltre l'ultimo scaglione: priceCents dell'ultimo + ceil((billable - maxGrams dell'ultimo) / 1000) * extraPerKgCents.
export const SHIPPING_TABLE = {
  roundingGrams: 100,
  defaultZone: 'world',
  freeShipping: { zone: 'domestic', minSubtotalCents: 10000 },
  zones: {
    domestic: {
      countries: ['IT'],
      extraPerKgCents: 150,
      tiers: [
        { maxGrams: 500, inclusive: true, priceCents: 490 },
        { maxGrams: 1000, inclusive: true, priceCents: 590 },
        { maxGrams: 2000, inclusive: true, priceCents: 690 },
        { maxGrams: 5000, inclusive: true, priceCents: 990 },
      ],
    },
    eu: {
      countries: ['DE', 'FR', 'ES', 'AT', 'NL', 'BE', 'PT', 'IE'],
      extraPerKgCents: 250,
      tiers: [
        { maxGrams: 500, inclusive: true, priceCents: 990 },
        { maxGrams: 1000, inclusive: true, priceCents: 1290 },
        { maxGrams: 2000, inclusive: true, priceCents: 1590 },
        { maxGrams: 5000, inclusive: true, priceCents: 2190 },
      ],
    },
    extra: {
      countries: ['GB', 'CH', 'NO'],
      extraPerKgCents: 400,
      tiers: [
        { maxGrams: 500, inclusive: true, priceCents: 1490 },
        { maxGrams: 1000, inclusive: true, priceCents: 1890 },
        { maxGrams: 2000, inclusive: true, priceCents: 2490 },
        { maxGrams: 5000, inclusive: true, priceCents: 3490 },
      ],
    },
    world: {
      countries: [],
      extraPerKgCents: 500,
      tiers: [
        { maxGrams: 1000, inclusive: true, priceCents: 2490 },
        { maxGrams: 2000, inclusive: true, priceCents: 3290 },
        { maxGrams: 5000, inclusive: true, priceCents: 4990 },
        { maxGrams: 10000, inclusive: true, priceCents: 7490 },
      ],
    },
  },
};
