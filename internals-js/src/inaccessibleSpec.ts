import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import {
  DirectiveDefinition,
  ErrGraphQLValidationFailed,
  FieldDefinition,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  Schema,
} from "./definitions";
import { GraphQLError, DirectiveLocation } from "graphql";
import { registerKnownFeature } from "./knownCoreFeatures";

export const inaccessibleIdentity = 'https://specs.apollo.dev/inaccessible';

export class InaccessibleSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion) {
    super(new FeatureUrl(inaccessibleIdentity, 'inaccessible', version));
  }

  addElementsToSchema(schema: Schema) {
    this.addDirective(schema, 'inaccessible').addLocations(
      DirectiveLocation.FIELD_DEFINITION,
      DirectiveLocation.OBJECT,
      DirectiveLocation.INTERFACE,
      DirectiveLocation.UNION,
    );
  }

  inaccessibleDirective(schema: Schema): DirectiveDefinition<Record<string, never>> {
    return this.directive(schema, 'inaccessible')!;
  }

  allElementNames(): string[] {
    return ['@inaccessible'];
  }
}

export const INACCESSIBLE_VERSIONS = new FeatureDefinitions<InaccessibleSpecDefinition>(inaccessibleIdentity)
  .add(new InaccessibleSpecDefinition(new FeatureVersion(0, 1)));

registerKnownFeature(INACCESSIBLE_VERSIONS);

export function removeInaccessibleElements(schema: Schema) {
  const coreFeatures = schema.coreFeatures;
  if (!coreFeatures) {
    return;
  }

  const inaccessibleFeature = coreFeatures.getByIdentity(inaccessibleIdentity);
  if (!inaccessibleFeature) {
    return;
  }
  const inaccessibleSpec = INACCESSIBLE_VERSIONS.find(inaccessibleFeature.url.version);
  if (!inaccessibleSpec) {
    throw new GraphQLError(
      `Cannot remove inaccessible elements: the schema uses unsupported inaccessible spec version ${inaccessibleFeature.url.version} (supported versions: ${INACCESSIBLE_VERSIONS.versions().join(', ')})`);
  }

  const inaccessibleDirective = inaccessibleSpec.inaccessibleDirective(schema);
  if (!inaccessibleDirective) {
    throw new GraphQLError(
      `Invalid schema: declares ${inaccessibleSpec.url} spec but does not define a @inaccessible directive`
    );
  }

  const errors = [];
  for (const type of schema.types()) {
    // @inaccessible can only be on composite types.
    if (!isCompositeType(type)) {
      continue;
    }

    if (type.hasAppliedDirective(inaccessibleDirective)) {
      const references = type.remove();
      for (const reference of references) {
        // If the type was referenced in a field, we need to make sure that field is also inaccessible or the resulting schema will be invalid (the
        // field type will be `undefined`).
        if (reference.kind === 'FieldDefinition') {
          if (!reference.hasAppliedDirective(inaccessibleDirective)) {
            errors.push(new GraphQLError(
              `Field ${reference.coordinate} returns an @inaccessible type without being marked @inaccessible itself.`,
              reference.sourceAST,
            ));
          }
        }
        // Other references can be:
        //  - the type may have been a root type: in that case the schema will simply not have a root for that kind.
        //  - the type may have been part of a union: it will have been removed from that union. This can leave the union empty but ...
        //  - the type may an interface that other types implements: those other will simply not implement the (non-existing) interface.
      }
    } else if (isObjectType(type) || isInterfaceType(type)) {
      const toRemove = (type.fields() as FieldDefinition<any>[]).filter(f => f.hasAppliedDirective(inaccessibleDirective));
      toRemove.forEach(f => f.remove());
    }
  }

  if (errors.length) {
    throw ErrGraphQLValidationFailed(errors)
  }
}
