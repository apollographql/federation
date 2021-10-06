import {
  DocumentNode,
  FieldDefinitionNode,
  DirectiveDefinitionNode,
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
