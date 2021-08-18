import { CoreSchemaContext, err, Feature } from '@apollo/core-schema';

const SUPPORTED_FEATURES = new Set([
  'https://specs.apollo.dev/core/v0.1',
  'https://specs.apollo.dev/core/v0.2',
  'https://specs.apollo.dev/join/v0.1',
  'https://specs.apollo.dev/tag/v0.1',
  'https://specs.apollo.dev/inaccessible/v0.1',
]);

export const ErrUnsupportedFeature = (feature: Feature) =>
  err('UnsupportedFeature', {
    message: `feature ${feature.url} is for: ${feature.purpose} but is unsupported`,
    feature,
    nodes: [feature.directive],
  });

export const ErrForUnsupported = (core: Feature, ...features: readonly Feature[]) =>
  err('ForUnsupported', {
    message:
      `the \`for:\` argument is unsupported by version ${core.url.version} ` +
      `of the core spec. Please upgrade to at least @core v0.2 (https://specs.apollo.dev/core/v0.2).`,
    features,
    nodes: [core.directive, ...features.map(f => f.directive)]
  });

export function featureSupport(this: CoreSchemaContext) {
  const coreVersionZeroDotOne = this.features.find(
    'https://specs.apollo.dev/core/v0.1',
    true,
  );

  // fail with ForUnsupported if the user provides a core directive with the
  // `for:` argument in a core v0.1 document
  if (coreVersionZeroDotOne) {
    const purposefulFeatures = [...this.features].filter(f => f.purpose)
    if (purposefulFeatures.length > 0)
      this.report(ErrForUnsupported(coreVersionZeroDotOne, ...purposefulFeatures))
    // we'll continue onward to report UnsupportedFeature even in core v0.1
    // documents
  }

  for (const feature of this.features) {
    if (!feature.purpose) continue;
    if (feature.purpose === 'EXECUTION' || feature.purpose === 'SECURITY') {
      if (!SUPPORTED_FEATURES.has(feature.url.base.toString())) {
        this.report(ErrUnsupportedFeature(feature));
      }
    }
  }
}
