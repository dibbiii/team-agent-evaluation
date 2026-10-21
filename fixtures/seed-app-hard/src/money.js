// Importi in centesimi interi (ADR-006): nessun float nei calcoli monetari.

export const CURRENCIES = { EUR: { decimals: 2 } };

export function assertCents(value, label = 'amount') {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be an integer number of cents`);
  return value;
}

// Divisione intera num/den con arrotondamento; num intero (anche negativo), den intero > 0.
function divRound(num, den, mode) {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den <= 0) {
    throw new RangeError('divRound: invalid operands');
  }
  const sign = num < 0 ? -1 : 1;
  const abs = Math.abs(num);
  const q = Math.floor(abs / den);
  const twice = (abs - q * den) * 2;
  let up;
  if (twice > den) up = true;
  else if (twice < den) up = false;
  else up = mode === 'half-up' ? true : q % 2 === 1; // metà: half-up = via da zero, half-even = al pari
  const res = q + (up ? 1 : 0);
  return res === 0 ? 0 : sign * res;
}

export const roundHalfUp = (num, den) => divRound(num, den, 'half-up');
export const roundHalfEven = (num, den) => divRound(num, den, 'half-even');

// Ripartisce `total` in parti proporzionali ai pesi (metodo del resto maggiore; a parità vince l'indice minore).
// La somma delle parti è sempre esattamente `total`.
export function allocate(total, weights) {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    if (total === 0) return weights.map(() => 0);
    throw new RangeError('allocate: weights must sum to a positive number');
  }
  const shares = weights.map((w) => Math.floor((total * w) / sumW));
  const order = weights
    .map((w, i) => ({ i, rem: total * w - shares[i] * sumW }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  let left = total - shares.reduce((a, b) => a + b, 0);
  for (let k = 0; left > 0; k++, left--) shares[order[k].i] += 1;
  return shares;
}

export function formatEuro(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}${euros},${rest} EUR`;
}

// Decimale con punto, due cifre, senza simbolo (es. 1250 -> "12.50"); usato per l'esportazione contabile.
export function toDecimalString(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Deprecato: restituisce un float. Usare toDecimalString o formatEuro.
export function centsToEuros(cents) {
  return cents / 100;
}
