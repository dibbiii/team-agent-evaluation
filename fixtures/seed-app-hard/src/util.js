// Utilità condivise. Orologio e generatore di id sono iniettabili (test deterministici).
export const systemClock = { now: () => new Date().toISOString() };

export function createClock(startIso = '2026-01-01T00:00:00.000Z', stepMs = 1000) {
  let t = Date.parse(startIso);
  return {
    now() {
      const iso = new Date(t).toISOString();
      t += stepMs;
      return iso;
    },
  };
}

export function createIdGenerator(prefix) {
  let n = 0;
  return () => `${prefix}_${++n}`;
}

export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

// Limita un numero all'intervallo [min, max].
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Solo la parte data (YYYY-MM-DD) di un timestamp ISO.
export function isoDate(iso) {
  return String(iso).slice(0, 10);
}
