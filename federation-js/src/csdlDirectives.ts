import {
  GraphQLDirective,
  DirectiveLocation,
  GraphQLNonNull,
  GraphQLString,
} from 'graphql';

export const LinkDirective = new GraphQLDirective({
  name: 'cs__link',
  locations: [DirectiveLocation.SCHEMA],
  args: {
    name: {
      type: GraphQLNonNull(GraphQLString),
    },
    url: {
      type: GraphQLNonNull(GraphQLString),
    },
  },
  isRepeatable: true,
});

export const KeyDirective = new GraphQLDirective({
  name: 'cs__key',
  locations: [DirectiveLocation.OBJECT],
  args: {
    fields: {
      type: GraphQLNonNull(GraphQLString),
    },
    graph: {
      type: GraphQLNonNull(GraphQLString),
    },
  },
  isRepeatable: true,
});

export const ResolveDirective = new GraphQLDirective({
  name: 'resolve',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    graph: {
      type: GraphQLNonNull(GraphQLString),
    },
  },
});

export const ProvidesDirective = new GraphQLDirective({
  name: 'provides',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    fields: {
      type: GraphQLNonNull(GraphQLString),
    },
  },
});

export const RequiresDirective = new GraphQLDirective({
  name: 'requires',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    fields: {
      type: GraphQLNonNull(GraphQLString),
    },
  },
});

export const UsingDirective = new GraphQLDirective({
  name: 'using',
  locations: [DirectiveLocation.SCHEMA],
  args: {
    spec: {
      type: GraphQLNonNull(GraphQLString),
    }
  },
});

export const csdlDirectives = [
  LinkDirective,
  KeyDirective,
  ResolveDirective,
  ProvidesDirective,
  RequiresDirective,
  UsingDirective,
];

export default csdlDirectives;
