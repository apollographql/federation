import {
  DirectiveNode,
  FieldDefinitionNode,
  GraphQLFieldMap,
  GraphQLNamedType,
  GraphQLSchema,
  TypeDefinitionNode,
  TypeExtensionNode,
  visit,
} from 'graphql';
import { mapGetOrSet } from '../utilities';
import { FederationField, FederationType, ServiceDefinition } from './types';
import { getFederationMetadata } from './utils';

// key is name of directive
export type DirectiveUsages = Map<string, DirectiveNode[]>;

// key is field or type name the usages are found on
type DirectiveUsagesPerField = Map<string, DirectiveUsages>;

type DirectiveUsagesPerType = Map<
  string,
  { directives: DirectiveUsages; fields: DirectiveUsagesPerField }
>;

type DirectiveUsagesPerSubgraph = Map<string, DirectiveUsagesPerType>;

export class DirectiveMetadata {
  directiveUsagesPerSubgraph: DirectiveUsagesPerSubgraph;

  constructor(subgraphs: ServiceDefinition[]) {
    this.directiveUsagesPerSubgraph = new Map();
    for (const subgraph of subgraphs) {
      const visitor = objectLikeDirectivesVisitor(
        subgraph.name,
        this.directiveUsagesPerSubgraph,
      );
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

  applyMetadataToSupergraphSchema(schema: GraphQLSchema) {
    // TODO: only capture usages of non-repeatable directives once.
    // might be a printer concern instead.
    for (const [
      _subgraphName,
      directiveUsagesPerType,
    ] of this.directiveUsagesPerSubgraph.entries()) {
      for (const [
        typeName,
        { directives, fields },
      ] of directiveUsagesPerType.entries()) {
        const namedType = schema.getType(typeName) as
          | GraphQLNamedType
          | undefined;
        if (!namedType) continue;

        const existingMetadata = getFederationMetadata(namedType);
        let directiveUsages = existingMetadata?.directiveUsages;

        if (directiveUsages) {
          for (const [directiveName, usages] of directiveUsages.entries()) {
            usages.push(...(directives.get(directiveName) ?? []));
          }
        } else {
          directiveUsages = directives;
        }

        const typeFederationMetadata: FederationType = {
          ...existingMetadata,
          directiveUsages,
        };
        namedType.extensions = {
          ...namedType.extensions,
          federation: typeFederationMetadata,
        };

        interface HasFields {
          getFields(): GraphQLFieldMap<any, any>;
        }

        for (const [fieldName, usagesPerDirective] of fields.entries()) {
          const field = (namedType as HasFields).getFields()[fieldName];
          if (!field) continue;

          const originalMetadata = getFederationMetadata(field);
          let directiveUsages = originalMetadata?.directiveUsages;
          if (directiveUsages) {
            for (const [directiveName, usages] of directiveUsages.entries()) {
              usages.push(...(usagesPerDirective.get(directiveName) ?? []));
            }
          } else {
            directiveUsages = usagesPerDirective;
          }

          const fieldFederationMetadata: FederationField = {
            ...originalMetadata,
            directiveUsages,
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

function objectLikeDirectivesVisitor(
  subgraphName: string,
  directiveUsagesPerSubgraph: DirectiveUsagesPerSubgraph,
) {
  return function <
    T extends (TypeDefinitionNode | TypeExtensionNode) & {
      directives?: readonly DirectiveNode[];
      fields?: readonly FieldDefinitionNode[] | undefined;
    },
  >(node: T) {
    const directiveUsagesPerType: DirectiveUsagesPerType = mapGetOrSet(
      directiveUsagesPerSubgraph,
      subgraphName,
      new Map(),
    );

    for (const directive of node.directives ?? []) {
      const { directives: usagesByDirectiveName } = mapGetOrSet(
        directiveUsagesPerType,
        node.name.value,
        {
          directives: new Map<string, DirectiveNode[]>(),
          fields: new Map<string, DirectiveUsages>(),
        },
      );
      const usages = mapGetOrSet(
        usagesByDirectiveName,
        directive.name.value,
        [],
      );
      usages.push(directive);
    }

    if ('fields' in node && node.fields) {
      for (const field of node.fields) {
        for (const directive of field.directives ?? []) {
          const { fields: usagesByFieldName } = mapGetOrSet(
            directiveUsagesPerType,
            node.name.value,
            {
              directives: new Map<string, DirectiveNode[]>(),
              fields: new Map<string, DirectiveUsages>(),
            },
          );
          const usagesByDirectiveName = mapGetOrSet(
            usagesByFieldName,
            field.name.value,
            new Map<string, DirectiveNode[]>(),
          );
          const usages = mapGetOrSet(
            usagesByDirectiveName,
            directive.name.value,
            [],
          );
          usages.push(directive);
        }
      }
    }
  };
}
