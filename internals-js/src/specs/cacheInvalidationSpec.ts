// This `cacheInvalidation` spec is a supergraph-only feature spec to indicate that some of the subgraphs
// use the `@cacheInvalidation` directive. The `@cacheInvalidation` directive itself is not used in supergraph
// schema, since `@cacheInvalidation` directive applications are composed using the `@join__directive`
// directive.
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from './coreSpec';

export const CACHE_INVALIDATION = 'cacheInvalidation';

export class CacheInvalidationSpecDefinition extends FeatureDefinition {
  public static readonly specName = CACHE_INVALIDATION;
  public static readonly identity = `https://specs.apollo.dev/${CacheInvalidationSpecDefinition.specName}`;

  constructor(
    version: FeatureVersion,
    minimumFederationVersion?: FeatureVersion,
  ) {
    super(
      new FeatureUrl(
        CacheInvalidationSpecDefinition.identity,
        CacheInvalidationSpecDefinition.specName,
        version,
      ),
      minimumFederationVersion,
    );
  }

  get defaultCorePurpose(): CorePurpose {
    return 'EXECUTION';
  }
}

export const CACHE_INVALIDATION_VERSIONS =
  new FeatureDefinitions<CacheInvalidationSpecDefinition>(
    CacheInvalidationSpecDefinition.identity,
  ).add(new CacheInvalidationSpecDefinition(new FeatureVersion(0, 1)));
