import {
  DirectiveNode,
  FieldDefinitionNode,
  FieldNode,
  GraphQLResolveInfo,
  InlineFragmentNode,
} from 'graphql';

export type GraphQLReferenceResolver<TContext> = (
  reference: object,
  context: TContext,
  info: GraphQLResolveInfo,
) => any;

declare module 'graphql/type/definition' {
  interface GraphQLObjectType {
    resolveReference?: GraphQLReferenceResolver<any>;
  }

  interface GraphQLObjectTypeConfig<TSource, TContext> {
    resolveReference?: GraphQLReferenceResolver<TContext>;
  }
}

export type ServiceName = string | null;

export type DefaultRootOperationTypeName =
  | 'Query'
  | 'Mutation'
  | 'Subscription';

export interface ExternalFieldDefinition {
  field: FieldDefinitionNode;
  parentTypeName: string;
  serviceName: string;
}

export interface ServiceNameToKeyDirectivesMap {
  [serviceName: string]: FieldSet[] | undefined;
}

export type DirectiveUsages = Map<string, DirectiveNode[]>;
export interface FederationType {
  serviceName?: ServiceName;
  keys?: ServiceNameToKeyDirectivesMap;
  externals?: {
    [serviceName: string]: ExternalFieldDefinition[];
  };
  isValueType?: boolean;
  directiveUsages?: DirectiveUsages;
}

// Without rewriting a number of AST types from graphql-js, this typing is
// technically too relaxed. Recursive selections are not excluded from containing
// FragmentSpreads, which is what this type is aiming to achieve (and accomplishes
// at the root level, but not recursively)
export type FieldSet = readonly (FieldNode | InlineFragmentNode)[];
export interface FederationField {
  serviceName?: ServiceName;
  requires?: FieldSet;
  provides?: FieldSet;
  belongsToValueType?: boolean;
  directiveUsages?: DirectiveUsages;
}
