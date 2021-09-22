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
