import { hasOwn } from './own';
import { isObject } from './predicates';

export function deepMerge(target: any, source: any): any {
  if (source === undefined || source === null) return target;

  for (const key of Object.keys(source)) {
    if (source[key] === undefined) continue;

    // While `Object.keys()` guarantees that `key` is an own property name in
    // `source`, we do not have that same guarantee for `target`. In the event
    // the property is absent from `target`, we don't want to accidentally
    // fetch the property in `target`'s prototype chain (if present), and
    // accordingly we define the property on `target` in such cases.
    if (!hasOwn(target, key) && key in target) {
      Object.defineProperty(
        target,
        key,
        {
          configurable: true,
          enumerable: true,
          value: undefined,
          writable: true,
        }
      );
    }

    if (target[key] && isObject(source[key])) {
      deepMerge(target[key], source[key]);
    } else if (
      Array.isArray(source[key]) &&
      Array.isArray(target[key]) &&
      source[key].length === target[key].length
    ) {
      let i = 0;
      for (; i < source[key].length; i++) {
        if (isObject(target[key][i]) && isObject(source[key][i])) {
          deepMerge(target[key][i], source[key][i]);
        } else {
          target[key][i] = source[key][i];
        }
      }
    } else {
      target[key] = source[key];
    }
  }

  return target;
}
