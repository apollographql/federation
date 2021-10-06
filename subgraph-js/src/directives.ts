import {
  GraphQLDirective,
  DirectiveLocation,
  GraphQLNonNull,
  GraphQLString,
  GraphQLNamedType,
  isInputObjectType,
  GraphQLInputObjectType,
  DirectiveNode,
  GraphQLField,
  FieldDefinitionNode,
  InputValueDefinitionNode,
  SchemaDefinitionNode,
  TypeSystemExtensionNode,
  TypeDefinitionNode,
  ExecutableDefinitionNode,
  DirectiveDefinitionNode,
  print,
  ASTNode,
  visit,
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

export const TagDirective = new GraphQLDirective({
  name: 'tag',
  locations: [
    DirectiveLocation.FIELD_DEFINITION,
    DirectiveLocation.OBJECT,
    DirectiveLocation.INTERFACE,
    DirectiveLocation.UNION,
  ],
  isRepeatable: true,
  args: {
    name: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const federationDirectives = [
  KeyDirective,
  ExtendsDirective,
  ExternalDirective,
  RequiresDirective,
  ProvidesDirective,
];

export function isFederationDirective(directive: GraphQLDirective): boolean {
  return federationDirectives.some(({ name }) => name === directive.name);
}

export const otherKnownDirectives = [TagDirective];

export const knownSubgraphDirectives = [
  ...federationDirectives,
  ...otherKnownDirectives,
];

export function isKnownSubgraphDirective(directive: GraphQLDirective): boolean {
  return knownSubgraphDirectives.some(({ name }) => name === directive.name);
}

export type ASTNodeWithDirectives =
  | FieldDefinitionNode
  | InputValueDefinitionNode
  | ExecutableDefinitionNode
  | SchemaDefinitionNode
  | TypeDefinitionNode
  | TypeSystemExtensionNode;

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
  return directives.some((directive) => directive.name.value === directiveName);
}

export function directiveDefinitionsAreCompatible(
  baseDefinition: DirectiveDefinitionNode,
  toCompare: DirectiveDefinitionNode,
) {
  if (baseDefinition.name.value !== toCompare.name.value) return false;
  // arguments must be equal in length
  if (baseDefinition.arguments?.length !== toCompare.arguments?.length) {
    return false;
  }
  // arguments must be equal in type
  for (const arg of baseDefinition.arguments ?? []) {
    const toCompareArg = toCompare.arguments?.find(
      (a) => a.name.value === arg.name.value,
    );
    if (!toCompareArg) return false;
    if (
      print(stripDescriptions(arg)) !== print(stripDescriptions(toCompareArg))
    ) {
      return false;
    }
  }
  // toCompare's locations must exist in baseDefinition's locations
  if (
    toCompare.locations.some(
      (location) =>
        !baseDefinition.locations.find(
          (baseLocation) => baseLocation.value === location.value,
        ),
    )
  ) {
    return false;
  }
  return true;
}

function stripDescriptions(astNode: ASTNode) {
  return visit(astNode, {
    enter(node) {
      return 'description' in node ? { ...node, description: undefined } : node;
    },
  });
}
