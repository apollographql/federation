import {
  printSchema,
  Schema,
  Subgraphs,
  defaultPrintOptions,
  shallowOrderPrintedDefinitions,
  PrintOptions,
  ServiceDefinition,
  subgraphsFromServiceList,
  upgradeSubgraphsIfNecessary,
} from "@apollo/federation-internals";
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

export interface ComposeOptions {
  sdlPrintOptions: (options: PrintOptions) => PrintOptions;
}

export const defaultComposeOptions: ComposeOptions = {
  sdlPrintOptions: shallowOrderPrintedDefinitions
}

export function compose(subgraphs: Subgraphs, options: ComposeOptions = defaultComposeOptions): CompositionResult {
  const upgradeResult = upgradeSubgraphsIfNecessary(subgraphs);
  if (upgradeResult.errors) {
    return { errors: upgradeResult.errors };
  }

  const toMerge = upgradeResult.subgraphs;
  const validationErrors = toMerge.validate();
  if (validationErrors) {
    return { errors: validationErrors };
  }

  const mergeResult = mergeSubgraphs(toMerge);
  if (mergeResult.errors) {
    return { errors: mergeResult.errors };
  }

  const supergraphSchema = mergeResult.supergraph;
  const supergraphQueryGraph = buildSupergraphAPIQueryGraph(supergraphSchema);
  const federatedQueryGraph = buildFederatedQueryGraph(supergraphSchema, false);
  const { errors, hints } = validateGraphComposition(supergraphSchema, supergraphQueryGraph, federatedQueryGraph);
  if (errors) {
    return { errors };
  }

  // printSchema calls validateOptions, which can throw
  let supergraphSdl;
  try {
    supergraphSdl = printSchema(
      supergraphSchema,
      options.sdlPrintOptions(defaultPrintOptions)
    );
  } catch (err) {
    return { errors: [err] };
  }

  return {
    schema: supergraphSchema,
    supergraphSdl,
    hints: mergeResult.hints.concat(hints ?? []),
  };
}

export function composeServices(services: ServiceDefinition[], options: ComposeOptions = defaultComposeOptions): CompositionResult  {
  const subgraphs = subgraphsFromServiceList(services);
  if (Array.isArray(subgraphs)) {
    // Errors in subgraphs are not truly "composition" errors, but it's probably still the best place
    // to surface them in this case. Not that `subgraphsFromServiceList` do ensure the errors will
    // include the subgraph name in their message.
    return { errors: subgraphs };
  }
  return compose(subgraphs, options);
}
