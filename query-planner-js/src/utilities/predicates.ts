export function isObject(value: any): value is object {
  return (
    value !== undefined &&
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

export function isNotNullOrUndefined<T>(
  value: T | null | undefined,
): value is T {
  return value !== null && typeof value !== 'undefined';
}
