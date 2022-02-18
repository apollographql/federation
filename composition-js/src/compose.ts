import {
  printSchema,
  Schema,
  Subgraphs,
  defaultPrintOptions,
  orderPrintedDefinitions,
  ServiceDefinition,
  subgraphsFromServiceList,
  ERRORS,
  UnionType,
  FieldDefinition,
  ObjectType,
  NonNullType,
  ListType,
} from "@apollo/federation-internals";
import { GraphQLError } from "graphql";
import { buildFederatedQueryGraph, buildSupergraphAPIQueryGraph, buildSubgraphAPIQueryGraph } from "@apollo/query-graphs";
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
  const federatedQueryGraph = buildFederatedQueryGraph(supergraphSchema, false);
  const validationResult = validateGraphComposition(supergraphQueryGraph, federatedQueryGraph);
  if (validationResult.errors) {
    return { errors: validationResult.errors.map(e => ERRORS.SATISFIABILITY_ERROR.err({ message: e.message })) };
  }

  // printSchema calls validateOptions, which can throw
  let supergraphSdl;
  try {
    supergraphSdl = printSchema(
      supergraphSchema,
      orderPrintedDefinitions(defaultPrintOptions)
    );
  } catch (err) {
    return { errors: [err] };
  }

  return {
    schema: supergraphSchema,
    supergraphSdl,
    hints: mergeResult.hints
  };
}

export function composeSubgraph(subgraphs: Subgraphs): CompositionResult {
  const mergeResult = mergeSubgraphs(subgraphs);
  if (mergeResult.errors) {
    return { errors: mergeResult.errors };
  }

  const supergraphSchema = mergeResult.supergraph;

  // the generated supergraph does not have the _Any type, and once we're
  // here it is already constructed so we can't add a type
  // I hardcoded it in internals-js/src/definitions.ts:1091
  // there's probably a better solution, especially considering that
  // creating the ferederatedQueryGraph fails whe trying to add _Any too
  // (fixed by removing the error throw in internals-js/src/definitions.ts:1264
  // oh, well...)
  const _any = supergraphSchema.type("_Any")!

  var _entity = new UnionType("_Entity")
  supergraphSchema.addType(_entity)
  var query

  // we loop over the object types and look for federated ones to build the
  // _Entity union
  // we also get the query object for later
  for (const t of supergraphSchema.types()) {
    if(t.kind == "ObjectType" && !t.isQueryRootType()) {
      console.log("got object:"+t.name)
      for(const f of t.allFields()) {
        console.log(f)
      }
      for(const di of t.appliedDirectives) {
        console.log(di)
        if(di.name == "join__type") {
          _entity.addType(t)
        }
      }
    }
    if(t.kind == "ObjectType" && t.isQueryRootType()) {
      query = t
    }
  }

  // building the _entities query manually
  //_entities(representations: [_Any!]!): [_Entity]!
  var _entities = new FieldDefinition<ObjectType>("_entities")

  console.log(_any)

  const repArg = new NonNullType(new ListType(new NonNullType(_any)))
  console.log(repArg.toString())

  const _entitiesType =  new NonNullType(new ListType(_entity))

  query?.addField(_entities, _entitiesType)
  _entities.addArgument("representations", repArg)
  console.log(_entities)

  const supergraphQueryGraph = buildSubgraphAPIQueryGraph(supergraphSchema);
  const federatedQueryGraph = buildFederatedQueryGraph(supergraphSchema, false);
  const validationResult = validateGraphComposition(supergraphQueryGraph, federatedQueryGraph);
  if (validationResult.errors) {
    return { errors: validationResult.errors.map(e => ERRORS.SATISFIABILITY_ERROR.err({ message: e.message })) };
  }

  // printSchema calls validateOptions, which can throw
  let supergraphSdl;
  try {
    supergraphSdl = printSchema(
      supergraphSchema,
      orderPrintedDefinitions(defaultPrintOptions)
    );
  } catch (err) {
    return { errors: [err] };
  }

  return {
    schema: supergraphSchema,
    supergraphSdl,
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



export function composeSubgraphFromServices(services: ServiceDefinition[]): CompositionResult  {
  const subgraphs = subgraphsFromServiceList(services);
  if (Array.isArray(subgraphs)) {
    // Errors in subgraphs are not truly "composition" errors, but it's probably still the best place
    // to surface them in this case. Not that `subgraphsFromServiceList` do ensure the errors will
    // include the subgraph name in their message.
    return { errors: subgraphs };
  }
  return composeSubgraph(subgraphs);
}
