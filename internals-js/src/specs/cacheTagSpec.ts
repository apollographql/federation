// This `cacheTag` spec is a supergraph-only feature spec to indicate that some of the subgraphs
// use the `@cacheTag` directive. The `@cacheTag` directive itself is not used in supergraph
// schema, since `@cacheTag` directive applications are composed using the `@join__directive`
// directive.
import { DirectiveLocation } from "graphql";
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from "./coreSpec";
import { NonNullType } from "../definitions";
import { createDirectiveSpecification } from "../directiveAndTypeSpecification";

export const CACHE_TAG = 'cacheTag';

export class CacheTagSpecDefinition extends FeatureDefinition {
  public static readonly specName = CACHE_TAG;
  public static readonly identity = `https://specs.apollo.dev/${CacheTagSpecDefinition.specName}`;

  constructor(version: FeatureVersion, minimumFederationVersion: FeatureVersion) {
    super(
      new FeatureUrl(
        CacheTagSpecDefinition.identity,
        CacheTagSpecDefinition.specName,
        version
      ),
      minimumFederationVersion,
    );

    this.registerDirective(createDirectiveSpecification({
      name: CACHE_TAG,
      locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE, DirectiveLocation.FIELD_DEFINITION],
      repeatable: true,
      args: [{ name: 'format', type: (schema) => new NonNullType(schema.stringType()) }],
      composes: true,
      supergraphSpecification: (fedVersion) => CACHE_TAG_VERSIONS.getMinimumRequiredVersion(fedVersion),
      useJoinDirective: true,
    }));
  }

  get defaultCorePurpose(): CorePurpose {
    return 'EXECUTION';
  }
}

export const CACHE_TAG_VERSIONS =
  new FeatureDefinitions<CacheTagSpecDefinition>(
    CacheTagSpecDefinition.identity
  ).add(
    new CacheTagSpecDefinition(
      new FeatureVersion(0, 1),
      new FeatureVersion(2, 12),
    ),
  );
