import { DirectiveLocation, GraphQLError } from 'graphql';
import { CorePurpose, FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import {
  DirectiveDefinition,
  EnumType,
  ScalarType,
  Schema,
  NonNullType,
  ListType,
  InputObjectType,
} from "../definitions";
import { Subgraph, Subgraphs } from "../federation";
import { registerKnownFeature } from '../knownCoreFeatures';
import { MultiMap } from "../utils";

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

export type JoinTypeDirectiveArguments = {
  graph: string,
  key?: string,
  extension?: boolean,
  resolvable?: boolean,
  isInterfaceObject?: boolean,
};

export type JoinFieldDirectiveArguments = {
  graph?: string,
  requires?: string,
  provides?: string,
  override?: string,
  type?: string,
  external?: boolean,
  usedOverridden?: boolean,
  overrideLabel?: string,
  contextArguments?: {
    name: string,
    type: string,
    context: string,
    selection: string,
  }[],
}

export type JoinDirectiveArguments = {
  graphs: string[],
  name: string,
  args?: Record<string, any>,
};

export class JoinSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion, minimumFederationVersion?: FeatureVersion) {
    super(new FeatureUrl(joinIdentity, 'join', version), minimumFederationVersion);
  }

  private isV01() {
    return this.version.equals(new FeatureVersion(0, 1));
  }

  addElementsToSchema(schema: Schema): GraphQLError[] {
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

      if (this.version.gte(new FeatureVersion(0, 3))) {
        joinType.addArgument('isInterfaceObject', new NonNullType(schema.booleanType()), false);
      }
    }

    const joinField = this.addDirective(schema, 'field').addLocations(DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.INPUT_FIELD_DEFINITION);
    joinField.repeatable = true;
    // The `graph` argument used to be non-nullable, but @interfaceObject makes us add some field in
    // the supergraph that don't "directly" come from any subgraph (they indirectly are inherited from
    // an `@interfaceObject` type), and to indicate that, we use a `@join__field(graph: null)` annotation.
    const graphArgType = this.version.gte(new FeatureVersion(0, 3))
      ? graphEnum
      : new NonNullType(graphEnum);
    joinField.addArgument('graph', graphArgType);
    joinField.addArgument('requires', joinFieldSet);
    joinField.addArgument('provides', joinFieldSet);
    if (!this.isV01()) {
      joinField.addArgument('type', schema.stringType());
      joinField.addArgument('external', schema.booleanType());
      joinField.addArgument('override', schema.stringType());
      joinField.addArgument('usedOverridden', schema.booleanType());
    }

    if (!this.isV01()) {
      const joinImplements = this.addDirective(schema, 'implements').addLocations(
        DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE,
      );
      joinImplements.repeatable = true;
      joinImplements.addArgument('graph', new NonNullType(graphEnum));
      joinImplements.addArgument('interface', new NonNullType(schema.stringType()));
    }

    if (this.version.gte(new FeatureVersion(0, 3))) {
      const joinUnionMember = this.addDirective(schema, 'unionMember').addLocations(DirectiveLocation.UNION);
      joinUnionMember.repeatable = true;
      joinUnionMember.addArgument('graph', new NonNullType(graphEnum));
      joinUnionMember.addArgument('member', new NonNullType(schema.stringType()));

      const joinEnumValue = this.addDirective(schema, 'enumValue').addLocations(DirectiveLocation.ENUM_VALUE);
      joinEnumValue.repeatable = true;
      joinEnumValue.addArgument('graph', new NonNullType(graphEnum));
    }

    if (this.version.gte(new FeatureVersion(0, 4))) {
      const joinDirective = this.addDirective(schema, 'directive').addLocations(
        DirectiveLocation.SCHEMA,
        DirectiveLocation.OBJECT,
        DirectiveLocation.INTERFACE,
        DirectiveLocation.FIELD_DEFINITION,
      );
      joinDirective.repeatable = true;
      // Note this 'graphs' argument is plural, since the same directive
      // application can appear on the same schema element in multiple subgraphs.
      // Repetition of a graph in this 'graphs' list is allowed, and corresponds
      // to repeated application of the same directive in the same subgraph, which
      // is allowed.
      joinDirective.addArgument('graphs', new ListType(new NonNullType(graphEnum)));
      joinDirective.addArgument('name', new NonNullType(schema.stringType()));
      joinDirective.addArgument('args', this.addScalarType(schema, 'DirectiveArguments'));

      // progressive override
      joinField.addArgument('overrideLabel', schema.stringType());
    }
    
    if (this.version.gte(new FeatureVersion(0, 5))) {
      const fieldValue = this.addScalarType(schema, 'FieldValue');

      // set context
      // there are no renames that happen within the join spec, so this is fine
      // note that join spec will only used in supergraph schema
      const contextArgumentsType = schema.addType(new InputObjectType('join__ContextArgument'));
      contextArgumentsType.addField('name', new NonNullType(schema.stringType()));
      contextArgumentsType.addField('type', new NonNullType(schema.stringType()));
      contextArgumentsType.addField('context', new NonNullType(schema.stringType()));
      contextArgumentsType.addField('selection', new NonNullType(fieldValue));

      joinField.addArgument('contextArguments', new ListType(new NonNullType(contextArgumentsType)));
    }

    if (this.isV01()) {
      const joinOwner = this.addDirective(schema, 'owner').addLocations(DirectiveLocation.OBJECT);
      joinOwner.addArgument('graph', new NonNullType(graphEnum));
    }
    return [];
  }

  allElementNames(): string[] {
    const names = [
      'graph',
      'Graph',
      'FieldSet',
      '@type',
      '@field',
    ];
    if (this.isV01()) {
      names.push('@owner');
    } else {
      names.push('@implements');
    }
    return names;
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

  directiveDirective(schema: Schema): DirectiveDefinition<JoinDirectiveArguments> {
    return this.directive(schema, 'directive')!;
  }

  typeDirective(schema: Schema): DirectiveDefinition<JoinTypeDirectiveArguments> {
    return this.directive(schema, 'type')!;
  }

  implementsDirective(schema: Schema): DirectiveDefinition<{graph: string, interface: string}> | undefined {
    return this.directive(schema, 'implements');
  }

  fieldDirective(schema: Schema): DirectiveDefinition<JoinFieldDirectiveArguments> {
    return this.directive(schema, 'field')!;
  }

  unionMemberDirective(schema: Schema): DirectiveDefinition<{graph: string, member: string}> | undefined {
    return this.directive(schema, 'unionMember');
  }

  enumValueDirective(schema: Schema): DirectiveDefinition<{graph: string}> | undefined {
    return this.directive(schema, 'enumValue');
  }

  ownerDirective(schema: Schema): DirectiveDefinition<{graph: string}> | undefined {
    return this.directive(schema, 'owner');
  }

  get defaultCorePurpose(): CorePurpose | undefined {
    return 'EXECUTION';
  }
}

// The versions are as follows:
//  - 0.1: this is the version used by federation 1 composition. Federation 2 is still able to read supergraphs
//    using that verison for backward compatibility, but never writes this spec version is not expressive enough
//    for federation 2 in general.
//  - 0.2: this is the original version released with federation 2.
//  - 0.3: adds the `isInterfaceObject` argument to `@join__type`, and make the `graph` in `@join__field` skippable.
//  - 0.4: adds the optional `overrideLabel` argument to `@join_field` for progressive override.
//  - 0.5: adds the `contextArguments` argument to `@join_field` for setting context.
export const JOIN_VERSIONS = new FeatureDefinitions<JoinSpecDefinition>(joinIdentity)
  .add(new JoinSpecDefinition(new FeatureVersion(0, 1)))
  .add(new JoinSpecDefinition(new FeatureVersion(0, 2)))
  .add(new JoinSpecDefinition(new FeatureVersion(0, 3), new FeatureVersion(2, 0)))
  .add(new JoinSpecDefinition(new FeatureVersion(0, 4), new FeatureVersion(2, 7)))
  .add(new JoinSpecDefinition(new FeatureVersion(0, 5), new FeatureVersion(2, 8)));

registerKnownFeature(JOIN_VERSIONS);
