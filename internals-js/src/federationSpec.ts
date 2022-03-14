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
import { tagLocations } from "./tagSpec";
import { federationMetadata } from "./federation";

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
  locations: tagLocations,
  repeatable: true,
  argumentFct: (schema) => {
    return [{ name: 'name', type: new NonNullType(schema.stringType()) }];
  }
});

function fieldsArgument(schema: Schema): ArgumentSpecification {
  return { name: 'fields', type: fieldSetType(schema) };
}

function fieldSetType(schema: Schema): InputType {
  const metadata = federationMetadata(schema);
  assert(metadata, `The schema is not a federation subgraph`);
  return new NonNullType(metadata.fieldSetType());
}

// Note that this is only used for federation 2+ (federation 1 adds the same directive, but not through a core spec).
export const FEDERATION2_SPEC_DIRECTIVES = [
  keyDirectiveSpec,
  requiresDirectiveSpec,
  providesDirectiveSpec,
  externalDirectiveSpec,
  shareableDirectiveSpec,
  tagDirectiveSpec,
  extendsDirectiveSpec, // TODO: should we stop supporting that?
];

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
}

export const FEDERATION_VERSIONS = new FeatureDefinitions<FederationSpecDefinition>(federationIdentity)
  .add(new FederationSpecDefinition(new FeatureVersion(2, 0)));
