import { FeatureDefinition, FeatureDefinitions, FeatureUrl } from "./specs/coreSpec";

const registeredFeatures = new Map<string, FeatureDefinitions>();

export function registerKnownFeature(definitions: FeatureDefinitions) {
  if (!registeredFeatures.has(definitions.identity)) {
    registeredFeatures.set(definitions.identity, definitions);
  }
}

export function coreFeatureDefinitionIfKnown(url: FeatureUrl): FeatureDefinition | undefined {
  return registeredFeatures.get(url.identity)?.find(url.version);
}

/**
 * Removes a feature from the set of known features.
 *
 * This exists purely for testing purposes. There is no reason to unregistered features otherwise.
 */
export function unregisterKnownFeatures(definitions: FeatureDefinitions) {
  registeredFeatures.delete(definitions.identity);
}
