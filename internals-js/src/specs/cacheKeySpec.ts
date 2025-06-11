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

export const cacheKeyIdentity = 'https://specs.apollo.dev/cacheKey';

const CACHE_KEY = 'cacheKey';
const FORMAT = 'format';
const CASCADE = 'cascade';

export class CacheKeySpecDefinition extends FeatureDefinition {
  constructor(
    version: FeatureVersion,
    readonly minimumFederationVersion: FeatureVersion,
  ) {
    super(
      new FeatureUrl(cacheKeyIdentity, CACHE_KEY, version),
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
      directive @cacheKey(
        format: String
        cascade: Boolean = false
      ) repeatable on FIELD_DEFINITION
        | OBJECT
    */
    const cacheKey = this.addDirective(schema, CACHE_KEY).addLocations(
      DirectiveLocation.FIELD_DEFINITION,
      DirectiveLocation.OBJECT,
    );
    cacheKey.repeatable = true;

    cacheKey.addArgument(FORMAT, schema.stringType());
    cacheKey.addArgument(CASCADE, schema.booleanType(), false);

    return [];
  }

  get defaultCorePurpose(): CorePurpose {
    return 'EXECUTION';
  }
}

export const CACHE_KEY_VERSIONS =
  new FeatureDefinitions<CacheKeySpecDefinition>(cacheKeyIdentity).add(
    new CacheKeySpecDefinition(
      new FeatureVersion(0, 1),
      new FeatureVersion(2, 12),
    ),
  );

registerKnownFeature(CACHE_KEY_VERSIONS);
