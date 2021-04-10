import {
  GraphQLDirective,
  DirectiveLocation,
  GraphQLNonNull,
  GraphQLString,
  GraphQLNamedType,
  isInputObjectType,
  GraphQLInputObjectType,
  DirectiveNode,
  ScalarTypeDefinitionNode,
  ObjectTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  UnionTypeDefinitionNode,
  EnumTypeDefinitionNode,
  ScalarTypeExtensionNode,
  ObjectTypeExtensionNode,
  InterfaceTypeExtensionNode,
  UnionTypeExtensionNode,
  EnumTypeExtensionNode,
  GraphQLField,
  FieldDefinitionNode,
} from 'graphql';

export const KeyDirective = new GraphQLDirective({
  name: 'key',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
  args: {
    fields: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const ExtendsDirective = new GraphQLDirective({
  name: 'extends',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
});

export const ExternalDirective = new GraphQLDirective({
  name: 'external',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
});

export const InternalDirective = new GraphQLDirective({
  name: 'internal',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
});

export const RequiresDirective = new GraphQLDirective({
  name: 'requires',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    fields: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const ProvidesDirective = new GraphQLDirective({
  name: 'provides',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    fields: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const federationDirectives = [
  KeyDirective,
  ExtendsDirective,
  ExternalDirective,
  InternalDirective,
  RequiresDirective,
  ProvidesDirective,
];

export default federationDirectives;

export type ASTNodeWithDirectives =
  | ScalarTypeDefinitionNode
  | ObjectTypeDefinitionNode
  | InterfaceTypeDefinitionNode
  | UnionTypeDefinitionNode
  | EnumTypeDefinitionNode
  | ScalarTypeExtensionNode
  | ObjectTypeExtensionNode
  | InterfaceTypeExtensionNode
  | UnionTypeExtensionNode
  | EnumTypeExtensionNode
  | FieldDefinitionNode;

// | GraphQLField<any, any>
export type GraphQLNamedTypeWithDirectives = Exclude<
  GraphQLNamedType,
  GraphQLInputObjectType
>;

function hasDirectives(
  node: ASTNodeWithDirectives,
): node is ASTNodeWithDirectives & {
  directives: ReadonlyArray<DirectiveNode>;
} {
  return Boolean('directives' in node && node.directives);
}

export function gatherDirectives(
  type: GraphQLNamedTypeWithDirectives | GraphQLField<any, any>,
): DirectiveNode[] {
  let directives: DirectiveNode[] = [];
  if ('extensionASTNodes' in type && type.extensionASTNodes) {
    for (const node of type.extensionASTNodes) {
      if (hasDirectives(node)) {
        directives = directives.concat(node.directives);
      }
    }
  }

  if (type.astNode && hasDirectives(type.astNode))
    directives = directives.concat(type.astNode.directives);

  return directives;
}

export function typeIncludesDirective(
  type: GraphQLNamedType,
  directiveName: string,
): boolean {
  if (isInputObjectType(type)) return false;
  const directives = gatherDirectives(type as GraphQLNamedTypeWithDirectives);
  return directives.some(directive => directive.name.value === directiveName);
}
