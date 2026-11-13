import { EventEmitter } from 'node:events';
import { PUBSUB_CONFIG, PUBSUB_TOPICS, type PubSubTopic } from './shared/constants.js';

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

function createEventIterator<T>(emitter: EventEmitter, eventName: PubSubTopic): AsyncIterableIterator<T> {
  const queue: T[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;

  const listener = (event: T): void => {
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
      const item = queue.shift();
      if (item !== undefined) {
        return { value: item, done: false };
      }

      if (done) {
        return { value: undefined, done: true };
      }

      await new Promise<void>((resolve) => {
        resolveNext = resolve;
      });

      const delayedItem = queue.shift();
      if (delayedItem !== undefined) {
        return { value: delayedItem, done: false };
      }

      return { value: undefined, done: true };
    },
    async return(): Promise<IteratorResult<T>> {
      done = true;
      emitter.off(eventName, listener);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
      return { value: undefined, done: true };
    }
  };
}

class MarketplacePubSub {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(PUBSUB_CONFIG.MAX_LISTENERS);
  }

  publishTicker(event: TickerEvent): void {
    this.emitter.emit(PUBSUB_TOPICS.TICKER_UPDATED, event);
  }

  publishReview(event: NewReviewEvent): void {
    this.emitter.emit(PUBSUB_TOPICS.REVIEW_ADDED, event);
  }

  publishStock(event: StockUpdateEvent): void {
    this.emitter.emit(PUBSUB_TOPICS.STOCK_UPDATED, event);
  }

  subscribeTicker(): AsyncIterableIterator<TickerEvent> {
    return createEventIterator<TickerEvent>(this.emitter, PUBSUB_TOPICS.TICKER_UPDATED);
  }

  subscribeReview(): AsyncIterableIterator<NewReviewEvent> {
    return createEventIterator<NewReviewEvent>(this.emitter, PUBSUB_TOPICS.REVIEW_ADDED);
  }

  subscribeStock(): AsyncIterableIterator<StockUpdateEvent> {
    return createEventIterator<StockUpdateEvent>(this.emitter, PUBSUB_TOPICS.STOCK_UPDATED);
  }
}

export const pubsub = new MarketplacePubSub();
