import { DocumentNode, GraphQLError } from "graphql";
import { ErrCoreCheckFailed, FeatureUrl, FeatureVersion } from "./specs/coreSpec";
import { CoreFeatures, Schema, sourceASTs } from "./definitions";
import { joinIdentity, JoinSpecDefinition, JOIN_VERSIONS } from "./specs/joinSpec";
import { buildSchema, buildSchemaFromAST } from "./buildSchema";
import { extractSubgraphsNamesAndUrlsFromSupergraph, extractSubgraphsFromSupergraph } from "./extractSubgraphsFromSupergraph";
import { ERRORS } from "./error";
import { Subgraphs } from ".";

export const DEFAULT_SUPPORTED_SUPERGRAPH_FEATURES = new Set([
  'https://specs.apollo.dev/core/v0.1',
  'https://specs.apollo.dev/core/v0.2',
  'https://specs.apollo.dev/join/v0.1',
  'https://specs.apollo.dev/join/v0.2',
  'https://specs.apollo.dev/join/v0.3',
  'https://specs.apollo.dev/join/v0.4',
  'https://specs.apollo.dev/tag/v0.1',
  'https://specs.apollo.dev/tag/v0.2',
  'https://specs.apollo.dev/tag/v0.3',
  'https://specs.apollo.dev/inaccessible/v0.1',
  'https://specs.apollo.dev/inaccessible/v0.2',
]);

const coreVersionZeroDotOneUrl = FeatureUrl.parse('https://specs.apollo.dev/core/v0.1');

/**
 * Checks that only our hard-coded list of features are part of the provided schema, and that if
 * the schema uses core v0.1, then it doesn't use the 'for' (purpose) argument.
 * Throws if that is not true.
 */
function checkFeatureSupport(coreFeatures: CoreFeatures, supportedFeatures: Set<string>) {
  const errors: GraphQLError[] = [];
  const coreItself = coreFeatures.coreItself;
  if (coreItself.url.equals(coreVersionZeroDotOneUrl)) {
    const purposefulFeatures = [...coreFeatures.allFeatures()].filter(f => f.purpose)
    if (purposefulFeatures.length > 0) {
      errors.push(ERRORS.UNSUPPORTED_LINKED_FEATURE.err(
        `the \`for:\` argument is unsupported by version ${coreItself.url.version} ` +
        `of the core spec. Please upgrade to at least @core v0.2 (https://specs.apollo.dev/core/v0.2).`,
        {
          nodes: sourceASTs(coreItself.directive, ...purposefulFeatures.map(f => f.directive))
        }
      ));
    }
  }

  for (const feature of coreFeatures.allFeatures()) {
    if (feature.url.equals(coreVersionZeroDotOneUrl) || feature.purpose === 'EXECUTION' || feature.purpose === 'SECURITY') {
      if (!supportedFeatures.has(feature.url.base.toString())) {
        errors.push(ERRORS.UNSUPPORTED_LINKED_FEATURE.err(
          `feature ${feature.url} is for: ${feature.purpose} but is unsupported`,
          { nodes: feature.directive.sourceAST },
        ));
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
    throw ERRORS.INVALID_FEDERATION_SUPERGRAPH.err("Invalid supergraph: must be a core schema");
  }
  const joinFeature = coreFeatures.getByIdentity(joinIdentity);
  if (!joinFeature) {
    throw ERRORS.INVALID_FEDERATION_SUPERGRAPH.err("Invalid supergraph: must use the join spec");
  }
  const joinSpec = JOIN_VERSIONS.find(joinFeature.url.version);
  if (!joinSpec) {
    throw ERRORS.INVALID_FEDERATION_SUPERGRAPH.err(
      `Invalid supergraph: uses unsupported join spec version ${joinFeature.url.version} (supported versions: ${JOIN_VERSIONS.versions().join(', ')})`);
  }
  return [coreFeatures, joinSpec];
}

export function isFed1Supergraph(supergraph: Schema): boolean {
  return validateSupergraph(supergraph)[1].version.equals(new FeatureVersion(0, 1));
}

export class Supergraph {
  private readonly containedSubgraphs: readonly {name: string, url: string}[];
  // Lazily computed as that requires a bit of work.
  private _subgraphs?: Subgraphs;

  constructor(
    readonly schema: Schema,
    supportedFeatures: Set<string> | null = DEFAULT_SUPPORTED_SUPERGRAPH_FEATURES,
    private readonly shouldValidate: boolean = true,
  ) {
    const [coreFeatures] = validateSupergraph(schema);

    if (supportedFeatures !== null) {
      checkFeatureSupport(coreFeatures, supportedFeatures);
    }

    if (shouldValidate) {
      schema.validate();
    } else {
      schema.assumeValid();
    }

    this.containedSubgraphs = extractSubgraphsNamesAndUrlsFromSupergraph(schema);
  }

  static build(supergraphSdl: string | DocumentNode, options?: { supportedFeatures?: Set<string>, validateSupergraph?: boolean }) {
    // We delay validation because `checkFeatureSupport` in the constructor gives slightly more useful errors if, say, 'for' is used with core v0.1.
    const schema = typeof supergraphSdl === 'string'
      ? buildSchema(supergraphSdl, { validate: false })
      : buildSchemaFromAST(supergraphSdl, { validate: false });

    return new Supergraph(schema, options?.supportedFeatures, options?.validateSupergraph);
  }

  /**
   * The list of names/urls of the subgraphs contained in this subgraph.
   *
   * Note that this is a subset of what `this.subgraphs()` returns, but contrarily to that method, this method does not do a full extraction of the
   * subgraphs schema.
   */
  subgraphsMetadata(): readonly {name: string, url: string}[] {
    return this.containedSubgraphs;
  }

  subgraphs(): Subgraphs {
    if (!this._subgraphs) {
      // Note that `extractSubgraphsFromSupergraph` redo a little bit of work we're already one, like validating
      // the supergraph. We could refactor things to avoid it, but it's completely negligible in practice so we
      // can leave that to "some day, maybe".
      this._subgraphs = extractSubgraphsFromSupergraph(this.schema, this.shouldValidate);
    }
    return this._subgraphs;
  }

  apiSchema(): Schema {
    return this.schema.toAPISchema();
  }
}
