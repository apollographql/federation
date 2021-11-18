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
 * Generic OrderedMap class that can sort keys based on an arbitrary sorting function
 * Insert time is O(log(N))
 * Remove is not implemented, but the trivial implementation would be O(N)
 * Uses '<' '>' sorting by default
 * Collisions are fine, it will just overwrite the old value
 */
export class OrderedMap<K,V> {
  private _keys: K[] = [];
  private _values: Map<K,V> = new Map<K,V>();
  private _compareFn: (a: K, b: K) => number;

  private static defaultCompareFn<K>(a: K, b: K) {
    if (a < b) {
      return -1;
    } else if (b < a) {
      return 1;
    }
    return 0;
  }

  constructor(compareFn: (a: K, b: K) => number = OrderedMap.defaultCompareFn) {
    this._compareFn = compareFn;
  }

  add(key: K, value: V) {
    if (!this._values.has(key)) {
      this.insertKeyInOrder(key);
    }
    this._values.set(key, value);
  }

  get(key: K): V | undefined {
    return this._values.get(key);
  }

  has(key: K): boolean {
    return this._values.has(key);
  }

  size(): number {
    return this._keys.length;
  }

  keys(): K[] {
    return this._keys;
  }

  values(): V[] {
    return this._keys.map(key => {
      const v = this._values.get(key);
      assert(v, 'value for known key not found in OrderedMap');
      return v;
    });
  }

  // O(log(N)) - find location via middle finding
  private insertKeyInOrder(key: K) {
    let lower = 0;
    let upper = this._keys.length - 1;
    while (lower <= upper) {
      const middle = Math.floor((upper + lower) / 2);
      if (this._compareFn(this._keys[middle], key) < 0) {
        lower = middle + 1;
      } else {
        upper = middle - 1;
      }
    }
    this._keys = this._keys.slice(0, lower).concat(key).concat(this._keys.slice(lower));
  }

  // remove(key: K): void - not implemented

  *[Symbol.iterator]() {
    for (let i = 0; i < this._keys.length; i += 1) {
      const v = this._values.get(this._keys[i]);
      assert(v, 'value for known key not found in OrderedMap');
      yield v;
    }
  }
}

/**
 * Tests if the provided arrays have the same elements (using '===' equality or the provided
 * equality function).
 * This is _not_ a deep equality by default, though you can build one somewhat when passing
 * an equality function.
 */
export function arrayEquals<T>(
  a: readonly T[],
  b: readonly T[],
  equalFct?: (e1: T, e2: T) => boolean
): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; ++i) {
    const eltEqual = equalFct ? equalFct(a[i], b[i]) : a[i] === b[i];
    if (!eltEqual) {
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
