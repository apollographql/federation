import { ASTNode, DocumentNode, GraphQLError } from "graphql";
import { err } from '@apollo/core-schema';
import { ErrCoreCheckFailed, FeatureUrl, FeatureVersion } from "./coreSpec";
import { CoreFeature, CoreFeatures, Schema } from "./definitions";
import { joinIdentity, JoinSpecDefinition, JOIN_VERSIONS } from "./joinSpec";
import { buildSchema, buildSchemaFromAST } from "./buildSchema";
import { extractSubgraphsNamesAndUrlsFromSupergraph } from "./extractSubgraphsFromSupergraph";

const SUPPORTED_FEATURES = new Set([
  'https://specs.apollo.dev/core/v0.1',
  'https://specs.apollo.dev/core/v0.2',
  'https://specs.apollo.dev/join/v0.1',
  'https://specs.apollo.dev/join/v0.2',
  'https://specs.apollo.dev/tag/v0.1',
  'https://specs.apollo.dev/tag/v0.2',
  'https://specs.apollo.dev/inaccessible/v0.1',
]);

export function ErrUnsupportedFeature(feature: CoreFeature): Error {
  return err('UnsupportedFeature', {
    message: `feature ${feature.url} is for: ${feature.purpose} but is unsupported`,
    feature,
    nodes: feature.directive.sourceAST,
  });
}

export function ErrForUnsupported(core: CoreFeature, ...features: readonly CoreFeature[]): Error {
  return err('ForUnsupported', {
    message:
      `the \`for:\` argument is unsupported by version ${core.url.version} ` +
      `of the core spec. Please upgrade to at least @core v0.2 (https://specs.apollo.dev/core/v0.2).`,
    features,
    nodes: [core.directive.sourceAST, ...features.map(f => f.directive.sourceAST)].filter(n => !!n) as ASTNode[]
  });
}

const coreVersionZeroDotOneUrl = FeatureUrl.parse('https://specs.apollo.dev/core/v0.1');

export function buildSupergraphSchema(supergraphSdl: string | DocumentNode): [Schema, {name: string, url: string}[]] {
  // We delay validation because `checkFeatureSupport` gives slightly more useful errors if, say, 'for' is used with core v0.1.
  const schema = typeof supergraphSdl === 'string'
    ? buildSchema(supergraphSdl, { validate: false })
    : buildSchemaFromAST(supergraphSdl, { validate: false });

  const [coreFeatures] = validateSupergraph(schema);
  checkFeatureSupport(coreFeatures);
  schema.validate();
  return [schema, extractSubgraphsNamesAndUrlsFromSupergraph(schema)];
}

/**
 * Checks that only our hard-coded list of features are part of the provided schema, and that if
 * the schema uses core v0.1, then it doesn't use the 'for' (purpose) argument.
 * Throws if that is not true.
 */
function checkFeatureSupport(coreFeatures: CoreFeatures) {
  const errors = [];
  if (coreFeatures.coreItself.url.equals(coreVersionZeroDotOneUrl)) {
    const purposefulFeatures = [...coreFeatures.allFeatures()].filter(f => f.purpose)
    if (purposefulFeatures.length > 0) {
      errors.push(ErrForUnsupported(coreFeatures.coreItself, ...purposefulFeatures));
    }
  }

  for (const feature of coreFeatures.allFeatures()) {
    if (feature.url.equals(coreVersionZeroDotOneUrl) || feature.purpose === 'EXECUTION' || feature.purpose === 'SECURITY') {
      if (!SUPPORTED_FEATURES.has(feature.url.base.toString())) {
        errors.push(ErrUnsupportedFeature(feature));
      }
    }
  }
  if (errors.length > 0) {
    throw ErrCoreCheckFailed(errors);
  }
}

export function validateSupergraph(supergraph: Schema): [CoreFeatures, JoinSpecDefinition] {
  const coreFeatures = supergraph.coreFeatures;
  if (!coreFeatures) {
    throw new GraphQLError("Invalid supergraph: must be a core schema");
  }
  const joinFeature = coreFeatures.getByIdentity(joinIdentity);
  if (!joinFeature) {
    throw new GraphQLError("Invalid supergraph: must use the join spec");
  }
  const joinSpec = JOIN_VERSIONS.find(joinFeature.url.version);
  if (!joinSpec) {
    throw new GraphQLError(
      `Invalid supergraph: uses unsupported join spec version ${joinFeature.url.version} (supported versions: ${JOIN_VERSIONS.versions().join(', ')})`);
  }
  return [coreFeatures, joinSpec];
}

export function isFed1Supergraph(supergraph: Schema): boolean {
  return validateSupergraph(supergraph)[1].version.equals(new FeatureVersion(0, 1));
}
