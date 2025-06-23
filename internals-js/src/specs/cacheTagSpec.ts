import { DirectiveLocation, GraphQLError } from 'graphql';
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from './coreSpec';
import { Schema } from '../definitions';
import { registerKnownFeature } from '../knownCoreFeatures';
import { createDirectiveSpecification } from '../directiveAndTypeSpecification';

export const cacheTagIdentity = 'https://specs.apollo.dev/cacheTag';

const CACHE_KEY = 'cacheTag';
const FORMAT = 'format';

export class CacheTagSpecDefinition extends FeatureDefinition {
  constructor(
    version: FeatureVersion,
    readonly minimumFederationVersion: FeatureVersion,
  ) {
    super(
      new FeatureUrl(cacheTagIdentity, CACHE_KEY, version),
      minimumFederationVersion,
    );

    this.registerDirective(
      createDirectiveSpecification({
        name: CACHE_KEY,
        locations: [
          DirectiveLocation.FIELD_DEFINITION,
          DirectiveLocation.OBJECT,
        ],
        repeatable: true,
        // We "compose" these directives using the  `@join__directive` mechanism,
        // so they do not need to be composed in the way passing `composes: true`
        // here implies.
        composes: false,
      }),
    );
  }

  addElementsToSchema(schema: Schema): GraphQLError[] {
    /*
      directive @cacheTag(
        format: String
      ) repeatable on FIELD_DEFINITION
        | OBJECT
    */
    const cacheTag = this.addDirective(schema, CACHE_KEY).addLocations(
      DirectiveLocation.FIELD_DEFINITION,
      DirectiveLocation.OBJECT,
    );
    cacheTag.repeatable = true;

    cacheTag.addArgument(FORMAT, schema.stringType());

    return [];
  }

  get defaultCorePurpose(): CorePurpose {
    return 'EXECUTION';
  }
}

export const CACHE_KEY_VERSIONS =
  new FeatureDefinitions<CacheTagSpecDefinition>(cacheTagIdentity).add(
    new CacheTagSpecDefinition(
      new FeatureVersion(0, 1),
      new FeatureVersion(2, 12),
    ),
  );

registerKnownFeature(CACHE_KEY_VERSIONS);
