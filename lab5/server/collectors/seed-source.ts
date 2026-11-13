import type { ProductRecord, ReviewRecord, PriceHistoryRecord, WarehouseRecord, StockRecord } from '../db.js';

export interface GeneratedSeedData {
  products: ProductRecord[];
  reviews: ReviewRecord[];
  priceHistory: PriceHistoryRecord[];
  warehouses: WarehouseRecord[];
  stocks: StockRecord[];
}

export function generateBulkData(): GeneratedSeedData {
  const categories = ['electronics', 'computers', 'audio', 'wearables', 'appliances', 'networking', 'accessories'];
  const brands = ['NexusCore', 'ApexPulse', 'SpectraTech', 'VortexPro', 'QuantumLabs', 'CyberDyne', 'HyperLink', 'AeroDynamics'];

  const productAdjectives = ['Ultra', 'Pro', 'Elite', 'Titanium', 'Precision', 'Compact', 'Modular', 'Dynamic', 'Aero', 'Matrix'];
  const productNouns = ['Router', 'Monitor', 'Headset', 'Keyboard', 'Sensor', 'Microphone', 'Docking Station', 'Webcam', 'Storage Drive', 'Power Hub'];

  const products: ProductRecord[] = [];
  const reviews: ReviewRecord[] = [];
  const priceHistory: PriceHistoryRecord[] = [];
  const stocks: StockRecord[] = [];

  const warehouses: WarehouseRecord[] = [
    { id: 'wh-1', name: 'Central Distribution Center', city: 'Minsk' },
    { id: 'wh-2', name: 'Logistics Depot North', city: 'Vilnius' },
    { id: 'wh-3', name: 'Rapid Transit Terminal', city: 'Warsaw' },
    { id: 'wh-4', name: 'Automated Fulfillment Station', city: 'Berlin' }
  ];

  for (let i = 1; i <= 400; i++) {
    const adj = productAdjectives[i % productAdjectives.length]!;
    const noun = productNouns[i % productNouns.length]!;
    const brand = brands[i % brands.length]!;
    const category = categories[i % categories.length]!;
    const basePrice = Math.round((49.99 + ((i * 17) % 850) + (i % 7) * 9.5) * 100) / 100;
    const rating = Math.round((3.2 + ((i * 3) % 19) * 0.1) * 10) / 10;

    const productId = `gen-prod-${i}`;
    products.push({
      id: productId,
      title: `${brand} ${adj} ${noun} ${100 + i}`,
      description: `High-performance industrial grade ${adj.toLowerCase()} ${noun.toLowerCase()} with advanced telemetry, robust thermal shielding and 3-year enterprise warranty.`,
      price: basePrice,
      category,
      brand,
      rating,
      source: 'generator',
      created_at: new Date(Date.now() - (400 - i) * 86400000).toISOString()
    });

    // 2. Генерируем 25 исторических срезов цен для КАЖДОГО продукта: 400 * 25 = 10 000 записей price_history!
    for (let h = 0; h < 25; h++) {
      // Плавное случайное блуждание цены в пределах 20%
      const fluctuationFactor = 1 + Math.sin((i + h) * 0.4) * 0.15;
      const historyPrice = Math.round(basePrice * fluctuationFactor * 100) / 100;
      const historyDate = new Date(Date.now() - (25 - h) * 14 * 86400000).toISOString();

      priceHistory.push({
        id: `ph-${productId}-${h + 1}`,
        product_id: productId,
        price: historyPrice,
        recorded_at: historyDate
      });
    }

    // 3. Генерируем по 4-6 отзывов на продукт: ~2000 отзывов
    const reviewCount = 4 + (i % 3);
    for (let r = 1; r <= reviewCount; r++) {
      const reviewRating = Math.max(1, Math.min(5, Math.round(rating + (r % 3 - 1))));
      reviews.push({
        id: `gen-rev-${productId}-${r}`,
        product_id: productId,
        author: `Customer_${((i * 13 + r * 7) % 999) + 1}`,
        rating: reviewRating,
        comment: `Automated user benchmark review #${r} for item ${productId}: Great stability, exactly as specified in technical datasheets.`,
        created_at: new Date(Date.now() - (r * 12 + (i % 10)) * 86400000).toISOString()
      });
    }

    // 4. Генерируем остатки по складам: 400 * 4 = 1600 записей
    for (let w = 0; w < warehouses.length; w++) {
      const wh = warehouses[w]!;
      const qty = Math.max(0, ((i * 11 + w * 23) % 150));
      stocks.push({
        id: `stock-${productId}-${wh.id}`,
        product_id: productId,
        warehouse_id: wh.id,
        quantity: qty,
        updated_at: new Date().toISOString()
      });
    }
  }

  return {
    products,
    reviews,
    priceHistory,
    warehouses,
    stocks
  };
}

