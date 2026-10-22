// Bus di eventi sincrono. Gli handler che lanciano non fermano gli altri: l'errore finisce in `errors`.
export class EventBus {
  #handlers = new Map();
  log = [];
  errors = [];

  on(type, handler) {
    const list = this.#handlers.get(type) ?? [];
    list.push(handler);
    this.#handlers.set(type, list);
    return () => {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit(type, payload) {
    this.log.push({ type, payload });
    for (const handler of [...(this.#handlers.get(type) ?? [])]) {
      try {
        handler(payload);
      } catch (error) {
        this.errors.push({ type, error });
      }
    }
  }
}
