import {
  GraphQLDirective,
  DirectiveLocation,
  GraphQLEnumType,
  GraphQLScalarType,
  GraphQLString,
  GraphQLNonNull,
} from 'graphql';
import { ServiceDefinition } from './composition';
import { mapGetOrSet } from './utilities/mapGetOrSet';

const FieldSetScalar = new GraphQLScalarType({
  name: 'join__FieldSet',
});

const JoinGraphDirective = new GraphQLDirective({
  name: "join__graph",
  locations: [DirectiveLocation.ENUM_VALUE],
  args: {
    name: {
      type: new GraphQLNonNull(GraphQLString),
    },
    url: {
      type: new GraphQLNonNull(GraphQLString),
    },
  }
});

/**
 * Expectations
 * 1. The input is first sorted using `String.localeCompare`, so the output is deterministic
 * 2. Non-Alphanumeric characters are replaced with _ (alphaNumericUnderscoreOnly)
 * 3. Numeric first characters are prefixed with _ (noNumericFirstChar)
 * 4. Names ending in an underscore followed by numbers `_\d+` are suffixed with _ (noUnderscoreNumericEnding)
 * 5. Names are uppercased (toUpper)
 * 6. After transformations 1-5, duplicates are suffixed with _{n} where {n} is number of times we've seen the dupe
 *
 * Note: Collisions with name's we've generated are also accounted for
 */
function getJoinGraphEnum(serviceList: ServiceDefinition[]) {
  const sortedServiceList = serviceList
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  function sanitizeGraphQLName(name: string) {
    // replace all non-word characters (\W). Word chars are _a-zA-Z0-9
    const alphaNumericUnderscoreOnly = name.replace(/[\W]/g, '_');
    // prefix a digit in the first position with an _
    const noNumericFirstChar = alphaNumericUnderscoreOnly.match(/^\d/)
      ? '_' + alphaNumericUnderscoreOnly
      : alphaNumericUnderscoreOnly;
    // suffix an underscore + digit in the last position with an _
    const noUnderscoreNumericEnding = noNumericFirstChar.match(/_\d+$/)
      ? noNumericFirstChar + '_'
      : noNumericFirstChar;

    // toUpper not really necessary but follows convention of enum values
    const toUpper = noUnderscoreNumericEnding.toLocaleUpperCase();
    return toUpper;
  }

  // duplicate enum values can occur due to sanitization and must be accounted for
  // collect the duplicates in an array so we can uniquify them in a second pass.
  const sanitizedNameToServiceDefinitions: Map<
    string,
    ServiceDefinition[]
  > = new Map();
  for (const service of sortedServiceList) {
    const { name } = service;
    const sanitized = sanitizeGraphQLName(name);
    mapGetOrSet(sanitizedNameToServiceDefinitions, sanitized, []).push(service);
  }

  // if no duplicates for a given name, add it as is
  // if duplicates exist, append _{n} (index-1) to each duplicate in the array
  const enumValueNameToServiceDefinition: Record<
    string,
    ServiceDefinition
  > = Object.create(null);
  for (const [sanitizedName, services] of sanitizedNameToServiceDefinitions) {
    if (services.length === 1) {
      enumValueNameToServiceDefinition[sanitizedName] = services[0];
    } else {
      for (const [index, service] of services.entries()) {
        enumValueNameToServiceDefinition[
          `${sanitizedName}_${index + 1}`
        ] = service;
      }
    }
  }

  const entries = Object.entries(enumValueNameToServiceDefinition);
  return {
    graphNameToEnumValueName: Object.fromEntries(
      entries.map(([enumValueName, service]) => [service.name, enumValueName]),
    ),
    JoinGraphEnum: new GraphQLEnumType({
      name: 'join__Graph',
      values: Object.fromEntries(
        entries.map(([enumValueName, service]) => [
          enumValueName,
          { value: service },
        ]),
      ),
    }),
  };
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

export function getJoinDefinitions(serviceList: ServiceDefinition[]) {
  const { graphNameToEnumValueName, JoinGraphEnum } = getJoinGraphEnum(serviceList);
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
    graphNameToEnumValueName,
    FieldSetScalar,
    JoinTypeDirective,
    JoinFieldDirective,
    JoinOwnerDirective,
    JoinGraphEnum,
    JoinGraphDirective,
  };
}
