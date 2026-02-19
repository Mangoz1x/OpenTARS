import { EventEmitter } from "events";
import type { SSEEvent, SSEEventType } from "./types.js";

export class TaskEventBus {
  private events: SSEEvent[] = [];
  private emitter = new EventEmitter();
  private nextId = 1;
  private closed = false;

  emit(event: SSEEventType, data: Record<string, unknown>): void {
    if (this.closed) return;

    const sseEvent: SSEEvent = {
      id: this.nextId++,
      event,
      data,
      timestamp: Date.now(),
    };

    this.events.push(sseEvent);
    this.emitter.emit("event", sseEvent);
  }

  async *subscribe(lastEventId?: number): AsyncGenerator<SSEEvent> {
    // Replay buffered events after lastEventId
    const startIdx = lastEventId
      ? this.events.findIndex((e) => e.id > lastEventId)
      : 0;

    if (startIdx >= 0) {
      for (let i = startIdx; i < this.events.length; i++) {
        yield this.events[i];
      }
    }

    // If already closed, no more events to yield
    if (this.closed) return;

    // Listen for new events using a promise queue
    const queue: SSEEvent[] = [];
    let resolve: (() => void) | null = null;

    const onEvent = (event: SSEEvent) => {
      queue.push(event);
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    const onClose = () => {
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    this.emitter.on("event", onEvent);
    this.emitter.on("close", onClose);

    try {
      while (!this.closed || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else if (this.closed) {
          break;
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      }
    } finally {
      this.emitter.off("event", onEvent);
      this.emitter.off("close", onClose);
    }
  }

  close(): void {
    this.closed = false;
    this.closed = true;
    this.emitter.emit("close");
  }

  getEvents(): SSEEvent[] {
    return [...this.events];
  }
}
