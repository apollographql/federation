import { GraphQLError } from 'graphql';
import { NewPlugin } from 'pretty-format';

export default {
  test(value: any) {
    return value && value instanceof GraphQLError;
  },

  serialize(value: GraphQLError, config, indentation, depth, refs, printer) {
    // Support printing GraphQLError.causes (from core-schema-js)
    if ('causes' in value) {
      return printer(
        // @ts-ignore
        value.causes.map((cause) => cause.message),
        config,
        indentation,
        depth,
        refs,
      );
    }
    return printer(
      {
        message: value.message,
        code: value.extensions?.code ?? 'MISSING_ERROR',
        locations: value.locations ?? [],
      },
      config,
      indentation,
      depth,
      refs,
    );
  },
} as NewPlugin;
