import {
  GraphQLDirective,
  DirectiveLocation,
  GraphQLNonNull,
  GraphQLString,
  GraphQLEnumType,
} from 'graphql';

const CorePurpose = new GraphQLEnumType({
  name: 'core__Purpose',
  values: {
    EXECUTION: {
      description:
        '`EXECUTION` features provide metadata necessary to for operation execution.',
    },
    SECURITY: {
      description:
        '`SECURITY` features provide metadata necessary to securely resolve fields.',
    },
  },
});

export const CoreDirective = new GraphQLDirective({
  name: 'core',
  locations: [DirectiveLocation.SCHEMA],
  args: {
    feature: {
      type: new GraphQLNonNull(GraphQLString),
    },
    as: {
      type: GraphQLString,
    },
    for: {
      type: CorePurpose,
    },
  },
  isRepeatable: true,
});
