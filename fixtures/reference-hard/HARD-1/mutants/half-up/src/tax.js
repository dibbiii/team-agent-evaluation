import { roundHalfUp } from './money.js';

// Aliquote IVA in punti base per paese e categoria.
export const TAX_RATES_BP = {
  IT: { standard: 2200, reduced: 1000, books: 400, exempt: 0 },
  DE: { standard: 1900, reduced: 700, books: 700, exempt: 0 },
  FR: { standard: 2000, reduced: 550, books: 550, exempt: 0 },
  ES: { standard: 2100, reduced: 1000, books: 400, exempt: 0 },
};

export function taxRate(country, category = 'standard') {
  const table = Object.hasOwn(TAX_RATES_BP, country) ? TAX_RATES_BP[country] : undefined;
  if (!table) throw new Error(`Unknown country: ${country}`);
  if (!Object.hasOwn(table, category)) throw new Error(`Unknown tax category: ${category}`);
  return table[category];
}

// ADR-001: l'IVA si calcola PER RIGA, sull'imponibile della riga, con arrotondamento half-even.
export function lineTax(taxableCents, rateBp) {
  return roundHalfUp(taxableCents * rateBp, 10000);
}
