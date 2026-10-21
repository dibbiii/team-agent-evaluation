// Bus di eventi sincrono.
// - Gli handler sono chiamati nell'ordine di sottoscrizione (anche lo stesso handler sottoscritto più volte).
// - Un handler che lancia (o la cui promise viene rifiutata) non impedisce agli altri di girare: l'errore va a
//   onError(error, { type, payload }); senza onError viene accumulato in bus.errors ({ error, type, payload }).
// - emit lavora su una fotografia degli handler: chi viene disiscritto durante l'emit prima del proprio turno non
//   viene chiamato; chi viene aggiunto durante l'emit scatta dal prossimo.
export class EventBus {
  #subs = new Map();

  constructor({ onError } = {}) {
    this.onError = onError;
    this.errors = [];
  }

  on(type, handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    const sub = { handler, active: true };
    const list = this.#subs.get(type) ?? [];
    list.push(sub);
    this.#subs.set(type, list);
    return () => this.#remove(type, sub);
  }

  off(type, handler) {
    const sub = (this.#subs.get(type) ?? []).find((s) => s.handler === handler);
    if (sub) this.#remove(type, sub);
  }

  emit(type, payload) {
    const snapshot = this.#subs.get(type);
    if (!snapshot) return 0;
    let called = 0;
    for (const sub of snapshot) {
      if (!sub.active) continue;
      called++;
      try {
        const result = sub.handler(payload);
        if (result && typeof result.then === 'function') {
          result.then(undefined, (error) => this.#report(error, type, payload));
        }
      } catch (error) {
        this.#report(error, type, payload);
      }
    }
    return called;
  }

  listenerCount(type) {
    return this.#subs.get(type)?.length ?? 0;
  }

  #remove(type, sub) {
    if (!sub.active) return;
    sub.active = false;
    // Copy-on-write: un emit in corso continua a iterare sulla sua fotografia.
    const list = this.#subs.get(type) ?? [];
    list.splice(list.indexOf(sub), 1);
  }

  #report(error, type, payload) {
    if (!this.onError) {
      this.errors.push({ error, type, payload });
      return;
    }
    try {
      this.onError(error, { type, payload });
    } catch {
      // un onError difettoso non deve rompere il bus
    }
  }
}
