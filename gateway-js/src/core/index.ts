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

export function featureSupport(this: CoreSchemaContext) {
  // We support core v0.1. In the case that we're using it, "for" is not
  // a concern and we can report no errors.
  if (this.features.find("https://specs.apollo.dev/core/v0.1", true)) return;

  for (const feature of this.features) {
    if (!feature.purpose) continue;
    if (feature.purpose === 'EXECUTION' || feature.purpose === 'SECURITY') {
      if (!SUPPORTED_FEATURES.has(feature.url.base.toString())) {
        this.report(ErrUnsupportedFeature(feature));
      }
    }
  }
}
