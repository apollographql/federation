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
  description: 'Designates an object type as an entity and specifies its key fields. Key fields are a set of fields that a subgraph can use to uniquely identify any instance of the entity.',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
  isRepeatable: true,
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
  description: 'Indicates that an object or interface definition is an extension of another definition of that same type. This directive is for use with GraphQL subgraph libraries that do not support the extend keyword. Most commonly, these are subgraph libraries that generate their schema programmatically instead of using a static .graphql file.',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
});

export const ExternalDirective = new GraphQLDirective({
  name: 'external',
  description: 'Indicates that this subgraph usually can\'t resolve a particular object field, but it still needs to define that field for other purposes. This directive is always used in combination with another directive that references object fields, such as @provides or @requires.',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
});

export const RequiresDirective = new GraphQLDirective({
  name: 'requires',
  description: 'Indicates that the resolver for a particular entity field depends on the values of other entity fields that are resolved by other subgraphs. This tells the router that it needs to fetch the values of those externally defined fields first, even if the original client query didn\'t request them.',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    fields: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const ProvidesDirective = new GraphQLDirective({
  name: 'provides',
  description: 'Specifies a set of entity fields that a subgraph can resolve, but only at a particular schema path (at other paths, the subgraph can\'t resolve those fields). If a subgraph can always resolve a particular entity field, do not apply this directive. Using this directive is always an optional optimization. It can reduce the total number of subgraphs that your router needs to communicate with to resolve certain operations, which can improve performance.',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    fields: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const TagDirective = new GraphQLDirective({
  name: 'tag',
  description: 'Applies arbitrary string metadata to a schema location. Custom tooling can use this metadata during any step of the schema delivery flow, including composition, static analysis, and documentation. The GraphOS Enterprise contracts feature uses @tag with its inclusion and exclusion filters.',
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
    DirectiveLocation.SCHEMA,
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
  description: 'Indicates that an object type\'s field is allowed to be resolved by multiple subgraphs (by default in Federation 2, object fields can be resolved by only one subgraph).',
  locations: [DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT],
});

export const LinkDirective = new GraphQLDirective({
  name: 'link',
  description: 'This directive links definitions from an external specification to this schema.',
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
  description: 'Indicates that a definition in the subgraph schema should be omitted from the router\'s API schema, even if that definition is also present in other subgraphs. This means that the field is not exposed to clients at all.',
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
  description: 'Indicates that an object field is now resolved by this subgraph instead of another subgraph where it\'s also defined. This enables you to migrate a field from one subgraph to another.',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    from: {
      type: new GraphQLNonNull(GraphQLString),
    },
    label: {
      type: GraphQLString,
    }
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
