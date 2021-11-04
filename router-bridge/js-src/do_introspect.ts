import type { batchIntrospect } from '.';
import type { OperationResult } from './types';

/**
 * There are several global properties that we make available in our V8 runtime
 * and these are the types for those that we expect to use within this script.
 * They'll be stripped in the emitting of this file as JS, of course.
 */
declare let bridge: { batchIntrospect: typeof batchIntrospect };

declare let done: (operationResult: OperationResult) => void;
declare let sdl: string;
declare let queries: string[];

if (!sdl) {
  done({
    Err: [{ message: 'Error in JS-Rust-land: SDL is empty.' }],
  });
}

try {
  const introspected = bridge.batchIntrospect(sdl, queries);
  done({ Ok: introspected });
} catch (err) {
  done({
    Err: err,
  });
}
