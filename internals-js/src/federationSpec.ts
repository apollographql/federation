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
  DirectiveSpecification,
  TypeSpecification,
} from "./directiveAndTypeSpecification";
import { DirectiveLocation, GraphQLError } from "graphql";
import { assert, MapWithCachedArrays } from "./utils";
import { TAG_VERSIONS } from "./tagSpec";
import { federationMetadata } from "./federation";
import { registerKnownFeature } from "./knownCoreFeatures";
import { INACCESSIBLE_VERSIONS } from "./inaccessibleSpec";

export const federationIdentity = 'https://specs.apollo.dev/federation';

export enum FederationTypeName {
  FIELD_SET = 'FieldSet',
}

export enum FederationDirectiveName {
  KEY = 'key',
  EXTERNAL = 'external',
  REQUIRES = 'requires',
  PROVIDES = 'provides',
  EXTENDS = 'extends',
  SHAREABLE = 'shareable',
  OVERRIDE = 'override',
  TAG = 'tag',
  INACCESSIBLE = 'inaccessible',
  COMPOSE_DIRECTIVE = 'composeDirective',
}

const fieldSetTypeSpec = createScalarTypeSpecification({ name: FederationTypeName.FIELD_SET });

const keyDirectiveSpec = createDirectiveSpecification({
  name: FederationDirectiveName.KEY,
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

const extendsDirectiveSpec = createDirectiveSpecification({
  name: FederationDirectiveName.EXTENDS,
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
});

const externalDirectiveSpec = createDirectiveSpecification({
  name: FederationDirectiveName.EXTERNAL,
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
  argumentFct: (schema) => ({
    args: [{ name: 'reason', type: schema.stringType() }],
    errors: [],
  }),
});

const requiresDirectiveSpec = createDirectiveSpecification({
  name: FederationDirectiveName.REQUIRES,
  locations: [DirectiveLocation.FIELD_DEFINITION],
  argumentFct: (schema) => ({
    args: [fieldsArgument(schema)],
    errors: [],
  }),
});

const providesDirectiveSpec = createDirectiveSpecification({
  name: FederationDirectiveName.PROVIDES,
  locations: [DirectiveLocation.FIELD_DEFINITION],
  argumentFct: (schema) => ({
    args: [fieldsArgument(schema)],
    errors: [],
  }),
});

const legacyFederationTypes = [
  fieldSetTypeSpec,
];

const legacyFederationDirectives = [
  keyDirectiveSpec,
  requiresDirectiveSpec,
  providesDirectiveSpec,
  externalDirectiveSpec,
  TAG_VERSIONS.latest().tagDirectiveSpec,
  extendsDirectiveSpec,
];

export const FEDERATION1_TYPES = legacyFederationTypes;
export const FEDERATION1_DIRECTIVES = legacyFederationDirectives;

function fieldsArgument(schema: Schema): ArgumentSpecification {
  return { name: 'fields', type: fieldSetType(schema) };
}

function fieldSetType(schema: Schema): InputType {
  const metadata = federationMetadata(schema);
  assert(metadata, `The schema is not a federation subgraph`);
  return new NonNullType(metadata.fieldSetType());
}

export class FederationSpecDefinition extends FeatureDefinition {
  private readonly _directiveSpecs = new MapWithCachedArrays<string, DirectiveSpecification>();
  private readonly _typeSpecs = new MapWithCachedArrays<string, TypeSpecification>();

  constructor(version: FeatureVersion) {
    super(new FeatureUrl(federationIdentity, 'federation', version));

    for (const type of legacyFederationTypes) {
      this.registerType(type);
    }

    for (const directive of legacyFederationDirectives) {
      this.registerDirective(directive);
    }

    this.registerDirective(createDirectiveSpecification({
      name: FederationDirectiveName.SHAREABLE,
      locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
      repeatable: version >= (new FeatureVersion(2, 2)),
    }));

    this.registerDirective(INACCESSIBLE_VERSIONS.latest().inaccessibleDirectiveSpec);

    this.registerDirective(createDirectiveSpecification({
      name: FederationDirectiveName.OVERRIDE,
      locations: [DirectiveLocation.FIELD_DEFINITION],
      argumentFct: (schema) => ({
        args: [{ name: 'from', type: new NonNullType(schema.stringType()) }],
        errors: [],
      }),
    }));

    if (version >= (new FeatureVersion(2, 1))) {
      this.registerDirective(createDirectiveSpecification({
        name: FederationDirectiveName.COMPOSE_DIRECTIVE,
        locations: [DirectiveLocation.SCHEMA],
        repeatable: true,
        argumentFct: (schema) => ({
          args: [{ name: 'name', type: schema.stringType() }],
          errors: [],
        }),
      }));
    }
  }

  private registerDirective(spec: DirectiveSpecification) {
    this._directiveSpecs.set(spec.name, spec);
  }

  private registerType(spec: TypeSpecification) {
    this._typeSpecs.set(spec.name, spec);
  }

  directiveSpecs(): readonly DirectiveSpecification[] {
    return this._directiveSpecs.values();
  }

  typeSpecs(): readonly TypeSpecification[] {
    return this._typeSpecs.values();
  }

  addElementsToSchema(schema: Schema): GraphQLError[] {
    const feature = this.featureInSchema(schema);
    assert(feature, 'The federation specification should have been added to the schema before this is called');

    let errors: GraphQLError[] = [];
    for (const type of this.typeSpecs()) {
      errors = errors.concat(this.addTypeSpec(schema, type));
    }

    for (const directive of this.directiveSpecs()) {
      errors = errors.concat(this.addDirectiveSpec(schema, directive));
    }
    return errors;
  }

  allElementNames(): string[] {
    return this.directiveSpecs().map((spec) => `@${spec.name}`)
      .concat(this.typeSpecs().map((spec) => spec.name));
  }
}

export const FEDERATION_VERSIONS = new FeatureDefinitions<FederationSpecDefinition>(federationIdentity)
  .add(new FederationSpecDefinition(new FeatureVersion(2, 0)))
  .add(new FederationSpecDefinition(new FeatureVersion(2, 1)))
  .add(new FederationSpecDefinition(new FeatureVersion(2, 2)))
  .add(new FederationSpecDefinition(new FeatureVersion(2, 3)));

registerKnownFeature(FEDERATION_VERSIONS);
