// Spedizioni: le regole stanno in shipping-table.js (dati), qui solo l'algoritmo. Importi in centesimi, pesi in grammi.
import { SHIPPING_TABLE } from './shipping-table.js';

export function zoneFor(country, table = SHIPPING_TABLE) {
  for (const [name, zone] of Object.entries(table.zones)) {
    if (zone.countries.includes(country)) return name;
  }
  return table.defaultZone;
}

// Peso fatturabile: arrotondato per eccesso a roundingGrams.
export function billableGrams(grams, table = SHIPPING_TABLE) {
  return Math.round(grams / table.roundingGrams) * table.roundingGrams;
}

export function shippingCost(country, grams, orderSubtotalCents = 0, table = SHIPPING_TABLE) {
  if (!Number.isFinite(grams) || grams <= 0) throw new RangeError('Invalid weight');
  const zoneName = zoneFor(country, table);
  const w = billableGrams(grams, table);
  const free = table.freeShipping;
  if (free && free.zone === zoneName && orderSubtotalCents >= free.minSubtotalCents) return 0;
  const zone = table.zones[zoneName];
  const tier = zone.tiers.find((t) => (t.inclusive ? w <= t.maxGrams : w < t.maxGrams));
  if (tier) return tier.priceCents;
  const last = zone.tiers[zone.tiers.length - 1];
  return last.priceCents + Math.ceil((w - last.maxGrams) / 1000) * zone.extraPerKgCents;
}
