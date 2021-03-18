import {
  GraphQLDirective,
  DirectiveLocation,
  GraphQLNonNull,
  GraphQLString,
} from 'graphql';

export const CoreDirective = new GraphQLDirective({
  name: 'core',
  locations: [DirectiveLocation.SCHEMA],
  args: {
    feature: {
      type: GraphQLNonNull(GraphQLString),
    },
  },
  isRepeatable: true,
});
