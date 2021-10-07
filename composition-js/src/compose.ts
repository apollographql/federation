import { printSchema, Schema, Subgraphs, defaultPrintOptions, orderPrintedDefinitions, ServiceDefinition, subgraphsFromServiceList, error } from "@apollo/core";
import { GraphQLError } from "graphql";
import { buildFederatedQueryGraph, buildSupergraphAPIQueryGraph } from "@apollo/query-graphs";
import { mergeSubgraphs } from "./merging";
import { validateGraphComposition } from "./validate";
import { CompositionHint } from "./hints";

export type CompositionResult = CompositionFailure | CompositionSuccess;

export interface CompositionFailure {
  errors: GraphQLError[];
  schema?: undefined;
  supergraphSdl?: undefined;
  hints?: undefined;
}

export interface CompositionSuccess {
  schema: Schema;
  supergraphSdl: string;
  hints: CompositionHint[];
  errors?: undefined;
}

export function compose(subgraphs: Subgraphs): CompositionResult {
  const mergeResult = mergeSubgraphs(subgraphs);
  if (mergeResult.errors) {
    return { errors: mergeResult.errors };
  }

  const supergraphSchema = mergeResult.supergraph;
  const supergraphQueryGraph = buildSupergraphAPIQueryGraph(supergraphSchema);
  const federatedQueryGraph = buildFederatedQueryGraph(supergraphSchema);
  const validationResult = validateGraphComposition(supergraphQueryGraph, federatedQueryGraph);
  if (validationResult.errors) {
    return { errors: validationResult.errors.map(e => error('COMPOSITION_SATISFIABILITY_ERROR', e.message)) };
  }

  return {
    schema: supergraphSchema,
    supergraphSdl: printSchema(supergraphSchema, orderPrintedDefinitions(defaultPrintOptions)),
    hints: mergeResult.hints
  };
}

export function composeServices(services: ServiceDefinition[]): CompositionResult  {
  const subgraphs = subgraphsFromServiceList(services);
  if (Array.isArray(subgraphs)) {
    // Errors in subgraphs are not truly "composition" errors, but it's probably still the best place
    // to surface them in this case. Not that `subgraphsFromServiceList` do ensure the errors will
    // include the subgraph name in their message.
    return { errors: subgraphs };
  }
  return compose(subgraphs);
}
