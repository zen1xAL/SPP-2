import type { DatabaseSync } from 'node:sqlite';
import { SERVER_CONFIG } from '../shared/constants.js';
import { pubsub } from '../pubsub.js';

interface RandomProductRow {
  id: string;
  title: string;
  price: number;
}

export class RealtimeTickerService {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly db: DatabaseSync) {}

  start(intervalMs: number = SERVER_CONFIG.TICKER_INTERVAL_MS): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.generateTick();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private generateTick(): void {
    try {
      const statement = this.db.prepare('SELECT id, title, price FROM products ORDER BY RANDOM() LIMIT 1');
      const randomProduct = statement.get() as RandomProductRow | undefined;

      if (!randomProduct) {
        return;
      }

      const rawChange = Math.random() * SERVER_CONFIG.TICKER_FLUCTUATION_SPAN - SERVER_CONFIG.TICKER_FLUCTUATION_OFFSET;
      const changePercent = Math.round(rawChange * 10) / 10;
      if (changePercent === 0) {
        return;
      }

      const calculatedPrice = randomProduct.price * (1 + changePercent / 100);
      const newPrice = Math.max(SERVER_CONFIG.TICKER_MIN_PRICE, Math.round(calculatedPrice * 100) / 100);
      const timestamp = new Date().toISOString();

      this.db.prepare('UPDATE products SET price = ? WHERE id = ?').run(newPrice, randomProduct.id);
      this.db
        .prepare('INSERT INTO price_history (id, product_id, price, recorded_at) VALUES (?, ?, ?, ?)')
        .run(`ph-${randomProduct.id}-${Date.now()}`, randomProduct.id, newPrice, timestamp);

      pubsub.publishTicker({
        productId: randomProduct.id,
        title: randomProduct.title,
        oldPrice: randomProduct.price,
        newPrice,
        changePercent,
        timestamp
      });
    } catch (err: unknown) {
      console.warn('[RealtimeTickerService] Tick generation skipped:', err instanceof Error ? err.message : String(err));
    }
  }
}
