export function waitUntil<T = void>() {
  let userResolved: (value: T | PromiseLike<T>) => void;
  let userRejected: (reason?: any) => void;
  const promise = new Promise<T>(
    (r) => ((userResolved = r), (userRejected = r)),
  );
  return [
    promise,
    // @ts-ignore
    userResolved,
    // @ts-ignore
    userRejected,
  ] as [
    Promise<T>,
    (value: T | PromiseLike<T>) => void,
    (reason?: any) => void,
  ];
}
