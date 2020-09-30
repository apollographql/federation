import { isObjectType, typeFromAST, isEqualType, GraphQLError, GraphQLType } from 'graphql';
import { logServiceAndType, errorWithCode, getFederationMetadata } from '../../utils';
import { PostCompositionValidator } from '.';

/**
 * All fields marked with @external must match the type definition of the base service.
 * Additional warning if the type of the @external field doesn't exist at all on the schema
 */
export const externalTypeMismatch: PostCompositionValidator = ({ schema }) => {
  const errors: GraphQLError[] = [];

  const types = schema.getTypeMap();
  for (const [typeName, namedType] of Object.entries(types)) {
    // Only object types have fields
    if (!isObjectType(namedType)) continue;

    // If externals is populated, we need to look at each one and confirm
    // there is a matching @requires
    const typeFederationMetadata = getFederationMetadata(namedType);
    if (typeFederationMetadata?.externals) {
      // loop over every service that has extensions with @external
      for (const [serviceName, externalFieldsForService] of Object.entries(
        typeFederationMetadata.externals,
      )) {
        // for a single service, loop over the external fields.
        for (const { field: externalField } of externalFieldsForService) {
          const externalFieldName = externalField.name.value;
          const allFields = namedType.getFields();
          const matchingBaseField = allFields[externalFieldName];

          // FIXME: TypeScript doesn’t currently support passing in a type union
          // to an overloaded function like `typeFromAST`
          // See https://github.com/Microsoft/TypeScript/issues/14107
          const externalFieldType = typeFromAST(
            schema,
            externalField.type as any,
          ) as GraphQLType;

          if (!externalFieldType) {
            errors.push(
              errorWithCode(
                'EXTERNAL_TYPE_MISMATCH',
                logServiceAndType(serviceName, typeName, externalFieldName) +
                  `the type of the @external field does not exist in the resulting composed schema`,
              ),
            );
          } else if (
            matchingBaseField &&
            !isEqualType(matchingBaseField.type, externalFieldType)
          ) {
            errors.push(
              errorWithCode(
                'EXTERNAL_TYPE_MISMATCH',
                logServiceAndType(serviceName, typeName, externalFieldName) +
                  `Type \`${externalFieldType}\` does not match the type of the original field in ${typeFederationMetadata.serviceName} (\`${matchingBaseField.type}\`)`,
              ),
            );
          }
        }
      }
    }
  }

  return errors;
};
