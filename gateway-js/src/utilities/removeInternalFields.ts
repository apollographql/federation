import { transformSchema } from 'apollo-graphql';
import {
  isObjectType,
  GraphQLSchema,
  GraphQLObjectType
} from 'graphql';

export function removeInternalFields(schema: GraphQLSchema) {
  const newSchema =  transformSchema(schema, type => {
    if (isObjectType(type)) {
      const config = type.toConfig();

      const fields = Object.keys(config.fields).reduce((fieldsObject, fieldName) => {
        const field = config.fields[fieldName];

        if(field.astNode?.directives?.some(directive => directive.name.value === 'internal')){
          return fieldsObject;
        }

        return {...fieldsObject, [fieldName]: field}
      },{})

      return new GraphQLObjectType({...config, fields});
    }
    return undefined;
  });

  const config = newSchema.toConfig();

  return new GraphQLSchema({
    ...config,
    directives: config.directives.filter(directive => directive.name !== 'internal')
  });
}
