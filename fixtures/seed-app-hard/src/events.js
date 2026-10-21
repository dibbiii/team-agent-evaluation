// Bus di eventi sincrono. Gli handler vengono chiamati nell'ordine di sottoscrizione.
export class EventBus {
  #handlers = new Map();

  on(type, handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    const list = this.#handlers.get(type) ?? [];
    list.push(handler);
    this.#handlers.set(type, list);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    const list = this.#handlers.get(type);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  emit(type, payload) {
    const list = this.#handlers.get(type);
    if (!list) return 0;
    let called = 0;
    for (const handler of list) {
      handler(payload);
      called++;
    }
    return called;
  }

  listenerCount(type) {
    return this.#handlers.get(type)?.length ?? 0;
  }
}
