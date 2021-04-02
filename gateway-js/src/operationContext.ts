import {
  DocumentNode,
  FragmentDefinitionNode,
  GraphQLError,
  GraphQLSchema,
  Kind,
  OperationDefinitionNode,
} from 'graphql';

type FragmentMap = { [fragmentName: string]: FragmentDefinitionNode };

export type OperationContext = {
  schema: GraphQLSchema;
  operation: OperationDefinitionNode;
  fragments: FragmentMap;
};

// Adapted from buildExecutionContext in graphql-js
interface BuildOperationContextOptions {
  schema: GraphQLSchema;
  operationDocument: DocumentNode;
  operationName?: string;
};

export function buildOperationContext({
  schema,
  operationDocument,
  operationName,
}: BuildOperationContextOptions): OperationContext {
  let operation: OperationDefinitionNode | undefined;
  let operationCount: number = 0;
  const fragments: {
    [fragmentName: string]: FragmentDefinitionNode;
  } = Object.create(null);
  operationDocument.definitions.forEach(definition => {
    switch (definition.kind) {
      case Kind.OPERATION_DEFINITION:
        operationCount++;
        if (!operationName && operationCount > 1) {
          throw new GraphQLError(
            'Must provide operation name if query contains ' +
              'multiple operations.',
          );
        }
        if (
          !operationName ||
          (definition.name && definition.name.value === operationName)
        ) {
          operation = definition;
        }
        break;
      case Kind.FRAGMENT_DEFINITION:
        fragments[definition.name.value] = definition;
        break;
    }
  });
  if (!operation) {
    if (operationName) {
      throw new GraphQLError(`Unknown operation named "${operationName}".`);
    } else {
      throw new GraphQLError('Must provide an operation.');
    }
  }

  return {
    schema,
    operation,
    fragments,
  };
}
