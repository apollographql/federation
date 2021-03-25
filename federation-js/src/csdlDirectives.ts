import {
  GraphQLDirective,
  DirectiveLocation,
  GraphQLNonNull,
  GraphQLString,
  GraphQLInt,
} from 'graphql';

export const ComposedGraphDirective = new GraphQLDirective({
  name: 'composedGraph',
  locations: [DirectiveLocation.SCHEMA],
  args: {
    version: {
      type: new GraphQLNonNull(GraphQLInt),
    },
  },
});

export const GraphDirective = new GraphQLDirective({
  name: 'graph',
  locations: [DirectiveLocation.SCHEMA],
  args: {
    name: {
      type: new GraphQLNonNull(GraphQLString),
    },
    url: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  isRepeatable: true,
});

export const OwnerDirective = new GraphQLDirective({
  name: 'owner',
  locations: [DirectiveLocation.OBJECT],
  args: {
    graph: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const KeyDirective = new GraphQLDirective({
  name: 'key',
  locations: [DirectiveLocation.OBJECT],
  args: {
    fields: {
      type: new GraphQLNonNull(GraphQLString),
    },
    graph: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  isRepeatable: true,
});

export const ResolveDirective = new GraphQLDirective({
  name: 'resolve',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    graph: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const ProvidesDirective = new GraphQLDirective({
  name: 'provides',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    fields: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const RequiresDirective = new GraphQLDirective({
  name: 'requires',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    fields: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const csdlDirectives = [
  ComposedGraphDirective,
  GraphDirective,
  OwnerDirective,
  KeyDirective,
  ResolveDirective,
  ProvidesDirective,
  RequiresDirective,
];

export default csdlDirectives;
