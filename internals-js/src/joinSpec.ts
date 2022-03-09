import { DirectiveLocation } from 'graphql';
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import {
  DirectiveDefinition,
  EnumType,
  ScalarType,
  Schema,
  NonNullType,
} from "./definitions";
import { Subgraph, Subgraphs } from "./federation";
import { MultiMap } from "./utils";

export const joinIdentity = 'https://specs.apollo.dev/join';

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

export class JoinSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion) {
    super(new FeatureUrl(joinIdentity, 'join', version));
  }

  private isV01() {
    return this.version.equals(new FeatureVersion(0, 1));
  }

  addElementsToSchema(schema: Schema) {
    const joinGraph = this.addDirective(schema, 'graph').addLocations(DirectiveLocation.ENUM_VALUE);
    joinGraph.addArgument('name', new NonNullType(schema.stringType()));
    joinGraph.addArgument('url', new NonNullType(schema.stringType()));

    const graphEnum = this.addEnumType(schema, 'Graph');

    const joinFieldSet = this.addScalarType(schema, 'FieldSet');

    const joinType = this.addDirective(schema, 'type').addLocations(
      DirectiveLocation.OBJECT,
      DirectiveLocation.INTERFACE,
      DirectiveLocation.UNION,
      DirectiveLocation.ENUM,
      DirectiveLocation.INPUT_OBJECT,
      DirectiveLocation.SCALAR,
    );
    if (!this.isV01()) {
      joinType.repeatable = true;
    }
    joinType.addArgument('graph', new NonNullType(graphEnum));
    joinType.addArgument('key', joinFieldSet);
    if (!this.isV01()) {
      joinType.addArgument('extension', new NonNullType(schema.booleanType()), false);
      joinType.addArgument('resolvable', new NonNullType(schema.booleanType()), true);
    }

    const joinField = this.addDirective(schema, 'field').addLocations(DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.INPUT_FIELD_DEFINITION);
    joinField.repeatable = true;
    joinField.addArgument('graph', new NonNullType(graphEnum));
    joinField.addArgument('requires', joinFieldSet);
    joinField.addArgument('provides', joinFieldSet);
    if (!this.isV01()) {
      joinField.addArgument('type', schema.stringType());
      joinField.addArgument('external', schema.booleanType());
    }

    if (!this.isV01()) {
      const joinImplements = this.addDirective(schema, 'implements').addLocations(
        DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE,
      );
      joinImplements.repeatable = true;
      joinImplements.addArgument('graph', new NonNullType(graphEnum));
      joinImplements.addArgument('interface', new NonNullType(schema.stringType()));
    }

    if (this.isV01()) {
      const joinOwner = this.addDirective(schema, 'owner').addLocations(DirectiveLocation.OBJECT);
      joinOwner.addArgument('graph', new NonNullType(graphEnum));
    }
  }

  populateGraphEnum(schema: Schema, subgraphs: Subgraphs): Map<string, string> {
    // Duplicate enum values can occur due to sanitization and must be accounted for
    // collect the duplicates in an array so we can uniquify them in a second pass.
    const sanitizedNameToSubgraphs = new MultiMap<string, Subgraph>();
    for (const subgraph of subgraphs) {
      const sanitized = sanitizeGraphQLName(subgraph.name);
      sanitizedNameToSubgraphs.add(sanitized, subgraph);
    }

    // if no duplicates for a given name, add it as is
    // if duplicates exist, append _{n} to each duplicate in the array
    const subgraphToEnumName = new Map<string, string>();
    for (const [sanitizedName, subgraphsForName] of sanitizedNameToSubgraphs) {
      if (subgraphsForName.length === 1) {
        subgraphToEnumName.set(subgraphsForName[0].name, sanitizedName);
      } else {
        for (const [index, subgraph] of subgraphsForName.entries()) {
          subgraphToEnumName.set(subgraph.name, `${sanitizedName}_${index + 1}`);
        }
      }
    }

    const graphEnum = this.graphEnum(schema);
    const graphDirective = this.graphDirective(schema);
    for (const subgraph of subgraphs) {
      const enumValue = graphEnum.addValue(subgraphToEnumName.get(subgraph.name)!);
      enumValue.applyDirective(graphDirective, { name: subgraph.name, url: subgraph.url });
    }
    return subgraphToEnumName;
  }

  fieldSetScalar(schema: Schema): ScalarType {
    return this.type(schema, 'FieldSet')!;
  }

  graphEnum(schema: Schema): EnumType {
    return this.type(schema, 'Graph')!;
  }

  graphDirective(schema: Schema): DirectiveDefinition<{name: string, url: string}> {
    return this.directive(schema, 'graph')!;
  }

  typeDirective(schema: Schema): DirectiveDefinition<{graph: string, key?: string, extension?: boolean, resolvable?: boolean}> {
    return this.directive(schema, 'type')!;
  }

  implementsDirective(schema: Schema): DirectiveDefinition<{graph: string, interface: string}> | undefined {
    return this.directive(schema, 'implements');
  }

  fieldDirective(schema: Schema): DirectiveDefinition<{graph: string, requires?: string, provides?: string, type?: string, external?: boolean}> {
    return this.directive(schema, 'field')!;
  }

  ownerDirective(schema: Schema): DirectiveDefinition<{graph: string}> | undefined {
    return this.directive(schema, 'owner');
  }
}

// Note: This declare a no-yet-agreed-upon join spec v0.2, that:
//   1. allows a repeatable join__field (join-spec#15).
//   2. allows the 'key' argument of join__type to be optional (join-spec#13)
//   3. relax conditions on join__type in general so as to not relate to the notion of owner (join-spec#16).
//   4. has join__implements (join-spec#13)
// The changes from join-spec#17 and join-spec#18 are not yet implemented, but probably should be or we may have bugs
// due to the query planner having an invalid understanding of the subgraph services API.
export const JOIN_VERSIONS = new FeatureDefinitions<JoinSpecDefinition>(joinIdentity)
  .add(new JoinSpecDefinition(new FeatureVersion(0, 1)))
  .add(new JoinSpecDefinition(new FeatureVersion(0, 2)));
