import {
  InputType,
  NonNullType,
  Schema,
} from "../definitions";
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import {
  ArgumentSpecification,
  createDirectiveSpecification,
  createScalarTypeSpecification,
} from "../directiveAndTypeSpecification";
import { DirectiveLocation } from "graphql";
import { assert } from "../utils";
import { TAG_VERSIONS } from "./tagSpec";
import { federationMetadata } from "../federation";
import { registerKnownFeature } from "../knownCoreFeatures";
import { INACCESSIBLE_VERSIONS } from "./inaccessibleSpec";
import { AUTHENTICATED_VERSIONS } from "./authenticatedSpec";
import { REQUIRES_SCOPES_VERSIONS } from "./requiresScopesSpec";
import { POLICY_VERSIONS } from './policySpec';
import { SOURCE_VERSIONS } from './sourceSpec';
import { CONTEXT_VERSIONS } from './contextSpec';

export const federationIdentity = 'https://specs.apollo.dev/federation';

export enum FederationTypeName {
  FIELD_SET = 'FieldSet',
  CONTEXT_FIELD_VALUE = 'ContextFieldValue',
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
  INTERFACE_OBJECT = 'interfaceObject',
  AUTHENTICATED = 'authenticated',
  REQUIRES_SCOPES = 'requiresScopes',
  POLICY = 'policy',
  SOURCE_API = 'sourceAPI',
  SOURCE_TYPE = 'sourceType',
  SOURCE_FIELD = 'sourceField',
  CONTEXT = 'context',
  FROM_CONTEXT = 'fromContext',
}

const fieldSetTypeSpec = createScalarTypeSpecification({ name: FederationTypeName.FIELD_SET });

const fieldsArgument: ArgumentSpecification = { name: 'fields', type: (schema) => fieldSetType(schema) };

const keyDirectiveSpec = createDirectiveSpecification({
  name: FederationDirectiveName.KEY,
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
  repeatable: true,
  args: [
    fieldsArgument,
    { name: 'resolvable', type: (schema) => schema.booleanType(), defaultValue: true },
  ]
});

const extendsDirectiveSpec = createDirectiveSpecification({
  name: FederationDirectiveName.EXTENDS,
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
});

const externalDirectiveSpec = createDirectiveSpecification({
  name: FederationDirectiveName.EXTERNAL,
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
  args: [{ name: 'reason', type: (schema) => schema.stringType() }],
});

const requiresDirectiveSpec = createDirectiveSpecification({
  name: FederationDirectiveName.REQUIRES,
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: [fieldsArgument],
});

const providesDirectiveSpec = createDirectiveSpecification({
  name: FederationDirectiveName.PROVIDES,
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: [fieldsArgument],
});

const legacyFederationTypes = [
  fieldSetTypeSpec,
];

const legacyFederationDirectives = [
  keyDirectiveSpec,
  requiresDirectiveSpec,
  providesDirectiveSpec,
  externalDirectiveSpec,
  // This should really be v0.1 instead of v0.2, but we can't change this to
  // v0.1 without checking whether anyone relied on the v0.2 behavior.
  TAG_VERSIONS.find(new FeatureVersion(0, 2))!.tagDirectiveSpec,
  extendsDirectiveSpec,
];

export const FEDERATION1_TYPES = legacyFederationTypes;
export const FEDERATION1_DIRECTIVES = legacyFederationDirectives;


function fieldSetType(schema: Schema): InputType {
  const metadata = federationMetadata(schema);
  assert(metadata, `The schema is not a federation subgraph`);
  return new NonNullType(metadata.fieldSetType());
}

export class FederationSpecDefinition extends FeatureDefinition {
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
      repeatable: version.gte(new FeatureVersion(2, 2)),
    }));

    this.registerSubFeature(INACCESSIBLE_VERSIONS.getMinimumRequiredVersion(version));

    if (version >= (new FeatureVersion(2, 7))) {
      this.registerDirective(createDirectiveSpecification({
        name: FederationDirectiveName.OVERRIDE,
        locations: [DirectiveLocation.FIELD_DEFINITION],
        args: [
          { name: 'from', type: (schema) => new NonNullType(schema.stringType()) },
          { name: 'label', type: (schema) => schema.stringType() },
        ],
      }));
    } else {
      this.registerDirective(createDirectiveSpecification({
        name: FederationDirectiveName.OVERRIDE,
        locations: [DirectiveLocation.FIELD_DEFINITION],
        args: [{ name: 'from', type: (schema) => new NonNullType(schema.stringType()) }],
      }));
    }

    if (version.gte(new FeatureVersion(2, 1))) {
      this.registerDirective(createDirectiveSpecification({
        name: FederationDirectiveName.COMPOSE_DIRECTIVE,
        locations: [DirectiveLocation.SCHEMA],
        repeatable: true,
        args: [{ name: 'name', type: (schema) => schema.stringType() }],
      }));
    }

    if (version.gte(new FeatureVersion(2, 3))) {
      this.registerDirective(createDirectiveSpecification({
        name: FederationDirectiveName.INTERFACE_OBJECT,
        locations: [DirectiveLocation.OBJECT],
      }));
      this.registerSubFeature(TAG_VERSIONS.find(new FeatureVersion(0, 3))!);
    }

    if (version.gte(new FeatureVersion(2, 5))) {
      this.registerSubFeature(AUTHENTICATED_VERSIONS.find(new FeatureVersion(0, 1))!);
      this.registerSubFeature(REQUIRES_SCOPES_VERSIONS.find(new FeatureVersion(0, 1))!);
    }

    if (version.gte(new FeatureVersion(2, 6))) {
      this.registerSubFeature(POLICY_VERSIONS.find(new FeatureVersion(0, 1))!);
    }

    if (version.gte(new FeatureVersion(2, 7))) {
      this.registerSubFeature(SOURCE_VERSIONS.find(new FeatureVersion(0, 1))!);
    }
    
    if (version.gte(new FeatureVersion(2, 8))) {
      this.registerSubFeature(CONTEXT_VERSIONS.find(new FeatureVersion(0, 1))!);
    }
  }
}

export const FEDERATION_VERSIONS = new FeatureDefinitions<FederationSpecDefinition>(federationIdentity)
  .add(new FederationSpecDefinition(new FeatureVersion(2, 0)))
  .add(new FederationSpecDefinition(new FeatureVersion(2, 1)))
  .add(new FederationSpecDefinition(new FeatureVersion(2, 2)))
  .add(new FederationSpecDefinition(new FeatureVersion(2, 3)))
  .add(new FederationSpecDefinition(new FeatureVersion(2, 4)))
  .add(new FederationSpecDefinition(new FeatureVersion(2, 5)))
  .add(new FederationSpecDefinition(new FeatureVersion(2, 6)))
  .add(new FederationSpecDefinition(new FeatureVersion(2, 7)))
  .add(new FederationSpecDefinition(new FeatureVersion(2, 8)));

registerKnownFeature(FEDERATION_VERSIONS);
