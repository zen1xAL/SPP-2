import type { ProductRecord, ReviewRecord, PriceHistoryRecord, WarehouseRecord, StockRecord } from '../db.js';
import { SEED_CONFIG } from '../shared/constants.js';

export interface GeneratedSeedData {
  products: ProductRecord[];
  reviews: ReviewRecord[];
  priceHistory: PriceHistoryRecord[];
  warehouses: WarehouseRecord[];
  stocks: StockRecord[];
}

const CATEGORIES = ['electronics', 'computers', 'audio', 'wearables', 'appliances', 'networking', 'accessories'] as const;
const BRANDS = ['NexusCore', 'ApexPulse', 'SpectraTech', 'VortexPro', 'QuantumLabs', 'CyberDyne', 'HyperLink', 'AeroDynamics'] as const;
const ADJECTIVES = ['Ultra', 'Pro', 'Elite', 'Titanium', 'Precision', 'Compact', 'Modular', 'Dynamic', 'Aero', 'Matrix'] as const;
const NOUNS = ['Router', 'Monitor', 'Headset', 'Keyboard', 'Sensor', 'Microphone', 'Docking Station', 'Webcam', 'Storage Drive', 'Power Hub'] as const;

export const STANDARD_WAREHOUSES: readonly WarehouseRecord[] = [
  { id: 'wh-1', name: 'Central Distribution Center', city: 'Minsk' },
  { id: 'wh-2', name: 'Logistics Depot North', city: 'Vilnius' },
  { id: 'wh-3', name: 'Rapid Transit Terminal', city: 'Warsaw' },
  { id: 'wh-4', name: 'Automated Fulfillment Station', city: 'Berlin' }
] as const;

function generateSeedProduct(index: number, now: number): ProductRecord {
  const adj = ADJECTIVES[index % ADJECTIVES.length] ?? 'Standard';
  const noun = NOUNS[index % NOUNS.length] ?? 'Device';
  const brand = BRANDS[index % BRANDS.length] ?? 'NexusCore';
  const category = CATEGORIES[index % CATEGORIES.length] ?? 'electronics';

  const basePrice = Math.round((SEED_CONFIG.BASE_PRICE_OFFSET + ((index * 17) % 850) + (index % 7) * 9.5) * 100) / 100;
  const rating = Math.round((SEED_CONFIG.BASE_RATING_OFFSET + ((index * 3) % 19) * 0.1) * 10) / 10;
  const productId = `gen-prod-${index}`;

  return {
    id: productId,
    title: `${brand} ${adj} ${noun} ${100 + index}`,
    description: `High-performance industrial grade ${adj.toLowerCase()} ${noun.toLowerCase()} with advanced telemetry, robust thermal shielding and 3-year enterprise warranty.`,
    price: basePrice,
    category,
    brand,
    rating,
    source: 'generator',
    created_at: new Date(now - (SEED_CONFIG.TOTAL_PRODUCTS - index) * SEED_CONFIG.MILLISECONDS_PER_DAY).toISOString()
  };
}

function generatePriceHistories(productId: string, basePrice: number, productIndex: number, now: number): PriceHistoryRecord[] {
  const history: PriceHistoryRecord[] = [];
  for (let h = 0; h < SEED_CONFIG.PRICE_HISTORY_POINTS_PER_PRODUCT; h++) {
    const fluctuationFactor = 1 + Math.sin((productIndex + h) * 0.4) * 0.15;
    const historyPrice = Math.round(basePrice * fluctuationFactor * 100) / 100;
    const historyDate = new Date(now - (SEED_CONFIG.PRICE_HISTORY_POINTS_PER_PRODUCT - h) * 14 * SEED_CONFIG.MILLISECONDS_PER_DAY).toISOString();

    history.push({
      id: `ph-${productId}-${h + 1}`,
      product_id: productId,
      price: historyPrice,
      recorded_at: historyDate
    });
  }
  return history;
}

function generateProductReviews(productId: string, rating: number, productIndex: number, now: number): ReviewRecord[] {
  const reviews: ReviewRecord[] = [];
  const reviewCount = SEED_CONFIG.REVIEWS_BASE_COUNT + (productIndex % 3);

  for (let r = 1; r <= reviewCount; r++) {
    const reviewRating = Math.max(1, Math.min(5, Math.round(rating + (r % 3 - 1))));
    reviews.push({
      id: `gen-rev-${productId}-${r}`,
      product_id: productId,
      author: `Customer_${((productIndex * 13 + r * 7) % 999) + 1}`,
      rating: reviewRating,
      comment: `Automated user benchmark review #${r} for item ${productId}: Great stability, exactly as specified in technical datasheets.`,
      created_at: new Date(now - (r * 12 + (productIndex % 10)) * SEED_CONFIG.MILLISECONDS_PER_DAY).toISOString()
    });
  }
  return reviews;
}

function generateStocksForWarehouses(productId: string, productIndex: number, warehouses: readonly WarehouseRecord[], timestamp: string): StockRecord[] {
  return warehouses.map((wh, wIndex) => {
    const qty = Math.max(0, (productIndex * 11 + wIndex * 23) % 150);
    return {
      id: `stock-${productId}-${wh.id}`,
      product_id: productId,
      warehouse_id: wh.id,
      quantity: qty,
      updated_at: timestamp
    };
  });
}

export function generateBulkData(): GeneratedSeedData {
  const products: ProductRecord[] = [];
  const reviews: ReviewRecord[] = [];
  const priceHistory: PriceHistoryRecord[] = [];
  const stocks: StockRecord[] = [];
  const warehouses: WarehouseRecord[] = [...STANDARD_WAREHOUSES];

  const now = Date.now();
  const timestamp = new Date(now).toISOString();

  for (let i = 1; i <= SEED_CONFIG.TOTAL_PRODUCTS; i++) {
    const product = generateSeedProduct(i, now);
    products.push(product);

    const historyItems = generatePriceHistories(product.id, product.price, i, now);
    priceHistory.push(...historyItems);

    const reviewItems = generateProductReviews(product.id, product.rating, i, now);
    reviews.push(...reviewItems);

    const stockItems = generateStocksForWarehouses(product.id, i, warehouses, timestamp);
    stocks.push(...stockItems);
  }

  return {
    products,
    reviews,
    priceHistory,
    warehouses,
    stocks
  };
}
