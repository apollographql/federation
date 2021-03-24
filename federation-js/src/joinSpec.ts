import {
  GraphQLDirective,
  DirectiveLocation,
  GraphQLEnumType,
  GraphQLScalarType,
  GraphQLString,
  GraphQLNonNull,
} from 'graphql';
import { ServiceDefinition } from './composition';

const FieldSetScalar = new GraphQLScalarType({
  name: 'join__FieldSet',
});

const EndpointDirective = new GraphQLDirective({
  name: "join__endpoint",
  locations: [DirectiveLocation.ENUM_VALUE],
  args: {
    serviceName: {
      type: GraphQLString,
    },
    url: {
      type: GraphQLString,
    },
  }
});

function getJoinGraphEnum(serviceList: ServiceDefinition[]) {
  return new GraphQLEnumType({
    name: 'join__Graph',
    values: Object.fromEntries(
      serviceList.map((service) => [
        service.name.toUpperCase(),
        { value: service },
      ]),
    ),
  });
}

function getJoinFieldDirective(JoinGraphEnum: GraphQLEnumType) {
  return new GraphQLDirective({
    name: 'join__field',
    locations: [DirectiveLocation.FIELD_DEFINITION],
    args: {
      graph: {
        type: JoinGraphEnum,
      },
      requires: {
        type: FieldSetScalar,
      },
      provides: {
        type: FieldSetScalar,
      },
    },
  });
}

function getJoinOwnerDirective(JoinGraphEnum: GraphQLEnumType) {
  return new GraphQLDirective({
    name: 'join__owner',
    locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
    args: {
      graph: {
        type: new GraphQLNonNull(JoinGraphEnum),
      },
    },
  });
}

export function getJoins(serviceList: ServiceDefinition[]) {
  const JoinGraphEnum = getJoinGraphEnum(serviceList);
  const JoinFieldDirective = getJoinFieldDirective(JoinGraphEnum);
  const JoinOwnerDirective = getJoinOwnerDirective(JoinGraphEnum);

  const JoinTypeDirective = new GraphQLDirective({
    name: 'join__type',
    locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
    isRepeatable: true,
    args: {
      graph: {
        type: new GraphQLNonNull(JoinGraphEnum),
      },
      key: {
        type: FieldSetScalar,
      },
    },
  });

  return {
    FieldSetScalar,
    JoinTypeDirective,
    JoinFieldDirective,
    JoinOwnerDirective,
    JoinGraphEnum,
    EndpointDirective,
  }
}
