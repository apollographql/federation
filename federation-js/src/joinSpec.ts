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
 * 1. Non-Alphanumeric characters are replaced with _ (alphaNumericUnderscoreOnly)
 * 2. Numeric first characters are prefixed with _ (noNumericFirstChar)
 * 3. Names ending in an underscore followed by numbers `_\d+` are suffixed with _ (noUnderscoreNumericEnding)
 * 4. Names are uppercased (toUpper)
 * 5. After transformations 1-4, duplicates are suffixed with _{n} where {n} is number of times we've seen the dupe
 *
 * Note: Collisions with name's we've generated are also accounted for
 */
function getJoinGraphEnum(serviceList: ServiceDefinition[]) {
  // Track whether we've seen a name and how many times
  const nameMap: Map<string, number> = new Map();
  // Build a map of original service name to generated name
  const graphNameToEnumValueName: Record<string, string> = Object.create(null);

  function uniquifyAndSanitizeGraphQLName(name: string) {
    // Transforms to ensure valid graphql `Name`
    const alphaNumericUnderscoreOnly = name.replace(/[^_a-zA-Z0-9]/g, '_');
    const noNumericFirstChar = alphaNumericUnderscoreOnly.match(/^[0-9]/)
      ? '_' + alphaNumericUnderscoreOnly
      : alphaNumericUnderscoreOnly;
    const noUnderscoreNumericEnding = noNumericFirstChar.match(/_[0-9]+$/)
      ? noNumericFirstChar + '_'
      : noNumericFirstChar;

    // toUpper not really necessary but follows convention of enum values
    const toUpper = noUnderscoreNumericEnding.toLocaleUpperCase();

    // Uniquifying post-transform
    const nameCount = nameMap.get(toUpper);
    if (nameCount) {
      // Collision - bump counter by one
      nameMap.set(toUpper, nameCount + 1);
      const uniquified = `${toUpper}_${nameCount + 1}`;
      // We also now need another entry for the name we just generated
      nameMap.set(uniquified, 1);
      graphNameToEnumValueName[name] = uniquified;
      return uniquified;
    } else {
      nameMap.set(toUpper, 1);
      graphNameToEnumValueName[name] = toUpper;
      return toUpper;
    }
  }

  return {
    graphNameToEnumValueName,
    JoinGraphEnum: new GraphQLEnumType({
      name: 'join__Graph',
      values: Object.fromEntries(
        serviceList.map((service) => [
          uniquifyAndSanitizeGraphQLName(service.name),
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
