import { GraphQLError } from 'graphql';
import { Plugin } from 'pretty-format';

export default {
  test(value: any) {
    return value && value instanceof GraphQLError;
  },

  print(value: GraphQLError, print) {
    // Support printing GraphQLError.causes (from core-schema-js)
    if ('causes' in value) {
      // eslint-disable-next-line
      // @ts-ignore
      return print(value.causes.map((cause) => cause.message));
    }
    return print({
      message: value.message,
      code: value.extensions?.code ?? 'MISSING_ERROR',
      locations: value.locations,
    });
  },
} as Plugin;
