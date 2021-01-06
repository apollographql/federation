import { resolve } from 'path';
import { Worker } from 'worker_threads';
import { buildSchema, GraphQLError, print } from 'graphql';
import type { composeAndValidate, ComposedGraphQLSchema, ServiceDefinition } from '@apollo/federation';
import type { WorkerCompositionResult } from './compose-worker';

const WORKER_SCRIPT = resolve(__dirname, '..', 'dist', 'compose-worker.js');

type Result = ReturnType<typeof composeAndValidate>;

export default async (serviceList: ServiceDefinition[]): Promise<Result> => {
  const workerData = serviceList.map(({ name, url, typeDefs }) => ({
    name, url,
    typeDefs: print(typeDefs),
  }))
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SCRIPT, { workerData });
    worker.on('message', done);
    worker.on('error', reject);
    worker.on('exit', (code: number) => {
      if (code !== 0)
        reject(new Error(`Worker stopped with exit code ${code}`));
    });

    function done(result: WorkerCompositionResult) {
      // We lose prototypes when getting results back from the worker; rehydrate them here.
      resolve({
        schema: result.errors.length
          ? null as unknown as ComposedGraphQLSchema
          : Object.assign(buildSchema(result.composedSdl!), { extensions: { serviceList } }),
        warnings: [], // deprecated
        errors: result.errors.map(({ message, nodes, source, positions, path, originalError, extensions }) =>
          new GraphQLError(message, nodes, source, positions, path, originalError, extensions)
        ),
        composedSdl: result.composedSdl,
      })
    }
  });
}

