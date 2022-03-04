import {
  InputType,
  NonNullType,
  Schema,
} from "./definitions";
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import {
  ArgumentSpecification,
  createDirectiveSpecification,
  createScalarTypeSpecification,
} from "./directiveAndTypeSpecification";
import { DirectiveLocation, GraphQLError } from "graphql";
import { assert } from "./utils";
import { TAG_VERSIONS } from "./tagSpec";
import { federationMetadata } from "./federation";
import { registerKnownFeature } from "./knownCoreFeatures";
import { inaccessibleDirectiveSpec } from "./inaccessibleSpec";

export const federationIdentity = 'https://specs.apollo.dev/federation';

export const fieldSetTypeSpec = createScalarTypeSpecification({ name: 'FieldSet' });

export const keyDirectiveSpec = createDirectiveSpecification({
  name:'key',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
  repeatable: true,
  argumentFct: (schema) => ({
    args: [
      fieldsArgument(schema),
      { name: 'resolvable', type: schema.booleanType(), defaultValue: true },
    ],
    errors: [],
  }),
});

export const extendsDirectiveSpec = createDirectiveSpecification({
  name:'extends',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
});

export const externalDirectiveSpec = createDirectiveSpecification({
  name:'external',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
});

export const requiresDirectiveSpec = createDirectiveSpecification({
  name:'requires',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  argumentFct: (schema) => ({
    args: [fieldsArgument(schema)],
    errors: [],
  }),
});

export const providesDirectiveSpec = createDirectiveSpecification({
  name:'provides',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  argumentFct: (schema) => ({
    args: [fieldsArgument(schema)],
    errors: [],
  }),
});

export const shareableDirectiveSpec = createDirectiveSpecification({
  name: 'shareable',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
});

export const overrideDirectiveSpec = createDirectiveSpecification({
  name: 'override',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  argumentFct: (schema) => ({
    args: [{ name: 'from', type: new NonNullType(schema.stringType()) }],
    errors: [],
  }),
});

function fieldsArgument(schema: Schema): ArgumentSpecification {
  return { name: 'fields', type: fieldSetType(schema) };
}

function fieldSetType(schema: Schema): InputType {
  const metadata = federationMetadata(schema);
  assert(metadata, `The schema is not a federation subgraph`);
  return new NonNullType(metadata.fieldSetType());
}

export const FEDERATION2_ONLY_SPEC_DIRECTIVES = [
  shareableDirectiveSpec,
  inaccessibleDirectiveSpec,
  overrideDirectiveSpec,
];

// Note that this is only used for federation 2+ (federation 1 adds the same directive, but not through a core spec).
export const FEDERATION2_SPEC_DIRECTIVES = [
  keyDirectiveSpec,
  requiresDirectiveSpec,
  providesDirectiveSpec,
  externalDirectiveSpec,
  TAG_VERSIONS.latest().tagDirectiveSpec,
  extendsDirectiveSpec, // TODO: should we stop supporting that?
  ...FEDERATION2_ONLY_SPEC_DIRECTIVES,
];

// Note that this is meant to contain _all_ federation directive names ever supported, regardless of which version.
// But currently, fed2 directives are a superset of fed1's so ... (but this may change if we stop supporting `@extends`
// in fed2).
export const ALL_FEDERATION_DIRECTIVES_DEFAULT_NAMES = FEDERATION2_SPEC_DIRECTIVES.map((spec) => spec.name);

export const FEDERATION_SPEC_TYPES = [
  fieldSetTypeSpec,
]

export class FederationSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion) {
    super(new FeatureUrl(federationIdentity, 'federation', version));
  }

  addElementsToSchema(schema: Schema): GraphQLError[] {
    const feature = this.featureInSchema(schema);
    assert(feature, 'The federation specification should have been added to the schema before this is called');

    let errors: GraphQLError[] = [];
    errors = errors.concat(this.addTypeSpec(schema, fieldSetTypeSpec));

    for (const directive of FEDERATION2_SPEC_DIRECTIVES) {
      errors = errors.concat(this.addDirectiveSpec(schema, directive));
    }
    return errors;
  }

  allElementNames(): string[] {
    return FEDERATION2_SPEC_DIRECTIVES.map((spec) => `@${spec.name}`).concat([
      fieldSetTypeSpec.name,
    ])
  }
}

export const FEDERATION_VERSIONS = new FeatureDefinitions<FederationSpecDefinition>(federationIdentity)
  .add(new FederationSpecDefinition(new FeatureVersion(2, 0)));

registerKnownFeature(FEDERATION_VERSIONS);
