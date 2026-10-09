/** Minimal event emitter that works in Node and in the browser. */
export class Emitter {
    constructor() {
        this.handlers = new Map();
    }

    on(event, handler) {
        if (!this.handlers.has(event)) this.handlers.set(event, new Set());
        this.handlers.get(event).add(handler);
        return () => this.handlers.get(event).delete(handler);
    }

    emit(event, payload) {
        for (const handler of [...(this.handlers.get(event) || [])]) {
            try {
                handler(payload);
            } catch {
                /* a failing listener must not break the emitter */
            }
        }
    }
}
