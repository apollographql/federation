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
import { DirectiveLocation } from "graphql";
import { assert } from "./utils";
import { TAG_VERSIONS } from "./tagSpec";
import { federationMetadata } from "./federation";
import { registerKnownFeature } from "./knownCoreFeatures";
import { inaccessibleLocations } from "./inaccessibleSpec";

export const federationIdentity = 'https://specs.apollo.dev/federation';

export const fieldSetTypeSpec = createScalarTypeSpecification({ name: 'FieldSet' });

export const keyDirectiveSpec = createDirectiveSpecification({
  name:'key',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
  repeatable: true,
  argumentFct: (schema) => [
    fieldsArgument(schema),
    { name: 'resolvable', type: schema.booleanType(), defaultValue: true },
  ]
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
  argumentFct: (schema) => {
    return [fieldsArgument(schema)];
  }
});

export const providesDirectiveSpec = createDirectiveSpecification({
  name:'provides',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  argumentFct: (schema) => {
    return [fieldsArgument(schema)];
  }
});

export const shareableDirectiveSpec = createDirectiveSpecification({
  name: 'shareable',
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
});

export const tagDirectiveSpec = createDirectiveSpecification({
  name:'tag',
  locations: TAG_VERSIONS.latest().tagLocations,
  repeatable: true,
  argumentFct: (schema) => {
    return [{ name: 'name', type: new NonNullType(schema.stringType()) }];
  }
});

export const inaccessibleDirectiveSpec = createDirectiveSpecification({
  name:'inaccessible',
  locations: inaccessibleLocations,
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
];

// Note that this is only used for federation 2+ (federation 1 adds the same directive, but not through a core spec).
export const FEDERATION2_SPEC_DIRECTIVES = [
  keyDirectiveSpec,
  requiresDirectiveSpec,
  providesDirectiveSpec,
  externalDirectiveSpec,
  tagDirectiveSpec,
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

  addElementsToSchema(schema: Schema) {
    const feature = this.featureInSchema(schema);
    assert(feature, 'The federation specification should have been added to the schema before this is called');

    fieldSetTypeSpec.checkOrAdd(schema, feature.typeNameInSchema(fieldSetTypeSpec.name));

    for (const directive of FEDERATION2_SPEC_DIRECTIVES) {
      directive.checkOrAdd(schema, feature.directiveNameInSchema(directive.name));
    }
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
