import { isNotNullOrUndefined } from './predicates';

export function compactMap<T, U>(
  array: T[],
  callbackfn: (value: T, index: number, array: T[]) => U | null | undefined,
): U[] {
  return array.reduce(
    (accumulator, element, index, array) => {
      const result = callbackfn(element, index, array);
      if (isNotNullOrUndefined(result)) {
        accumulator.push(result);
      }
      return accumulator;
    },
    [] as U[],
  );
}

export function partition<T, U extends T>(
  array: T[],
  predicate: (element: T, index: number, array: T[]) => element is U,
): [U[], T[]];
export function partition<T>(
  array: T[],
  predicate: (element: T, index: number, array: T[]) => boolean,
): [T[], T[]];
export function partition<T>(
  array: T[],
  predicate: (element: T, index: number, array: T[]) => boolean,
): [T[], T[]] {
  array.map;
  return array.reduce(
    (accumulator, element, index) => {
      return (
        predicate(element, index, array)
          ? accumulator[0].push(element)
          : accumulator[1].push(element),
        accumulator
      );
    },
    [[], []] as [T[], T[]],
  );
}

export function findAndExtract<T>(
  array: T[],
  predicate: (element: T, index: number, array: T[]) => boolean,
): [T | undefined, T[]] {
  const index = array.findIndex(predicate);
  if (index === -1) return [undefined, array];

  const remaining = array.slice(0, index);
  if (index < array.length - 1) {
    remaining.push(...array.slice(index + 1));
  }

  return [array[index], remaining];
}

export function groupBy<T, U>(keyFunction: (element: T) => U) {
  return (iterable: Iterable<T>) => {
    const result = new Map<U, T[]>();

    for (const element of iterable) {
      const key = keyFunction(element);
      const group = result.get(key);

      if (group) {
        group.push(element);
      } else {
        result.set(key, [element]);
      }
    }

    return result;
  };
}
