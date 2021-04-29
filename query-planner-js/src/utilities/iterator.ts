export function nextValue<T>(iterator: Iterator<T>): T | undefined {
  const result = iterator.next();
  if (!result.done) {
    return result.value;
  } else {
    return undefined;
  }
}
