import {
  asFed2SubgraphDocument,
  buildSchema,
  extractSubgraphsFromSupergraph,
  Schema,
  ServiceDefinition,
  Subgraphs
} from '@apollo/federation-internals';
import { CompositionResult, composeServices, CompositionSuccess, ComposeOptions, defaultComposeOptions } from '../compose';

export function assertCompositionSuccess(r: CompositionResult): asserts r is CompositionSuccess {
  if (r.errors) {
    throw new Error(`Expected composition to succeed but got errors:\n${r.errors.join('\n\n')}`);
  }
}

export function errors(r: CompositionResult): [string, string][] {
  return r.errors?.map(e => [e.extensions.code as string, e.message]) ?? [];
}

// Returns [the supergraph schema, its api schema, the extracted subgraphs]
export function schemas(result: CompositionSuccess): [Schema, Schema, Subgraphs] {
  // Note that we could user `result.schema`, but reparsing to ensure we don't lose anything with printing/parsing.
  const schema = buildSchema(result.supergraphSdl);
  expect(schema.isCoreSchema()).toBeTruthy();
  return [schema, schema.toAPISchema(), extractSubgraphsFromSupergraph(schema)];
}

// Note that tests for composition involving fed1 subgraph are in `composeFed1Subgraphs.test.ts` so all the test of this
// file are on fed2 subgraphs, but to avoid needing to add the proper `@link(...)` everytime, we inject it here automatically.
export function composeAsFed2Subgraphs(services: ServiceDefinition[], options: ComposeOptions = defaultComposeOptions): CompositionResult {
  return composeServices(services.map((s) => asFed2Service(s)), options);
}

export function asFed2Service(service: ServiceDefinition): ServiceDefinition {
  return {
    ...service,
    typeDefs: asFed2SubgraphDocument(service.typeDefs)
  };
}
