import { visit, GraphQLError } from 'graphql';
import { ServiceDefinition } from '../../types';

import { logServiceAndType, errorWithCode, getOrSetRecord } from '../../utils';

export const duplicateEnumValue = ({
  name: serviceName,
  typeDefs,
}: ServiceDefinition) => {
  const errors: GraphQLError[] = [];

  const enums: { [name: string]: string[] } = {};

  visit(typeDefs, {
    EnumTypeDefinition(definition) {
      const name = definition.name.value;
      const enumValues =
        definition.values && definition.values.map(value => value.name.value);

      if (!enumValues) return definition;

      const allEnumValues = getOrSetRecord(enums, name, []);
      enumValues.forEach((valueName) => {
        if (allEnumValues.includes(valueName)) {
          errors.push(
            errorWithCode(
              'DUPLICATE_ENUM_VALUE',
              logServiceAndType(serviceName, name, valueName) +
                `The enum, \`${name}\` has multiple definitions of the \`${valueName}\` value.`,
            ),
          );
        } else {
          allEnumValues.push(valueName);
        }
      });

      return definition;
    },
    EnumTypeExtension(definition) {
      const name = definition.name.value;
      const enumValues =
        definition.values && definition.values.map(value => value.name.value);

      if (!enumValues) return definition;

      const allEnumValues = getOrSetRecord(enums, name, []);
      enumValues.forEach((valueName) => {
        if (allEnumValues.includes(valueName)) {
          errors.push(
            errorWithCode(
              'DUPLICATE_ENUM_VALUE',
              logServiceAndType(serviceName, name, valueName) +
                `The enum, \`${name}\` has multiple definitions of the \`${valueName}\` value.`,
            ),
          );
        } else {
          allEnumValues.push(valueName);
        }
      });

      return definition;
    },
  });

  return errors;
};
