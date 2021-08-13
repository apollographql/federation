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

export const ErrForUnsupported = (feature: Feature) =>
  err('ForUnsupported', {
    message:
      'The `for:` argument is unsupported in @core v0.1 documents. Please upgrade to at least @core v0.2 (https://specs.apollo.dev/core/v0.2).',
    feature,
    nodes: [feature.directive],
  });

export function featureSupport(this: CoreSchemaContext) {
  const coreVersionZeroDotOne = this.features.find(
    'https://specs.apollo.dev/core/v0.1',
    true,
  );
  // Handle the case where the user is using core v0.1 and the "for" argument
  // in a @core directive usage.
  if (!!coreVersionZeroDotOne) {
    for (const feature of this.features) {
      if (feature.purpose) {
        this.report(ErrForUnsupported(coreVersionZeroDotOne));
        break;
      }
    }
    return;
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
