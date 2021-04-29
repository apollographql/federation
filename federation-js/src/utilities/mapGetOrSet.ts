export function mapGetOrSet<K, V>(map: Map<K, V>, key: K, valueToSet: V): V {
  if (!map.has(key)) {
    map.set(key, valueToSet);
  }
  return map.get(key)!;
}
