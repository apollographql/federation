import { FieldNode, InlineFragmentNode, GraphQLField, GraphQLObjectType } from 'graphql';
import { MultiMap } from '../utilities/MultiMap';

declare module 'graphql' {
  interface GraphQLSchemaExtensions {
    federation?: FederationSchemaMetadata;
  }

  interface GraphQLObjectTypeExtensions {
    federation?: FederationTypeMetadata;
  }

  interface GraphQLFieldExtensions<
    _TSource,
    _TContext,
    _TArgs = { [argName: string]: any }
  > {
    federation?: FederationFieldMetadata;
  }
}

export function getFederationMetadataForType(
  type: GraphQLObjectType,
): FederationTypeMetadata | undefined {
  return type.extensions?.federation;
}

export function getFederationMetadataForField(
  field: GraphQLField<any, any>,
): FederationFieldMetadata | undefined {
  return field.extensions?.federation;
}

export type GraphName = string;
export type FieldSet = readonly (FieldNode | InlineFragmentNode)[];

export interface Graph {
  name: string;
  url: string;
}

export type GraphMap = { [graphName: string]: Graph };
export interface FederationSchemaMetadata {
  graphs: GraphMap;
}

export type FederationTypeMetadata =
  | FederationEntityTypeMetadata
  | FederationValueTypeMetadata;

export interface FederationEntityTypeMetadata {
  graphName: GraphName;
  keys: MultiMap<GraphName, FieldSet>,
  isValueType: false;
}

interface FederationValueTypeMetadata {
  isValueType: true;
}

export function isValueTypeMetadata(
  metadata: FederationTypeMetadata,
): metadata is FederationValueTypeMetadata {
  return metadata.isValueType;
}

export interface FederationFieldMetadata {
  graphName?: GraphName;
  requires?: FieldSet;
  provides?: FieldSet;
}
