import type { plan } from '.';
import type { OperationResult } from './types';
import { BuildQueryPlanOptions } from '@apollo/query-planner';

/**
 * There are several global properties that we make available in our V8 runtime
 * and these are the types for those that we expect to use within this script.
 * They'll be stripped in the emitting of this file as JS, of course.
 */
declare var bridge: { plan: typeof plan };

declare var done: (operationResult: OperationResult) => void;
declare var schemaString: string;
declare var queryString: string;
declare var options: BuildQueryPlanOptions;
declare var operationName: string | undefined;

if (!options) {
  done({
    Err: [{ message: 'Error in JS-Rust-land: options is missing.' }],
  });
}

const planResult = bridge.plan(
  schemaString,
  queryString,
  options,
  operationName,
);

if (planResult.errors?.length > 0) {
  done({ Err: planResult.errors });
} else {
  done({ Ok: planResult.data });
}
