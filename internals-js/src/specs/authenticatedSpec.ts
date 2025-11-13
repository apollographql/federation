import { DirectiveLocation } from "graphql";
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from "./coreSpec";
import { createDirectiveSpecification } from "../directiveAndTypeSpecification";
import { registerKnownFeature } from "../knownCoreFeatures";
import {DirectiveDefinition, Schema} from "../definitions";

export class AuthenticatedSpecDefinition extends FeatureDefinition {
  public static readonly directiveName = "authenticated";
  public static readonly identity = `https://specs.apollo.dev/${AuthenticatedSpecDefinition.directiveName}`;

  constructor(version: FeatureVersion, minimumFederationVersion: FeatureVersion) {
    super(
      new FeatureUrl(
        AuthenticatedSpecDefinition.identity,
        AuthenticatedSpecDefinition.directiveName,
        version
      ),
      minimumFederationVersion,
    );

    // WARNING: we cannot declare staticArgumentTransform() as access control merge logic needs to propagate
    // requirements upwards/downwards between types and interfaces. We hijack the merge process by providing
    // implementations/interfaces as "additional sources". This means that we cannot apply staticArgumentTransform()
    // as subgraph index index will be wrong/undefined.
    this.registerDirective(createDirectiveSpecification({
      name: AuthenticatedSpecDefinition.directiveName,
      locations: [
        DirectiveLocation.FIELD_DEFINITION,
        DirectiveLocation.OBJECT,
        DirectiveLocation.INTERFACE,
        DirectiveLocation.SCALAR,
        DirectiveLocation.ENUM,
      ],
      composes: true,
      supergraphSpecification: () => AUTHENTICATED_VERSIONS.latest(),
    }));
  }

  authenticatedDirective(schema: Schema): DirectiveDefinition | undefined {
    return this.directive(schema, AuthenticatedSpecDefinition.directiveName);
  }

  get defaultCorePurpose(): CorePurpose {
    return 'SECURITY';
  }
}

export const AUTHENTICATED_VERSIONS =
  new FeatureDefinitions<AuthenticatedSpecDefinition>(
    AuthenticatedSpecDefinition.identity
  ).add(
    new AuthenticatedSpecDefinition(
      new FeatureVersion(0, 1),
      new FeatureVersion(2, 5),
    ),
  );

registerKnownFeature(AUTHENTICATED_VERSIONS);
