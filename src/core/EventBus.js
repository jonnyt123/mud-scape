// src/core/EventBus.js
// Small deterministic event bus for state <-> UI.
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const set = this.listeners.get(type);
    if (!set) return;
    set.delete(fn);
    if (!set.size) this.listeners.delete(type);
  }

  emit(event) {
    const set = this.listeners.get(event.type);
    if (!set) return;
    for (const fn of set) fn(event);
  }
}
