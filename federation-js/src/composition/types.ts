import {
  DocumentNode,
  FieldDefinitionNode,
  DirectiveDefinitionNode,
  DirectiveNode,
  FieldNode,
  InlineFragmentNode,
} from 'graphql';

export type Maybe<T> = null | undefined | T;

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

export interface FederationDirective {
  directiveDefinitions: {
    [serviceName: string]: DirectiveDefinitionNode;
  }
}

export interface ServiceDefinition {
  typeDefs: DocumentNode;
  name: string;
  url?: string;
}

declare module 'graphql/language/ast' {
  interface UnionTypeDefinitionNode {
    serviceName?: string | null;
  }
  interface UnionTypeExtensionNode {
    serviceName?: string | null;
  }

  interface EnumTypeDefinitionNode {
    serviceName?: string | null;
  }

  interface EnumTypeExtensionNode {
    serviceName?: string | null;
  }

  interface ScalarTypeDefinitionNode {
    serviceName?: string | null;
  }

  interface ScalarTypeExtensionNode {
    serviceName?: string | null;
  }

  interface ObjectTypeDefinitionNode {
    serviceName?: string | null;
  }

  interface ObjectTypeExtensionNode {
    serviceName?: string | null;
  }

  interface InterfaceTypeDefinitionNode {
    serviceName?: string | null;
  }

  interface InterfaceTypeExtensionNode {
    serviceName?: string | null;
  }

  interface InputObjectTypeDefinitionNode {
    serviceName?: string | null;
  }

  interface InputObjectTypeExtensionNode {
    serviceName?: string | null;
  }
}
