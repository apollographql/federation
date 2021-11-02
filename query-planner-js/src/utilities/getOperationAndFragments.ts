import {
  DocumentNode,
  FragmentDefinitionNode,
  GraphQLError,
  Kind,
  OperationDefinitionNode,
} from 'graphql';

export type FragmentMap = Map<String, FragmentDefinitionNode>;

export function getOperationAndFragments(
  document: DocumentNode,
  operationName?: string,
): { operation: OperationDefinitionNode; fragmentMap: FragmentMap } {
  let operation: OperationDefinitionNode | undefined;
  const fragmentMap = new Map<String, FragmentDefinitionNode>();

  document.definitions.forEach((definition) => {
    switch (definition.kind) {
      case Kind.OPERATION_DEFINITION:
        if (!operationName && operation) {
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
        fragmentMap.set(definition.name.value, definition);
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

  return { operation, fragmentMap };
}
