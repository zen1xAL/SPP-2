import { EventEmitter } from 'node:events';

export interface TickerEvent {
  productId: string;
  title: string;
  oldPrice: number;
  newPrice: number;
  changePercent: number;
  timestamp: string;
}

export interface NewReviewEvent {
  id: string;
  productId: string;
  productTitle: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface StockUpdateEvent {
  productId: string;
  warehouseName: string;
  city: string;
  quantity: number;
  updatedAt: string;
}

function createEventIterator<T>(emitter: EventEmitter, eventName: string): AsyncIterableIterator<T> {
  const queue: T[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;

  const listener = (event: T) => {
    queue.push(event);
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  };

  emitter.on(eventName, listener);

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next(): Promise<IteratorResult<T>> {
      if (queue.length > 0) {
        return { value: queue.shift()!, done: false };
      }
      if (done) {
        return { value: undefined as unknown as T, done: true };
      }
      await new Promise<void>((resolve) => {
        resolveNext = resolve;
      });
      return { value: queue.shift()!, done: false };
    },
    async return(): Promise<IteratorResult<T>> {
      done = true;
      emitter.off(eventName, listener);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
      return { value: undefined as unknown as T, done: true };
    }
  };
}

class MarketplacePubSub {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publishTicker(event: TickerEvent): void {
    this.emitter.emit('TICKER_UPDATED', event);
  }

  publishReview(event: NewReviewEvent): void {
    this.emitter.emit('REVIEW_ADDED', event);
  }

  publishStock(event: StockUpdateEvent): void {
    this.emitter.emit('STOCK_UPDATED', event);
  }

  subscribeTicker(): AsyncIterableIterator<TickerEvent> {
    return createEventIterator<TickerEvent>(this.emitter, 'TICKER_UPDATED');
  }

  subscribeReview(): AsyncIterableIterator<NewReviewEvent> {
    return createEventIterator<NewReviewEvent>(this.emitter, 'REVIEW_ADDED');
  }

  subscribeStock(): AsyncIterableIterator<StockUpdateEvent> {
    return createEventIterator<StockUpdateEvent>(this.emitter, 'STOCK_UPDATED');
  }
}

export const pubsub = new MarketplacePubSub();
