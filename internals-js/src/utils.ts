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

  addAll(otherMap: MultiMap<K, V>): this {
    for (const [k, vs] of otherMap.entries()) {
      for (const v of vs) {
        this.add(k, v);
      }
    }
    return this;
  }
}

export class SetMultiMap<K, V> extends Map<K, Set<V>> {
  add(key: K, value: V): this {
    let values = this.get(key);
    if (!values) {
      values = new Set<V>();
      this.set(key, values);
    }
    values.add(value);
    return this;
  }

  addAll(otherMap: SetMultiMap<K, V>): this {
    for (const [k, vs] of otherMap.entries()) {
      for (const v of vs) {
        this.add(k, v);
      }
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

  get size() {
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

/**
 * Whether the first set is a (non-strict) subset of the second set.
 */
export function isSubset<T>(superset: Set<T>, maybeSubset: Set<T>): boolean {
  if (superset === maybeSubset) {
    return true;
  }
  for (const elt of maybeSubset) {
    if (!superset.has(elt)) {
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

/**
 * Checks whether the provided string value is defined and represents a "boolean-ish"
 * value, returning that boolean value.
 *
 * @param str - the string to check.
 * @return the boolean value contains in `str` if `str` represents a boolean-ish value,
 * where "boolean-ish" is one of "true"/"false", "yes"/"no" or "0"/"1" (where the check
 * is case-insensitive). Otherwise, `undefined` is returned.
 */
export function validateStringContainsBoolean(str?: string) : boolean | undefined {
  if (!str) {
    return false;
  }
  switch (str.toLocaleLowerCase()) {
    case "true":
    case "yes":
    case "1":
      return true;
    case "false":
    case "no":
    case "0":
      return false;
    default:
      return undefined;
  }
}

/**
 * Joins an array of string, much like `Array.prototype.join`, but with the ability to use a specific different
 * separator for the first and/or last occurence.
 *
 * The goal is to make reading flow slightly better. For instance, if you have a list of subgraphs `s = ["A", "B", "C"]`,
 * then `"subgraphs " + joinString(s)` will yield "subgraphs A, B and C".
 */
export function joinStrings(toJoin: string[], sep: string = ', ', firstSep?: string, lastSep: string = ' and ') {
  if (toJoin.length == 0) {
    return '';
  }
  const first = toJoin[0];
  if (toJoin.length == 1) {
    return first;
  }
  const last = toJoin[toJoin.length - 1];
  if (toJoin.length == 2) {
    return first + (firstSep ? firstSep : lastSep) + last;
  }
  return first + (firstSep ? firstSep : sep) + toJoin.slice(1, toJoin.length - 1).join(sep) + lastSep + last;
}

// When displaying a list of something in a human readable form, after what size (in
// number of characters) we start displaying only a subset of the list.
const DEFAULT_HUMAN_READABLE_LIST_CUTOFF_LENGTH = 100;

/**
 * Like `joinStrings`, joins an array of string, but with a few twists, namely:
 *  - If the resulting list to print is "too long", it only display a subset of the elements and use some elipsis (...). In other
 *    words, this method is for case where, where the list ot print is too long, it is more useful to avoid flooding the output than
 *    printing everything.
 *  - it allows to prefix the whole list, and to use a different prefix for a single element than for > 1 elements.
 *  - it forces the use of ',' as separator, but allow a different lastSeparator.
 */
export function printHumanReadableList(
  names: string[],
  {
    emptyValue,
    prefix,
    prefixPlural,
    lastSeparator,
    cutoff_output_length,
  } : {
    emptyValue?: string,
    prefix?: string,
    prefixPlural?: string,
    lastSeparator?: string,
    cutoff_output_length?: number,
  }
): string {
  if (names.length === 0) {
    return emptyValue ?? '';
  }
  if (names.length == 1) {
    return prefix ? prefix + ' ' + names[0] : names[0];
  }
  const cutoff = cutoff_output_length ?? DEFAULT_HUMAN_READABLE_LIST_CUTOFF_LENGTH;

  const { lastIdx } = names.reduce(
    ({ lastIdx, length }, name) => {
      if (length + name.length > cutoff) {
        return {
          lastIdx,
          length,
        };
      }
      return {
        lastIdx: lastIdx + 1,
        length: length + name.length,
      };
    },
    { lastIdx: 0, length: 0}
  );
  // In case the name we list have absurdly long names, we cut it off but ensure we at least display one.
  const toDisplay = names.slice(0, Math.max(1, lastIdx));
  const actualPrefix = prefixPlural
    ? prefixPlural + ' '
    : (prefix ? prefix + ' ' : '');
  if (toDisplay.length === names.length) {
    return actualPrefix + joinStrings(toDisplay, ', ', undefined, lastSeparator);
  } else {
    return actualPrefix + joinStrings(toDisplay, ', ', undefined, ', ') + ', ...';
  }
}

export type Concrete<Type> = {
  [Property in keyof Type]-?: Concrete<Type[Property]>;
};

// for use with Array.filter
// Example:
//   const x = [1,2,undefined];
//   const y: number[] = x.filter(isDefined);
export const isDefined = <T>(t: T | undefined): t is T => t === undefined ? false : true;

/**
 * Removes the first occurrence of the provided element in the provided array, if said array contains said elements.
 *
 * @return whether the element was removed.
 */
export function removeArrayElement<T>(element: T, array: T[]): boolean {
  const index = array.indexOf(element);
  if (index >= 0) {
    array.splice(index, 1);
    return true;
  } else {
    return false;
  }
}

export type NonEmptyArray<T> = [T, ...T[]];

export function isNonEmptyArray<T>(array: T[]): array is NonEmptyArray<T> {
  return array.length > 0;
}

// We can switch to `Array.prototype.findLast` when we drop support for Node 16
export function findLast<T>(array: T[], predicate: (t: T) => boolean): T | undefined {
  for (let i = array.length - 1; i >= 0; i--) {
    const t = array[i];
    if (predicate(t)) {
      return t;
    }
  }
  return undefined;
}

export function mergeMapOrNull<K,V>(m1: Map<K, V> | null, m2: Map<K, V> | null): Map<K, V> | null {
  if (!m1) {
    return m2;
  }
  if (!m2) {
    return m1;
  }
  return new Map<K, V>([...m1, ...m2]);
}

export function composeSets<T>(s1: Set<T> | null, s2: Set<T> | null): Set<T> | null {
  if (!s1 && !s2) {
    return null;
  }
  const result = new Set<T>();
  s1?.forEach(v => result.add(v));
  s2?.forEach(v => result.add(v));
  return result;
}

export function setsEqual<T>(s1: Set<T> | null, s2: Set<T> | null): boolean {
  if (s1 === s2) {
    return true;
  }
  if (!s1 && !s2) {
    return true;
  }
  if (!s1 || !s2 || s1.size !== s2.size) {
    return false;
  }
  for (const key of s1) {
    if (!s2.has(key)) {
      return false;
    }
  }
  return true;
}
