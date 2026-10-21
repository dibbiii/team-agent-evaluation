import { TAX_RATES_BP } from './tax.js';
import { LOYALTY_TIERS_BP, MAX_QTY_PER_LINE, MAX_TEXT_LENGTH } from './config.js';

export function validateEmail(email) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('Invalid email');
  }
  return email.trim();
}

export function validateQuantity(qty) {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) throw new Error('Invalid quantity');
  return qty;
}

export function validateCountry(country) {
  if (!Object.hasOwn(TAX_RATES_BP, country)) throw new Error(`Unknown country: ${country}`);
  return country;
}

// I campi di testo del cliente sono dati non fidati (ADR-005): qui si controllano solo forma e lunghezza,
// l'escaping spetta a chi li emette verso un altro formato.
export function validateCustomer({ id, name, email, tier = null } = {}) {
  if (typeof id !== 'string' || id === '') throw new Error('Invalid customer id');
  if (typeof name !== 'string' || name.trim() === '' || name.length > MAX_TEXT_LENGTH) {
    throw new Error('Invalid customer name');
  }
  if (tier !== null && !Object.hasOwn(LOYALTY_TIERS_BP, tier)) throw new Error(`Unknown tier: ${tier}`);
  return { id, name, email: validateEmail(email), tier };
}
