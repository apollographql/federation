import { assert, coreFeatureDefinitionIfKnown, DirectiveCompositionSpecification, DirectiveDefinition, FeatureUrl, isDefined, mapValues, Subgraphs } from "@apollo/federation-internals";

export type CoreDirectiveInSubgraphs = {
  url: FeatureUrl,
  name: string,
  definitionsPerSubgraph: Map<string, DirectiveDefinition>,
  compositionSpec: DirectiveCompositionSpecification,
}

export function collectCoreDirectivesToCompose(
  subgraphs: Subgraphs,
): CoreDirectiveInSubgraphs[] {
  // Groups directives by their feature and major version (we use negative numbers for pre-1.0 version
  // numbers on the minor, since all minors are incompatible).
  const directivesPerFeatureAndVersion = new Map<string, Map<number, Omit<CoreDirectiveInSubgraphs, 'compositionSpec'>>>();

  for (const subgraph of subgraphs) {
    const features = subgraph.schema.coreFeatures;
    assert(features, 'Subgraphs should be core schemas');
    for (const directive of subgraph.schema.directives()) {
      const source = features.sourceFeature(directive);
      // We ignore directives that are not "core" ones, or the ones that are defined but unused (note that this
      // happen to ignore execution directives as a by-product)
      if (!source || directive.applications().length === 0) {
        continue;
      }

      const url = source.feature.url;
      const fqn = `${source.nameInFeature}-${url.identity}`
      let forFeature = directivesPerFeatureAndVersion.get(fqn);
      if (!forFeature) {
        forFeature = new Map();
        directivesPerFeatureAndVersion.set(fqn, forFeature);
      }

      const major = url.version.major > 0 ? url.version.major : -url.version.minor;
      let forVersion = forFeature.get(major);
      if (forVersion) {
        // Update the url if we've found a more recent minor for that major
        if (url.version.compareTo(forVersion.url.version) > 0) {
          forVersion.url = url;
        }
      } else {
        forVersion = {
          url,
          name: source.nameInFeature,
          definitionsPerSubgraph: new Map(),
        }
        forFeature.set(major, forVersion);
      }
      forVersion.definitionsPerSubgraph.set(subgraph.name, directive);
    }
  }

  return mapValues(directivesPerFeatureAndVersion)
    .flatMap((perVersion) => mapValues(perVersion))
    .map((d) => {
      const featureDefinition = coreFeatureDefinitionIfKnown(d.url);
      const compositionSpec = featureDefinition?.compositionSpecification(d.name);
      if (!compositionSpec) {
        return undefined;
      }
      return {
        ...d,
        compositionSpec,
      };
    })
    .filter(isDefined);
}
