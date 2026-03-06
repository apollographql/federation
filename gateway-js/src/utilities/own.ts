export function hasOwn(obj: object, prop: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

export function getOwn<T, K extends keyof T>(obj: T, prop: K): T[K] | undefined {
  return Object.prototype.hasOwnProperty.call(obj, prop)
    ? obj[prop]
    : undefined;
}
