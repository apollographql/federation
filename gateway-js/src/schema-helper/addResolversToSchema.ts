import {
  GraphQLSchema,
  isObjectType,
  GraphQLEnumType,
  isAbstractType,
  isScalarType,
  isEnumType,
  GraphQLEnumValueConfig,
} from 'graphql';

import { GraphQLResolverMap } from './resolverMap';

export function addResolversToSchema(
  schema: GraphQLSchema,
  resolvers: GraphQLResolverMap<any>
) {
  for (const [typeName, fieldConfigs] of Object.entries(resolvers)) {
    const type = schema.getType(typeName);

    if (isAbstractType(type)) {
      for (const [fieldName, fieldConfig] of Object.entries(fieldConfigs)) {
        if (fieldName.startsWith("__")) {
          (type as any)[fieldName.substring(2)] = fieldConfig;
        }
      }
    }

    if (isScalarType(type)) {
      for (const fn in fieldConfigs) {
        (type as any)[fn] = (fieldConfigs as any)[fn];
      }
    }

    if (isEnumType(type)) {
      const values = type.getValues();
      const newValues: { [key: string]: GraphQLEnumValueConfig } = {};
      values.forEach(value => {
        let newValue = (fieldConfigs as any)[value.name];
        if (newValue === undefined) {
          newValue = value.name;
        }

        newValues[value.name] = {
          value: newValue,
          deprecationReason: value.deprecationReason,
          description: value.description,
          astNode: value.astNode,
          extensions: undefined
        };
      });

      // In place updating hack to get around pulling in the full
      // schema walking and immutable updating machinery from graphql-tools
      Object.assign(
        type,
        new GraphQLEnumType({
          ...type.toConfig(),
          values: newValues
        })
      );
    }

    if (!isObjectType(type)) continue;

    const fieldMap = type.getFields();

    for (const [fieldName, fieldConfig] of Object.entries(fieldConfigs)) {
      if (fieldName.startsWith("__")) {
        (type as any)[fieldName.substring(2)] = fieldConfig;
        continue;
      }

      const field = fieldMap[fieldName];
      if (!field) continue;

      if (typeof fieldConfig === "function") {
        field.resolve = fieldConfig;
      } else {
        field.resolve = fieldConfig.resolve;
      }
    }
  }
}
