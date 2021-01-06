import { isMainThread, parentPort, workerData } from 'worker_threads';
import { parse } from 'graphql';
import { composeAndValidate } from '@apollo/federation';
import type { ServiceDefinition } from '@apollo/federation';

if (isMainThread) {
  throw new Error(`compose-worker must be called as a Worker
    (see https://nodejs.org/api/worker_threads.html)`)
}

export type WorkerServiceDefinition = Omit<ServiceDefinition, 'typeDefs'> & { typeDefs: string };
export type WorkerCompositionResult = Omit<ReturnType<typeof composeAndValidate>, 'schema'>

const result: WorkerCompositionResult = composeAndValidate(
  workerData.map((def: WorkerServiceDefinition) => ({
    ...def,
    typeDefs: parse(def.typeDefs)
  }))
);

delete (result as any).schema;

parentPort?.postMessage(result)
