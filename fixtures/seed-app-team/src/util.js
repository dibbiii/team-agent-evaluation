// Errori con codice, orologio e generatore di id iniettabili (nessun Date.now, nessun Math.random).
export function fail(code, message = code) {
  return Object.assign(new Error(message), { code });
}

export function createClock(today) {
  let current = today;
  return {
    today: () => current,
    set(date) {
      current = date;
    },
  };
}

export function createIdGenerator(prefix) {
  let n = 0;
  return () => `${prefix}_${++n}`;
}
