import {
  GraphQLDirective,
  DirectiveLocation,
  GraphQLNonNull,
  GraphQLString,
} from 'graphql';

export const GraphDirective = new GraphQLDirective({
  name: 'graph',
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

export const OwnerDirective = new GraphQLDirective({
  name: 'owner',
  locations: [DirectiveLocation.OBJECT],
  args: {
    graph: {
      type: GraphQLNonNull(GraphQLString),
    },
  },
});

export const KeyDirective = new GraphQLDirective({
  name: 'key',
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
  GraphDirective,
  OwnerDirective,
  KeyDirective,
  ResolveDirective,
  ProvidesDirective,
  RequiresDirective,
  UsingDirective,
];

export default csdlDirectives;
