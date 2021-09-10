import { printSchema, Schema, Subgraphs, defaultPrintOptions, orderPrintedDefinitions } from "@apollo/core";
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
  if (validationResult.error) {
    return { errors: [new GraphQLError(validationResult.error.message)] };
  }

  return {
    schema: supergraphSchema,
    supergraphSdl: printSchema(supergraphSchema, orderPrintedDefinitions(defaultPrintOptions)),
    hints: mergeResult.hints
  };
}
