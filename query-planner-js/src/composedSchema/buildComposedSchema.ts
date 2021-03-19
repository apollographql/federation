import {
  buildASTSchema,
  GraphQLSchema,
  isIntrospectionType,
  isObjectType,
  parse,
  Source,
} from 'graphql';
import { assert } from '../utilities/assert';
import {
  getArgumentValuesForDirective,
  getArgumentValuesForRepeatableDirective,
  parseSelectionSet,
} from '../utilities/graphql';
import { MultiMap } from '../utilities/MultiMap';
import {
  DetachDirective,
  KeyDirective,
  OwnerDirective,
  ProvidesDirective,
  RequiresDirective,
  ResolveDirective,
} from './csdlDirectives';
import {
  FederationFieldMetadata,
  FederationTypeMetadata,
  SelectionSet,
} from './metadata';

export function buildComposedSchema(source: string | Source): GraphQLSchema {
  const document = parse(source);
  const schema = buildASTSchema(document);

  for (const type of Object.values(schema.getTypeMap())) {
    if (isIntrospectionType(type)) continue;

    // We currently only allow @owner and @key directives on object types.
    if (!isObjectType(type)) continue;

    assert(
      type.astNode,
      `GraphQL type "${type.name}" should contain AST nodes`,
    );

    const ownerDirectiveArgs = getArgumentValuesForDirective(
      OwnerDirective,
      type.astNode,
    );

    const typeMetadata: FederationTypeMetadata = ownerDirectiveArgs
      ? {
          serviceName: ownerDirectiveArgs['graph'],
          keys: new MultiMap(),
          isValueType: false,
        }
      : {
          isValueType: true,
        };

    type.extensions = {
      ...type.extensions,
      federation: typeMetadata,
    };

    const keyDirectivesArgs = getArgumentValuesForRepeatableDirective(
      KeyDirective,
      type.astNode,
    );

    assert(
      !(typeMetadata.isValueType && keyDirectivesArgs.length >= 1),
      `GraphQL type "${type.name}" cannot have a @key directive without an @owner directive`,
    );

    for (const keyDirectiveArgs of keyDirectivesArgs) {
      const graphName: string = keyDirectiveArgs['graph'];
      const fields: SelectionSet = parseSelectionSet(keyDirectiveArgs['fields'])
        .selections;

      typeMetadata.keys?.add(graphName, fields);
    }

    for (const fieldDef of Object.values(type.getFields())) {
      assert(
        fieldDef.astNode,
        `Field "${type.name}.${fieldDef.name}" should contain AST nodes`,
      );

      const resolveDirectiveArgs = getArgumentValuesForDirective(
        ResolveDirective,
        fieldDef.astNode,
      );

      const fieldMetadata: FederationFieldMetadata = {
        serviceName:
          resolveDirectiveArgs?.['graph'] ?? typeMetadata.serviceName,
      };

      fieldDef.extensions = {
        ...fieldDef.extensions,
        federation: fieldMetadata,
      };

      const requiresDirectiveArgs = getArgumentValuesForDirective(
        RequiresDirective,
        fieldDef.astNode,
      );

      if (requiresDirectiveArgs) {
        fieldMetadata.requires = parseSelectionSet(
          requiresDirectiveArgs['fields'],
        ).selections;
      }

      const providesDirectiveArgs = getArgumentValuesForDirective(
        ProvidesDirective,
        fieldDef.astNode,
      );

      if (providesDirectiveArgs) {
        fieldMetadata.provides = parseSelectionSet(
          providesDirectiveArgs['fields'],
        ).selections;
      }

      const detachDirectiveArgs = getArgumentValuesForDirective(
        DetachDirective,
        fieldDef.astNode,
      );

      if (detachDirectiveArgs) {
        fieldMetadata.shouldDetach = true;
      }
    }
  }

  return schema;
}
