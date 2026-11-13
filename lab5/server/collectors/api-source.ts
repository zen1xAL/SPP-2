import type { ProductRecord } from '../db.js';
import { API_COLLECTOR_CONFIG } from '../shared/constants.js';

interface DummyProduct {
  id: number;
  title: string;
  description: string;
  price: number;
  category: string;
  brand?: string;
  rating: number;
}

interface DummyApiResponse {
  products?: DummyProduct[];
}

const FALLBACK_CATEGORIES = ['smartphones', 'laptops', 'fragrances', 'skincare', 'groceries'] as const;

function generateFallbackProducts(): ProductRecord[] {
  const list: ProductRecord[] = [];
  const now = Date.now();

  for (let i = 1; i <= API_COLLECTOR_CONFIG.FALLBACK_COUNT; i++) {
    const categoryIndex = i % FALLBACK_CATEGORIES.length;
    const cat = FALLBACK_CATEGORIES[categoryIndex] ?? 'groceries';

    list.push({
      id: `api-prod-${i}`,
      title: `Certified External Product ${i}`,
      description: `High quality standard item #${i} ingested from certified public external supplier catalog.`,
      price: Math.round((25 + i * 18.5) * 100) / 100,
      category: cat,
      brand: `Brand-${String.fromCharCode(65 + (i % 8))}`,
      rating: Math.round((3.8 + (i % 12) * 0.1) * 10) / 10,
      source: API_COLLECTOR_CONFIG.SOURCE_NAME,
      created_at: new Date(now - i * 43_200_000).toISOString()
    });
  }

  return list;
}

export async function fetchApiProducts(): Promise<ProductRecord[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_COLLECTOR_CONFIG.REQUEST_TIMEOUT_MS);

    const res = await fetch(API_COLLECTOR_CONFIG.ENDPOINT_URL, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json()) as DummyApiResponse;
      if (Array.isArray(data.products) && data.products.length > 0) {
        return data.products.map((p) => ({
          id: `api-prod-${p.id}`,
          title: p.title,
          description: p.description,
          price: p.price,
          category: p.category.toLowerCase(),
          brand: p.brand || API_COLLECTOR_CONFIG.DEFAULT_BRAND,
          rating: p.rating || API_COLLECTOR_CONFIG.DEFAULT_RATING,
          source: API_COLLECTOR_CONFIG.SOURCE_NAME,
          created_at: new Date(Date.now() - p.id * 86_400_000).toISOString()
        }));
      }
    }
  } catch (err: unknown) {
    console.warn('[Collector: API] External fetch failed or timed out, applying resilient fallback pool:', err instanceof Error ? err.message : String(err));
  }

  return generateFallbackProducts();
}
