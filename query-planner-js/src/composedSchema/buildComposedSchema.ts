import {
  buildASTSchema,
  DocumentNode,
  GraphQLDirective,
  GraphQLError,
  GraphQLNamedType,
  GraphQLSchema,
  isDirective,
  isEnumType,
  isIntrospectionType,
  isObjectType,
} from 'graphql';
import { assert } from '../utilities/assert';
import {
  getArgumentValuesForDirective,
  getArgumentValuesForRepeatableDirective,
  isASTKind,
  parseSelections,
} from '../utilities/graphql';
import { MultiMap } from '../utilities/MultiMap';
import {
  FederationFieldMetadata,
  FederationTypeMetadata,
  FieldSet,
  Graph,
  GraphMap,
} from './metadata';

export function buildComposedSchema(document: DocumentNode): GraphQLSchema {
  const schema = buildASTSchema(document);

  // TODO: We should follow the Bootstrap algorithm from the Core Schema spec
  // to handle renames of @core itself.
  const coreName = 'core';

  const coreDirective = schema.getDirective(coreName);

  assert(coreDirective, `Expected core schema, but can't find @core directive`);

  // TODO: We should follow the CollectFeatures algorithm from the Core Schema
  // spec here, and use the collected features to validate feature
  // versions and handle renames.

  const coreDirectivesArgs = getArgumentValuesForRepeatableDirective(
    coreDirective,
    schema.astNode!,
  );

  for (const coreDirectiveArgs of coreDirectivesArgs) {
    const feature: string = coreDirectiveArgs['feature'];

    if (
      !(
        feature === 'https://specs.apollo.dev/core/v0.1' ||
        feature === 'https://specs.apollo.dev/join/v0.1'
      )
    ) {
      throw new GraphQLError(
        `Unsupported core schema feature and/or version: ${feature}`,
        schema.astNode!,
      );
    }
  }

  const joinName = 'join';

  function getJoinDirective(name: string) {
    const fullyQualifiedName = `${joinName}__${name}`;

    const directive = schema.getDirective(fullyQualifiedName);
    assert(
      directive,
      `Composed schema should define @${fullyQualifiedName} directive`,
    );
    return directive;
  }

  const ownerDirective = getJoinDirective('owner');
  const typeDirective = getJoinDirective('type');
  const fieldDirective = getJoinDirective('field');
  const graphDirective = getJoinDirective('graph');

  const graphEnumType = schema.getType(`${joinName}__Graph`);
  assert(isEnumType(graphEnumType), `${joinName}__Graph should be an enum`);

  const graphMap: GraphMap = Object.create(null);

  schema.extensions = {
    ...schema.extensions,
    federation: {
      graphs: graphMap,
    },
  };

  for (const graphValue of graphEnumType.getValues()) {
    const name = graphValue.name;

    const graphDirectiveArgs = getArgumentValuesForDirective(
      graphDirective,
      graphValue.astNode!,
    );
    assert(
      graphDirectiveArgs,
      `${graphEnumType.name} value ${name} in composed schema should have a @${graphDirective.name} directive`,
    );

    const graphName: string = graphDirectiveArgs['name'];
    const url: string = graphDirectiveArgs['url'];

    graphMap[name] = {
      name: graphName,
      url,
    };
  }

  // Because we don't explicitly validate that the owner and type directives are
  // defined appropriately in the schema, we need to do a bunch of error-checking
  // here. If we added that validation, this function could just be
  //    return graphMap[directiveArgs['graph']]!
  const getGraphFromDirective = (
    directive: GraphQLDirective,
    directiveArgs: Record<string, any>,
  ): Graph => {
    const graphName = directiveArgs['graph'];
    assert(
      typeof graphName === 'string',
      `Directive @${directive.name} must be invoked with a non-null ` +
        `${graphEnumType.name} argument named 'graph'`,
    );
    const graph = graphMap[graphName];
    assert(
      graph,
      `The 'graph' argument to @${directive.name} must be invoked with a value ` +
        `from the ${graphEnumType.name} enum`,
    );
    return graph;
  };

  for (const type of Object.values(schema.getTypeMap())) {
    if (isIntrospectionType(type)) continue;

    // We currently only allow join spec directives on object types.
    if (!isObjectType(type)) continue;

    assert(
      type.astNode,
      `GraphQL type "${type.name}" should contain AST nodes`,
    );

    const ownerDirectiveArgs = getArgumentValuesForDirective(
      ownerDirective,
      type.astNode,
    );

    const typeMetadata: FederationTypeMetadata = ownerDirectiveArgs
      ? {
          graphName: getGraphFromDirective(ownerDirective, ownerDirectiveArgs)
            .name,
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

    const typeDirectivesArgs = getArgumentValuesForRepeatableDirective(
      typeDirective,
      type.astNode,
    );

    assert(
      !(typeMetadata.isValueType && typeDirectivesArgs.length >= 1),
      `GraphQL type "${type.name}" cannot have a @${typeDirective.name} \
directive without an @${ownerDirective.name} directive`,
    );

    for (const typeDirectiveArgs of typeDirectivesArgs) {
      const graphName = getGraphFromDirective(typeDirective, typeDirectiveArgs)
        .name;

      const keyFields = parseFieldSet(typeDirectiveArgs['key']);

      typeMetadata.keys?.add(graphName, keyFields);
    }

    for (const fieldDef of Object.values(type.getFields())) {
      assert(
        fieldDef.astNode,
        `Field "${type.name}.${fieldDef.name}" should contain AST nodes`,
      );

      const fieldDirectiveArgs = getArgumentValuesForDirective(
        fieldDirective,
        fieldDef.astNode,
      );

      if (!fieldDirectiveArgs) continue;

      const fieldMetadata: FederationFieldMetadata = {
        graphName: graphMap[fieldDirectiveArgs?.['graph']]?.name,
      };

      fieldDef.extensions = {
        ...fieldDef.extensions,
        federation: fieldMetadata,
      };

      const { requires, provides } = fieldDirectiveArgs;

      if (requires) {
        fieldMetadata.requires = parseFieldSet(requires);
      }

      if (provides) {
        fieldMetadata.provides = parseFieldSet(provides);
      }
    }
  }

  // We filter out schema elements that should not be exported to get to the
  // API schema.

  const schemaConfig = schema.toConfig();

  return new GraphQLSchema({
    ...schemaConfig,
    types: schemaConfig.types.filter(isExported),
    directives: schemaConfig.directives.filter(isExported),
  });

  // TODO: Implement the IsExported algorithm from the Core Schema spec.
  function isExported(element: NamedSchemaElement) {
    return !(isAssociatedWithFeature(element, coreName) || isAssociatedWithFeature(element, joinName))
  }

  function isAssociatedWithFeature(
    element: NamedSchemaElement,
    featureName: string,
  ) {
    return (
      // Only directives can use the unprefixed feature name
      isDirective(element) && element.name === featureName ||
      element.name.startsWith(`${featureName}__`)
    );
  }
}

type NamedSchemaElement = GraphQLDirective | GraphQLNamedType;

function parseFieldSet(source: string): FieldSet {
  const selections = parseSelections(source);

  assert(
    selections.every(isASTKind('Field', 'InlineFragment')),
    `Field sets may not contain fragment spreads, but found: "${source}"`,
  );

  assert(selections.length > 0, `Field sets may not be empty`);

  return selections;
}
