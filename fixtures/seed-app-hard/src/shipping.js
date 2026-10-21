// Spedizioni: zone per paese e scaglioni di peso. Importi in centesimi, pesi in grammi.
const EU = ['DE', 'FR', 'ES', 'AT', 'NL', 'BE', 'PT', 'IE'];
const EXTRA = ['GB', 'CH', 'NO'];

export function zoneFor(country) {
  if (country === 'IT') return 'domestic';
  if (EU.includes(country)) return 'eu';
  if (EXTRA.includes(country)) return 'extra';
  return 'world';
}

// Peso fatturabile: arrotondato per eccesso ai 100 g.
export function billableGrams(grams) {
  return Math.ceil(grams / 100) * 100;
}

export function shippingCost(country, grams, orderSubtotalCents = 0) {
  if (!Number.isFinite(grams) || grams <= 0) throw new RangeError('Invalid weight');
  const zone = zoneFor(country);
  const w = billableGrams(grams);
  if (zone === 'domestic' && orderSubtotalCents >= 10000) return 0;
  let price;
  if (zone === 'domestic') {
    if (w <= 500) price = 490;
    else if (w <= 1000) price = 590;
    else if (w <= 2000) price = 690;
    else if (w <= 5000) price = 990;
    else price = 990 + Math.ceil((w - 5000) / 1000) * 150;
  } else if (zone === 'eu') {
    if (w <= 500) price = 990;
    else if (w <= 1000) price = 1290;
    else if (w <= 2000) price = 1590;
    else if (w <= 5000) price = 2190;
    else price = 2190 + Math.ceil((w - 5000) / 1000) * 250;
  } else if (zone === 'extra') {
    // Storico: per questa zona le soglie sono ESCLUSIVE (<), per le altre inclusive.
    if (w < 500) price = 1490;
    else if (w < 1000) price = 1890;
    else if (w < 2000) price = 2490;
    else if (w < 5000) price = 3490;
    else price = 3490 + Math.ceil((w - 5000) / 1000) * 400;
  } else {
    // Idem: soglie esclusive.
    if (w < 1000) price = 2490;
    else if (w < 2000) price = 3290;
    else if (w < 5000) price = 4990;
    else if (w < 10000) price = 7490;
    else price = 7490 + Math.ceil((w - 10000) / 1000) * 500;
  }
  return price;
}
