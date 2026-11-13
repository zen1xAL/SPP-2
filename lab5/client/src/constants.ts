import type { TabType } from './components/Header.js';

export const CLIENT_THEME = {
  colors: {
    primary: '#38bdf8',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    textMuted: '#64748b',
    textSecondary: '#94a3b8',
    textLight: '#f8fafc',
    border: '#1e293b',
    borderDashed: '#334155',
    bgCard: '#0b1120',
    bgDark: '#090d16',
    bgSurface: '#0f172a'
  }
} as const;

export const CATALOG_CONFIG = {
  DEFAULT_PAGE_SIZE: 12,
  SEARCH_DEBOUNCE_MS: 300,
  DEFAULT_SORT_BY: 'created_at',
  DEFAULT_SORT_ORDER: 'DESC',
  CATEGORY_ALL: 'all'
} as const;

export const FEED_CONFIG = {
  MAX_ENTRIES_RETAINED: 40
} as const;

export const METRICS_CONFIG = {
  POLL_INTERVAL_MS: 3000
} as const;

export const APP_CONFIG = {
  SYSTEM_METRICS_POLL_MS: 5000
} as const;

export interface TabConfigItem {
  id: TabType;
  label: string;
  icon: 'Database' | 'Layers' | 'Activity' | 'Terminal' | 'Network';
}

export const TABS_CONFIG: readonly TabConfigItem[] = [
  { id: 'catalog', label: 'Каталог & Relay', icon: 'Database' },
  { id: 'mutations', label: 'Мутации', icon: 'Layers' },
  { id: 'feed', label: 'WebSocket Live', icon: 'Activity' },
  { id: 'studio', label: 'Query Studio', icon: 'Terminal' },
  { id: 'metrics', label: 'Мониторинг & Federation', icon: 'Network' }
] as const;

export const MUTATION_FORM_DEFAULTS = {
  PRODUCT_PRICE: 149.99,
  PRODUCT_CATEGORY: 'electronics',
  PRODUCT_BRAND: 'NexusCore',
  TARGET_PRODUCT_ID: 'api-prod-1',
  DEFAULT_WAREHOUSE_ID: 'wh-1',
  DEFAULT_STOCK_QTY: 50,
  DEFAULT_RATING: 5,
  SUCCESS_DURATION_MS: 3000
} as const;

export function formatClientError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
