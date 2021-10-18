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

// This can be written more tersely with a bunch of reduce/flatMap and friends, but when interfaces type-explode into many
// implementations, this can end up with fairly large arrays and be a bottleneck, and a more iterative version that pre-allocate
// arrays is quite a bit faster.
export function cartesianProduct<V>(arr:V[][]): V[][] {
  const size = arr.length;
  if (size === 0) {
    return [];
  }

  // Track, for each element, at which index we are
  const eltIndexes = new Array<number>(size);
  let totalCombinations = 1;
  for (let i = 0; i < size; ++i){
    const eltSize = arr[i].length;
    if(!eltSize) {
      totalCombinations = 0;
      break;
    }
    eltIndexes[i] = 0;
    totalCombinations *= eltSize;
  }

  const product = new Array<V[]>(totalCombinations);
  for (let i = 0; i < totalCombinations; ++i){
    const item = new Array<V>(size);
    for (var j = 0; j < size; ++j) {
      item[j] = arr[j][eltIndexes[j]];
    }
    product[i] = item;

    for (let idx = 0; idx < size; ++idx) {
      if (eltIndexes[idx] == arr[idx].length - 1) {
        eltIndexes[idx] = 0;
      } else {
        eltIndexes[idx] += 1;
        break;
      }
    }
  }
  return product;
}
