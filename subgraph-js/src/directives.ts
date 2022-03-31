import {
  GraphQLDirective,
  DirectiveLocation,
  GraphQLNonNull,
  GraphQLString,
  GraphQLNamedType,
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
  GraphQLSchema,
  GraphQLList,
  GraphQLBoolean,
  GraphQLArgument,
  GraphQLEnumValue,
  GraphQLInputField,
  EnumValueDefinitionNode,
} from 'graphql';
import { LinkImportType } from './types';

export const KeyDirective = new GraphQLDirective({
  name: 'key',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
  args: {
    fields: {
      type: new GraphQLNonNull(GraphQLString),
    },
    resolvable: {
      type: GraphQLBoolean,
      defaultValue: true
    }
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
    DirectiveLocation.ARGUMENT_DEFINITION,
    DirectiveLocation.SCALAR,
    DirectiveLocation.ENUM,
    DirectiveLocation.ENUM_VALUE,
    DirectiveLocation.INPUT_OBJECT,
    DirectiveLocation.INPUT_FIELD_DEFINITION,
  ],
  isRepeatable: true,
  args: {
    name: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const ShareableDirective = new GraphQLDirective({
  name: 'shareable',
  locations: [DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT],
});

export const LinkDirective = new GraphQLDirective({
  name: 'link',
  locations: [DirectiveLocation.SCHEMA],
  args: {
    url: {
      type: new GraphQLNonNull(GraphQLString),
    },
    import: {
      type: new GraphQLList(LinkImportType),
    }
  },
});

export const InaccessibleDirective = new GraphQLDirective({
  name: 'inaccessible',
  locations: [
    DirectiveLocation.FIELD_DEFINITION,
    DirectiveLocation.OBJECT,
    DirectiveLocation.INTERFACE,
    DirectiveLocation.UNION,
    DirectiveLocation.ARGUMENT_DEFINITION,
    DirectiveLocation.SCALAR,
    DirectiveLocation.ENUM,
    DirectiveLocation.ENUM_VALUE,
    DirectiveLocation.INPUT_OBJECT,
    DirectiveLocation.INPUT_FIELD_DEFINITION,
  ],
});

export const OverrideDirective = new GraphQLDirective({
  name: 'override',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    from: {
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
  ShareableDirective,
  LinkDirective,
  TagDirective,
  InaccessibleDirective,
  OverrideDirective,
];

export function isFederationDirective(directive: GraphQLDirective): boolean {
  return federationDirectives.some(({ name }) => name === directive.name);
}

export type ASTNodeWithDirectives =
  | FieldDefinitionNode
  | InputValueDefinitionNode
  | EnumValueDefinitionNode
  | ExecutableDefinitionNode
  | SchemaDefinitionNode
  | TypeDefinitionNode
  | TypeSystemExtensionNode;

/**
 * @deprecated This used to be different from GraphQLNamedType, but it's not
 * anymore. Use GraphQLNamedType instead.
 */
export type GraphQLNamedTypeWithDirectives = GraphQLNamedType;

function hasDirectives(
  node: ASTNodeWithDirectives,
): node is ASTNodeWithDirectives & {
  directives: ReadonlyArray<DirectiveNode>;
} {
  return Boolean('directives' in node && node.directives);
}

export function gatherDirectives(
  element:
    | GraphQLSchema
    | GraphQLNamedType
    | GraphQLField<any, any>
    | GraphQLArgument
    | GraphQLEnumValue
    | GraphQLInputField,
): DirectiveNode[] {
  const directives: DirectiveNode[] = [];
  if ('extensionASTNodes' in element && element.extensionASTNodes) {
    for (const node of element.extensionASTNodes) {
      if (hasDirectives(node)) {
        directives.push(...node.directives);
      }
    }
  }

  if (element.astNode && hasDirectives(element.astNode))
    directives.push(...element.astNode.directives);

  return directives;
}

export function typeIncludesDirective(
  type: GraphQLNamedType,
  directiveName: string,
): boolean {
  const directives = gatherDirectives(type);
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
