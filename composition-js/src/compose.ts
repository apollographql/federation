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
  SubtypingRule,
  assert,
  Supergraph,
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

export interface CompositionOptions {
  sdlPrintOptions?: PrintOptions;
  allowedFieldTypeMergingSubtypingRules?: SubtypingRule[];
}

function validateCompositionOptions(options: CompositionOptions) {
  // TODO: we currently cannot allow "list upgrades", meaning a subgraph returning `String` and another returning `[String]`. To support it, we would need the execution code to
  // recognize situation and "coerce" results from the first subgraph (the one returning `String`) into singleton lists.
  assert(!options?.allowedFieldTypeMergingSubtypingRules?.includes("list_upgrade"), "The `list_upgrade` field subtyping rule is currently not supported");
}

export function compose(subgraphs: Subgraphs, options: CompositionOptions = {}): CompositionResult {
  validateCompositionOptions(options);

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

  // We pass `null` for the `supportedFeatures` to disable the feature support validation. Validating feature support
  // is useful when executing/handling a supergraph, but here we're just validating the supergraph we've just created,
  // and there is no reason to error due to an unsupported feature.
  const supergraph = new Supergraph(mergeResult.supergraph, null);
  const supergraphQueryGraph = buildSupergraphAPIQueryGraph(supergraph);
  const federatedQueryGraph = buildFederatedQueryGraph(supergraph, false);
  const { errors, hints } = validateGraphComposition(supergraph.schema, supergraphQueryGraph, federatedQueryGraph);
  if (errors) {
    return { errors };
  }

  // printSchema calls validateOptions, which can throw
  let supergraphSdl;
  try {
    supergraphSdl = printSchema(
      supergraph.schema,
      options.sdlPrintOptions ?? shallowOrderPrintedDefinitions(defaultPrintOptions),
    );
  } catch (err) {
    return { errors: [err] };
  }

  return {
    schema: supergraph.schema,
    supergraphSdl,
    hints: mergeResult.hints.concat(hints ?? []),
  };
}

export function composeServices(services: ServiceDefinition[], options: CompositionOptions = {}): CompositionResult  {
  const subgraphs = subgraphsFromServiceList(services);
  if (Array.isArray(subgraphs)) {
    // Errors in subgraphs are not truly "composition" errors, but it's probably still the best place
    // to surface them in this case. Not that `subgraphsFromServiceList` do ensure the errors will
    // include the subgraph name in their message.
    return { errors: subgraphs };
  }
  return compose(subgraphs, options);
}
