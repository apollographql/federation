import type { plan } from '.';
import type { OperationResult } from './types';

/**
 * There are several global properties that we make available in our V8 runtime
 * and these are the types for those that we expect to use within this script.
 * They'll be stripped in the emitting of this file as JS, of course.
 */
declare let bridge: { plan: typeof plan };

declare let done: (operationResult: OperationResult) => void;
declare let schemaString: string;
declare let queryString: string;
declare let operationName: string | undefined;

const planResult = bridge.plan(
  schemaString,
  queryString,
  operationName,
);

if (planResult.errors?.length > 0) {
  done({ Err: planResult.errors });
} else {
  done({ Ok: planResult.data });
}
