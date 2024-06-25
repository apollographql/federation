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
import { MergeResult, mergeSubgraphs } from "./merging";
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

/**
 * Used to compose a supergraph from subgraphs
 * 
 * @param subgraphs Subgraphs
 * @param options CompositionOptions
 * @param runSatisfiability Boolean - flag used to toggle satisfiability. Defaults to `true`
 */
export function compose(subgraphs: Subgraphs, options: CompositionOptions = {}, runSatisfiability = true): CompositionResult {
  validateCompositionOptions(options);

  const mergeResult = validateSubgraphsAndMerge(subgraphs);
  if (mergeResult.errors) {
    return { errors: mergeResult.errors };
  }

  let satisfiabilityResult;
  if (runSatisfiability) {
    satisfiabilityResult = validateSatisfiability({
      supergraphSchema: mergeResult.supergraph
    });
    if (satisfiabilityResult.errors) {
      return { errors: satisfiabilityResult.errors };
    }
  }

  // printSchema calls validateOptions, which can throw
  let supergraphSdl;
  try {
    supergraphSdl = printSchema(
      mergeResult.supergraph,
      options.sdlPrintOptions ?? shallowOrderPrintedDefinitions(defaultPrintOptions),
    );
  } catch (err) {
    return { errors: [err] };
  }

  return {
    schema: mergeResult.supergraph,
    supergraphSdl,
    hints: [...mergeResult.hints, ...(satisfiabilityResult?.hints ?? [])],
  };
}

/**
 * Method to validate and compose services
 * 
 * @param services List of Service definitions
 * @param options CompositionOptions
 * @param runSatisfiability Flag to toggle satisfiability check within composition. Defaults to `true`
 * @returns CompositionResult
 */
export function composeServices(services: ServiceDefinition[], options: CompositionOptions = {}, runSatisfiability = true): CompositionResult  {
  const subgraphs = subgraphsFromServiceList(services);
  if (Array.isArray(subgraphs)) {
    // Errors in subgraphs are not truly "composition" errors, but it's probably still the best place
    // to surface them in this case. Not that `subgraphsFromServiceList` do ensure the errors will
    // include the subgraph name in their message.
    return { errors: subgraphs };
  }

  return compose(subgraphs, options, runSatisfiability);
}

type SatisfiabilityArgs = {
  supergraphSchema: Schema
  supergraphSdl?: never
} | { supergraphSdl: string, supergraphSchema?: never };

/**
 * Run satisfiability check for a supergraph
 * 
 * Can pass either the supergraph's Schema or SDL to validate
 * @param args: SatisfiabilityArgs 
 * @returns { errors? : GraphQLError[], hints? : CompositionHint[] }
 */
export function validateSatisfiability({ supergraphSchema, supergraphSdl} : SatisfiabilityArgs) : {
  errors? : GraphQLError[],
  hints? : CompositionHint[],
} {
  // We pass `null` for the `supportedFeatures` to disable the feature support validation. Validating feature support
  // is useful when executing/handling a supergraph, but here we're just validating the supergraph we've just created,
  // and there is no reason to error due to an unsupported feature.
  const supergraph = supergraphSchema ? new Supergraph(supergraphSchema, null) : Supergraph.build(supergraphSdl);
  const supergraphQueryGraph = buildSupergraphAPIQueryGraph(supergraph);
  const federatedQueryGraph = buildFederatedQueryGraph(supergraph, false);
  return validateGraphComposition(supergraph.schema, supergraph.subgraphNameToGraphEnumValue(), supergraphQueryGraph, federatedQueryGraph);
}

type ValidateSubgraphsAndMergeResult = MergeResult | { errors: GraphQLError[] };

/**
 * Upgrade subgraphs if necessary, then validates subgraphs before attempting to merge
 * 
 * @param subgraphs 
 * @returns ValidateSubgraphsAndMergeResult
 */
function validateSubgraphsAndMerge(subgraphs: Subgraphs) : ValidateSubgraphsAndMergeResult {
  const upgradeResult = upgradeSubgraphsIfNecessary(subgraphs);
  if (upgradeResult.errors) {
    return { errors: upgradeResult.errors };
  }

  const toMerge = upgradeResult.subgraphs;
  const validationErrors = toMerge.validate();
  if (validationErrors) {
    return { errors: validationErrors };
  }

  return mergeSubgraphs(toMerge);
}
