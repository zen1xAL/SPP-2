export function groupEntitiesByForeignKey<T, K extends string | number>(
  keys: readonly K[],
  entities: readonly T[],
  foreignKeySelector: (entity: T) => K
): T[][] {
  const bucketMap = new Map<K, T[]>();

  for (const key of keys) {
    bucketMap.set(key, []);
  }

  for (const entity of entities) {
    const key = foreignKeySelector(entity);
    const bucket = bucketMap.get(key);
    if (bucket) {
      bucket.push(entity);
    }
  }

  return keys.map((key) => bucketMap.get(key) ?? []);
}
