import { isObjectType, FieldNode, GraphQLError, FieldDefinitionNode, InputValueDefinitionNode } from 'graphql';
import { logServiceAndType, errorWithCode, getFederationMetadata, findTypeNodeInServiceList, findSelectionSetOnNode, printFieldSet } from '../../utils';
import { PostCompositionValidator } from '.';

/**
 * The fields arg in @requires can only reference fields on the base type
 */
export const requiresFieldsMissingOnBase: PostCompositionValidator = ({
  schema,
  serviceList,
}) => {
  const errors: GraphQLError[] = [];

  const types = schema.getTypeMap();
  for (const [typeName, namedType] of Object.entries(types)) {
    // Only object types have fields
    if (!isObjectType(namedType)) continue;

    // for each field, if there's a requires on it, check that there's a matching
    // @external field, and that the types referenced are from the base type
    for (const [fieldName, field] of Object.entries(namedType.getFields())) {
      const fieldFederationMetadata = getFederationMetadata(field);
      const serviceName = fieldFederationMetadata?.serviceName;

      // serviceName should always exist on fields that have @requires federation data, since
      // the only case where serviceName wouldn't exist is on a base type, and in that case,
      // the `requires` metadata should never get added to begin with. This should be caught in
      // composition work. This kind of error should be validated _before_ composition.
      if (!serviceName) continue;

      if (fieldFederationMetadata?.requires) {
        const selections = fieldFederationMetadata.requires as FieldNode[];
        for (const selection of selections) {
          // check the selections are from the _base_ type (no serviceName)
          const matchingFieldOnType = namedType.getFields()[
            selection.name.value
          ];
          const typeFederationMetadata = getFederationMetadata(matchingFieldOnType);

          if (typeFederationMetadata?.serviceName) {
            const typeNode = findTypeNodeInServiceList(typeName, serviceName, serviceList);
            const fieldNode =
              typeNode &&
              'fields' in typeNode ?
              (typeNode.fields as (FieldDefinitionNode | InputValueDefinitionNode)[])?.
                find(field => field.name.value === fieldName) : undefined;
            const selectionSetNode = findSelectionSetOnNode(fieldNode, 'requires', printFieldSet(selections));
            errors.push(
              errorWithCode(
                'REQUIRES_FIELDS_MISSING_ON_BASE',
                logServiceAndType(serviceName, typeName, fieldName) +
                  `requires the field \`${selection.name.value}\` to be @external. @external fields must exist on the base type, not an extension.`,
                // TODO (Issue #705): when we can associate locations to service name's this should be the node of the
                // field on the other service that needs to be marked external
                selectionSetNode,
              ),
            );
          }
        }
      }
    }
  }

  return errors;
};
