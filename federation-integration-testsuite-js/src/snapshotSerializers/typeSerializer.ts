import { isNamedType, GraphQLNamedType, printType } from 'graphql';
import { NewPlugin } from 'pretty-format';

export default {
  test(value: any) {
    return value && isNamedType(value);
  },
  serialize(value: GraphQLNamedType) {
    return printType(value);
  }
} as NewPlugin;
