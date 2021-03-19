import { GraphQLField, GraphQLObjectType, SelectionNode } from 'graphql';
import { MultiMap } from '../utilities/MultiMap';

declare module 'graphql' {
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

export type ServiceName = string;
export type SelectionSet = readonly SelectionNode[];

export interface FederationTypeMetadata {
  serviceName?: ServiceName;
  keys?: MultiMap<ServiceName, SelectionSet>;
  isValueType: boolean;
}

export interface FederationFieldMetadata {
  serviceName?: ServiceName;
  requires?: SelectionSet;
  provides?: SelectionSet;
  shouldDetach?: boolean;
}
