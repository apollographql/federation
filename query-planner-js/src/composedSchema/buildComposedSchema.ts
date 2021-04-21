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
  parseFieldSet,
} from '../utilities/graphql';
import { MultiMap } from '../utilities/MultiMap';
import {
  FederationFieldMetadata,
  FederationTypeMetadata,
  FederationEntityTypeMetadata,
  GraphMap,
  isEntityTypeMetadata,
  Graph,
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

  const graphMap: GraphMap = new Map();

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

    graphMap.set(name, {
      name: graphName,
      url,
    });
  }

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

    let typeMetadata: FederationTypeMetadata;
    if (ownerDirectiveArgs) {
      assert(
        ownerDirectiveArgs.graph,
        `@${ownerDirective.name} directive requires a \`graph\` argument`,
      );
      const graph = graphMap.get(ownerDirectiveArgs.graph);
      assertGraphFound(graph, ownerDirectiveArgs.graph, ownerDirective.name);

      typeMetadata = {
        graphName: graph.name,
        keys: new MultiMap(),
        isValueType: false,
      };
    } else {
      typeMetadata = {
        isValueType: true,
      };
    }

    type.extensions = {
      ...type.extensions,
      federation: typeMetadata,
    };

    const typeDirectivesArgs = getArgumentValuesForRepeatableDirective(
      typeDirective,
      type.astNode,
    );

    // The assertion here guarantees the safety of the type cast below
    // (typeMetadata as FederationEntityTypeMetadata). Adjustments to this assertion
    // should account for this dependency.
    assert(
      isEntityTypeMetadata(typeMetadata) || typeDirectivesArgs.length === 0,
      `GraphQL type "${type.name}" cannot have a @${typeDirective.name} \
directive without an @${ownerDirective.name} directive`,
    );

    for (const typeDirectiveArgs of typeDirectivesArgs) {
      assert(
        typeDirectiveArgs.graph,
        `GraphQL type "${type.name}" must provide a \`graph\` argument to the @${typeDirective.name} directive`,
      );
      const graph = graphMap.get(typeDirectiveArgs.graph);
      assertGraphFound(graph, typeDirectiveArgs.graph, typeDirective.name);

      const keyFields = parseFieldSet(typeDirectiveArgs['key']);

      // We know we won't actually be looping here in the case of a value type
      // based on the assertion above, but TS is not able to infer that.
      (typeMetadata as FederationEntityTypeMetadata).keys.add(
        graph.name,
        keyFields,
      );
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

      let fieldMetadata: FederationFieldMetadata;
      if (fieldDirectiveArgs.graph) {
        const graph = graphMap.get(fieldDirectiveArgs.graph);
        // This should never happen, but the assertion guarantees the existence of `graph`
        assertGraphFound(graph, fieldDirectiveArgs.graph, fieldDirective.name);
        fieldMetadata = { graphName: graph.name };
      } else {
        fieldMetadata = { graphName: undefined };
      }

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

// This should never happen, hence 'programming error', but this assertion
// guarantees the existence of `graph`.
function assertGraphFound(graph: Graph | undefined, graphName: string, directiveName: string): asserts graph {
  assert(
    graph,
    `Programming error: found unexpected \`graph\` argument value "${graphName}" in @${directiveName} directive`,
  );
}
