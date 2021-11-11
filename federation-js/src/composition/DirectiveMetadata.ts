import {
  ASTNode,
  DirectiveNode,
  FieldDefinitionNode,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLUnionType,
  InterfaceTypeDefinitionNode,
  InterfaceTypeExtensionNode,
  ObjectTypeDefinitionNode,
  ObjectTypeExtensionNode,
  UnionTypeDefinitionNode,
  UnionTypeExtensionNode,
  visit,
  VisitFn,
} from 'graphql';
import { mapGetOrSet } from '../utilities';
import { ServiceDefinition } from './types';
import type { FederationField, FederationType } from '../composition/types';
import { getFederationMetadata } from './utils';

// directive name => usages
export type DirectiveUsages = Map<string, DirectiveNode[]>;

// field name => directive name => usages
type DirectiveUsagesPerField = Map<string, DirectiveUsages>;

// type name => {
//   directives: DirectiveUsages,
//   fields: DirectiveUsagesPerField
// }
type DirectiveUsagesPerType = Map<
  string,
  { directives: DirectiveUsages; fields: DirectiveUsagesPerField }
>;

// subgraph name => DirectiveUsagesPerType
type DirectiveUsagesPerSubgraph = Map<string, DirectiveUsagesPerType>;

type ObjectInterfaceOrUnionTypeNode =
  | ObjectTypeDefinitionNode
  | ObjectTypeExtensionNode
  | InterfaceTypeDefinitionNode
  | InterfaceTypeExtensionNode
  | UnionTypeDefinitionNode
  | UnionTypeExtensionNode;
export class DirectiveMetadata {
  directiveUsagesPerSubgraph: DirectiveUsagesPerSubgraph;

  constructor(subgraphs: ServiceDefinition[]) {
    this.directiveUsagesPerSubgraph = new Map();
    for (const subgraph of subgraphs) {
      const visitor = this.getTypeVisitor(subgraph.name);
      // visit each object-like type to build the map of directive usages
      visit(subgraph.typeDefs, {
        ObjectTypeDefinition: visitor,
        ObjectTypeExtension: visitor,
        InterfaceTypeDefinition: visitor,
        InterfaceTypeExtension: visitor,
        UnionTypeDefinition: visitor,
        UnionTypeExtension: visitor,
      });
    }
  }

  // Returns a visitor function which is capable of visiting object, interface, and
  // union nodes (and their extensions). The visitor returned from this function
  // collects all directive usages in the data structure
  // `this.directiveUsagesPerSubgraph`.
  getTypeVisitor(
    subgraphName: string,
  ): VisitFn<ASTNode, ObjectInterfaceOrUnionTypeNode> {
    function collectDirectiveUsages(
      node: ObjectInterfaceOrUnionTypeNode | FieldDefinitionNode,
      usagesOnNode: DirectiveUsages,
    ) {
      for (const directive of node.directives ?? []) {
        const usages = mapGetOrSet(usagesOnNode, directive.name.value, []);
        usages.push(directive);
      }
    }

    // Return a visitor function
    return (node) => {
      const directiveUsagesPerType: DirectiveUsagesPerType = mapGetOrSet(
        this.directiveUsagesPerSubgraph,
        subgraphName,
        new Map(),
      );

      const { directives: usagesOnType, fields: usagesByFieldName } =
        mapGetOrSet(directiveUsagesPerType, node.name.value, {
          directives: new Map<string, DirectiveNode[]>(),
          fields: new Map<string, DirectiveUsages>(),
        });

      // Collect directive usages on the type node
      collectDirectiveUsages(node, usagesOnType);

      // Collect directive usages on each field node
      if ('fields' in node && node.fields) {
        for (const field of node.fields) {
          const usagesOnField = mapGetOrSet(
            usagesByFieldName,
            field.name.value,
            new Map<string, DirectiveNode[]>(),
          );
          collectDirectiveUsages(field, usagesOnField);
        }
      }
    };
  }

  // visit the entire map for any usages of a directive
  hasUsages(directiveName: string) {
    for (const directiveUsagesPerType of this.directiveUsagesPerSubgraph.values()) {
      for (const { directives, fields } of directiveUsagesPerType.values()) {
        const usagesOnType = directives.get(directiveName);
        if (usagesOnType && usagesOnType.length > 0) return true;

        for (const directiveUsages of fields.values()) {
          const usagesOnField = directiveUsages.get(directiveName);
          if (usagesOnField && usagesOnField.length > 0) return true;
        }
      }
    }
    return false;
  }

  // traverse the map of directive usages and apply metadata to the corresponding
  // `extensions` fields on the provided schema.
  applyMetadataToSupergraphSchema(schema: GraphQLSchema) {
    for (const directiveUsagesPerType of this.directiveUsagesPerSubgraph.values()) {
      for (const [
        typeName,
        { directives, fields },
      ] of directiveUsagesPerType.entries()) {
        const namedType = schema.getType(typeName) as
          | GraphQLObjectType
          | GraphQLInterfaceType
          | GraphQLUnionType
          | undefined;
        if (!namedType) continue;

        const existingMetadata = getFederationMetadata(namedType);
        const typeFederationMetadata: FederationType = {
          ...existingMetadata,
          directiveUsages: mergeDirectiveUsages(
            existingMetadata?.directiveUsages,
            directives,
          ),
        };
        namedType.extensions = {
          ...namedType.extensions,
          federation: typeFederationMetadata,
        };

        for (const [fieldName, usagesPerDirective] of fields.entries()) {
          if (!('getFields' in namedType)) continue;
          const field = namedType.getFields()[fieldName];
          if (!field) continue;

          const existingMetadata = getFederationMetadata(field);
          const fieldFederationMetadata: FederationField = {
            ...existingMetadata,
            directiveUsages: mergeDirectiveUsages(
              existingMetadata?.directiveUsages,
              usagesPerDirective,
            ),
          };

          field.extensions = {
            ...field.extensions,
            federation: fieldFederationMetadata,
          };
        }
      }
    }
  }
}

function mergeDirectiveUsages(
  first: DirectiveUsages | undefined,
  second: DirectiveUsages,
): DirectiveUsages {
  const merged: DirectiveUsages = new Map();

  if (first) {
    for (const [directiveName, usages] of first.entries()) {
      merged.set(directiveName, [...usages]);
    }
  }

  for (const [directiveName, newUsages] of second.entries()) {
    const usages = mapGetOrSet(merged, directiveName, []);
    usages.push(...newUsages);
  }

  return merged;
}
