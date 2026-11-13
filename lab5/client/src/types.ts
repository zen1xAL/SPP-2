export interface PricePoint {
  id: string;
  price: number;
  recordedAt: string;
}

export interface Review {
  id: string;
  productId: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface WarehouseStock {
  id: string;
  productId: string;
  warehouseId: string;
  warehouseName: string;
  city: string;
  quantity: number;
  updatedAt: string;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  brand: string;
  rating: number;
  source: string;
  createdAt: string;
  priceHistory?: PricePoint[];
  reviews?: Review[];
  reviewCount?: number;
  averageRating?: number;
  inventory?: WarehouseStock[];
  totalStock?: number;
  inStock?: boolean;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface ProductEdge {
  cursor: string;
  node: Product;
}

export interface ProductConnection {
  edges: ProductEdge[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Warehouse {
  id: string;
  name: string;
  city: string;
}

export interface SystemMetrics {
  totalRequests: number;
  totalErrors: number;
  avgDurationMs: number;
  uptimeSeconds: number;
  activeSubscriptions: number;
  memoryUsageMb: number;
}

export interface DatabaseStats {
  productsCount: number;
  reviewsCount: number;
  priceHistoryCount: number;
  stocksCount: number;
  totalRecords: number;
}

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

