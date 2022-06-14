import { ERRORS } from '@apollo/federation-internals';
import {
  DocumentNode,
  FragmentDefinitionNode,
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
}

export function buildOperationContext({
  schema,
  operationDocument,
  operationName,
}: BuildOperationContextOptions): OperationContext {
  let operation: OperationDefinitionNode | undefined;
  let operationCount = 0;
  const fragments: {
    [fragmentName: string]: FragmentDefinitionNode;
  } = Object.create(null);
  operationDocument.definitions.forEach(definition => {
    switch (definition.kind) {
      case Kind.OPERATION_DEFINITION:
        operationCount++;
        if (!operationName && operationCount > 1) {
          throw ERRORS.INVALID_GRAPHQL.err(
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
    throw ERRORS.INVALID_GRAPHQL.err(
      operationName ? `Unknown operation named "${operationName}".` : 'Must provide an operation.'
    );
  }

  return {
    schema,
    operation,
    fragments,
  };
}
