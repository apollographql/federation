/**
 * For lack of a "home of federation utilities", this function is copy/pasted
 * verbatim across the federation, gateway, and query-planner packages. Any changes
 * made here should be reflected in the other two locations as well.
 *
 * @param condition
 * @param message
 * @throws
 */
export function assert(condition: any, message: string | (() => string)): asserts condition {
  if (!condition) {
    throw new Error(typeof message === 'string' ? message : message());
  }
}

export function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}

export class MultiMap<K, V> extends Map<K, V[]> {
  add(key: K, value: V): this {
    const values = this.get(key);
    if (values) {
      values.push(value);
    } else {
      this.set(key, [value]);
    }
    return this;
  }
}

/**
 * Tests if the provided arrays have the same elements (using '===' equality).
 * This is _not_ a deep equality.
 */
export function arrayEquals<T>(a: readonly T[], b: readonly T[]) {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function firstOf<T>(iterable: Iterable<T>): T | undefined {
  const res = iterable[Symbol.iterator]().next();
  return res.done ? undefined : res.value;
}

export function mapValues<V>(map: ReadonlyMap<any, V>): V[] {
  const array = new Array(map.size);
  let i = 0;
  for (const v of map.values()) {
    array[i++] = v;
  }
  return array;
}

export function mapKeys<K>(map: ReadonlyMap<K, any>): K[] {
  const array = new Array(map.size);
  let i = 0;
  for (const k of map.keys()) {
    array[i++] = k;
  }
  return array;
}

export function mapEntries<K, V>(map: ReadonlyMap<K, V>): [K, V][] {
  const array = new Array(map.size);
  let i = 0;
  for (const entry of map.entries()) {
    array[i++] = entry;
  }
  return array;
}

export function setValues<V>(set: ReadonlySet<V>): V[] {
  const array = new Array(set.size);
  let i = 0;
  for (const v of set.values()) {
    array[i++] = v;
  }
  return array;
}

export class MapWithCachedArrays<K, V> {
  private readonly map = new Map<K, V>();
  private cachedKeys?: readonly K[];
  private cachedValues?: readonly V[];

  private clearCaches() {
    this.cachedKeys = undefined;
    this.cachedValues = undefined;
  }

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  set(key: K, value: V): this {
    this.map.set(key, value);
    this.clearCaches();
    return this;
  }

  delete(key: K): boolean {
    const deleted = this.map.delete(key);
    if (deleted) {
      this.clearCaches();
    }
    return deleted;
  }

  clear(): void {
    this.map.clear();
    this.clearCaches();
  }

  keys(): readonly K[] {
    if (!this.cachedKeys) {
      this.cachedKeys = mapKeys(this.map);
    }
    return this.cachedKeys;
  }

  values(): readonly V[] {
    if (!this.cachedValues) {
      this.cachedValues = mapValues(this.map);
    }
    return this.cachedValues;
  }
}

export function copyWitNewLength<T>(arr: T[], newLength: number): T[] {
  assert(newLength >= arr.length, () => `${newLength} < ${arr.length}`);
  const copy = new Array(newLength);
  for (let i = 0; i < arr.length; i++) {
    copy[i] = arr[i];
  }
  return copy;
}
