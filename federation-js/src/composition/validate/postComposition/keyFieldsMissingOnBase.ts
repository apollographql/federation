import { isObjectType, FieldNode, GraphQLError } from 'graphql';
import { logServiceAndType, errorWithCode, getFederationMetadata, findTypeNodeInServiceList, findSelectionSetOnNode, isDirectiveDefinitionNode, printFieldSet } from '../../utils';
import { PostCompositionValidator } from '.';

/**
 * - The fields argument can not select fields that were overwritten by another service
 */
export const keyFieldsMissingOnBase: PostCompositionValidator = ({
  schema,
  serviceList,
}) => {
  const errors: GraphQLError[] = [];

  const types = schema.getTypeMap();
  for (const [typeName, namedType] of Object.entries(types)) {
    if (!isObjectType(namedType)) continue;

    const typeFederationMetadata = getFederationMetadata(namedType);
    if (typeFederationMetadata?.keys) {
      const allFieldsInType = namedType.getFields();
      for (const [serviceName, selectionSets = []] of Object.entries(
        typeFederationMetadata.keys,
      )) {
        for (const selectionSet of selectionSets) {
          for (const field of selectionSet as FieldNode[]) {
            const name = field.name.value;

            // find corresponding field for each selected field
            const matchingField = allFieldsInType[name];

            // NOTE: We don't need to warn if there is no matching field.
            // keyFieldsSelectInvalidType already does that :)
            if (matchingField) {
              const typeNode = findTypeNodeInServiceList(typeName, serviceName, serviceList);
              const selectionSetNode = !isDirectiveDefinitionNode(typeNode) ?
                findSelectionSetOnNode(typeNode, 'key', printFieldSet(selectionSet)) : undefined;

              const fieldFederationMetadata = getFederationMetadata(matchingField);
              // warn if not from base type OR IF IT WAS OVERWITTEN
              if (fieldFederationMetadata?.serviceName) {
                errors.push(
                  errorWithCode(
                    'KEY_FIELDS_MISSING_ON_BASE',
                    logServiceAndType(serviceName, typeName) +
                      `A @key selects ${name}, but ${typeName}.${name} was either created or overwritten by ${fieldFederationMetadata.serviceName}, not ${serviceName}`,
                    selectionSetNode,
                  ),
                );
              }
            }
          }
        }
      }
    }
  }

  return errors;
};
