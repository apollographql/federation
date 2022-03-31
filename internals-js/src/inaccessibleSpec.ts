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
import { ERRORS } from "./error";
import { createDirectiveSpecification, DirectiveSpecification } from "./directiveAndTypeSpecification";

export const inaccessibleIdentity = 'https://specs.apollo.dev/inaccessible';

export class InaccessibleSpecDefinition extends FeatureDefinition {
  public readonly inaccessibleLocations: DirectiveLocation[];
  public readonly inaccessibleDirectiveSpec: DirectiveSpecification;

  constructor(version: FeatureVersion) {
    super(new FeatureUrl(inaccessibleIdentity, 'inaccessible', version));
    this.inaccessibleLocations = [
      DirectiveLocation.FIELD_DEFINITION,
      DirectiveLocation.OBJECT,
      DirectiveLocation.INTERFACE,
      DirectiveLocation.UNION,
    ];
    if (!this.isV01()) {
      this.inaccessibleLocations.push(
        DirectiveLocation.ARGUMENT_DEFINITION,
        DirectiveLocation.SCALAR,
        DirectiveLocation.ENUM,
        DirectiveLocation.ENUM_VALUE,
        DirectiveLocation.INPUT_OBJECT,
        DirectiveLocation.INPUT_FIELD_DEFINITION,
      );
    }
    this.inaccessibleDirectiveSpec = createDirectiveSpecification({
      name: 'inaccessible',
      locations: this.inaccessibleLocations,
    });
  }

  isV01() {
    return this.version.equals(new FeatureVersion(0, 1));
  }

  addElementsToSchema(schema: Schema): GraphQLError[] {
    return this.addDirectiveSpec(schema, this.inaccessibleDirectiveSpec);
  }

  inaccessibleDirective(schema: Schema): DirectiveDefinition<Record<string, never>> {
    return this.directive(schema, 'inaccessible')!;
  }

  allElementNames(): string[] {
    return ['@inaccessible'];
  }
}

export const INACCESSIBLE_VERSIONS = new FeatureDefinitions<InaccessibleSpecDefinition>(inaccessibleIdentity)
  .add(new InaccessibleSpecDefinition(new FeatureVersion(0, 1)))
  .add(new InaccessibleSpecDefinition(new FeatureVersion(0, 2)));

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
            // We ship the inaccessible type and it's invalid reference in the extensions so composition can extract those and add proper links
            // in the subgraphs for those elements.
            errors.push(ERRORS.REFERENCED_INACCESSIBLE.err({
              message: `Field "${reference.coordinate}" returns @inaccessible type "${type}" without being marked @inaccessible itself.`,
              nodes: reference.sourceAST,
              extensions: {
                "inaccessible_element": type.coordinate,
                "inaccessible_reference": reference.coordinate,
              }
            }));
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

  if (errors.length > 0) {
    throw ErrGraphQLValidationFailed(errors, `Schema has ${errors.length === 1 ? 'an invalid use' : 'invalid uses'} of the @inaccessible directive.`);
  }
}
