import {
  asFed2SubgraphDocument,
  Schema,
  ServiceDefinition,
  Subgraphs,
  Supergraph
} from '@apollo/federation-internals';
import { CompositionResult, composeServices, CompositionSuccess, CompositionOptions, satisfiability } from '../compose';

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
  const supergraph = Supergraph.build(result.supergraphSdl);
  expect(supergraph.schema.isCoreSchema()).toBeTruthy();
  return [supergraph.schema, supergraph.apiSchema(), supergraph.subgraphs()];
}

// Note that tests for composition involving fed1 subgraph are in `composeFed1Subgraphs.test.ts` so all the test of this
// file are on fed2 subgraphs, but to avoid needing to add the proper `@link(...)` everytime, we inject it here automatically.
export function composeAsFed2Subgraphs(services: ServiceDefinition[], options: CompositionOptions = {}): CompositionResult {
  const fed2Services = services.map((s) => asFed2Service(s))
  
  const { schema, supergraphSdl, hints, errors } = composeServices(fed2Services, options);
  let satisfiabilityResult;

  if (supergraphSdl) {
    satisfiabilityResult = satisfiability(supergraphSdl);
    if (satisfiabilityResult.errors) return { errors: satisfiabilityResult.errors };
  }


  const compositionResult: CompositionResult = errors ? {
    errors,
  }
  :
  {
    schema,
    supergraphSdl,
    hints: hints?.concat(satisfiabilityResult?.hints ?? []),
  }
  return compositionResult;
}

export function asFed2Service(service: ServiceDefinition): ServiceDefinition {
  return {
    ...service,
    typeDefs: asFed2SubgraphDocument(service.typeDefs, { includeAllImports: true })
  };
}
