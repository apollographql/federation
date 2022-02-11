import {
    assert,
  baseType,
  CompositeType,
  federationMetadata,
  FieldDefinition,
  forEachFieldSetArgument,
  InterfaceType,
  ObjectType,
  Schema
} from ".";

export function computeShareables(schema: Schema): (field: FieldDefinition<CompositeType>) => boolean {
  const metadata = federationMetadata(schema);
  assert(metadata, 'Schema should be a federation subgraph');

  const keyDirective = metadata.keyDirective();
  const providesDirective = metadata.providesDirective();
  // @shareable is only avalaible on fed2 schema, but the schema upgrader call this on fed1 schema as a shortcut to
  // identify key fields (because if we know nothing is marked @shareable, then the only fields that are shareable
  // by default are key fields).
  const shareableDirective = metadata.isFed2Schema() ? metadata.shareableDirective() : undefined;

  const shareableFields: Set<String> = new Set();
  const addKeyFields = (type: CompositeType) => {
    for (const key of type.appliedDirectivesOf(keyDirective)) {
      forEachFieldSetArgument({
        parentType: type,
        directive: key,
        callback: (f) => shareableFields.add(f.coordinate),
        includeInterfaceFieldsImplementations: true,
        validate: false,
      });
    }
  };

  for (const type of schema.types<ObjectType>('ObjectType')) {
    addKeyFields(type);
    const shareablesOnType = shareableDirective ? type.appliedDirectivesOf(shareableDirective) : [];
    for (const field of type.fields()) {
      const fieldIsShareable = shareableDirective && field.hasAppliedDirective(shareableDirective)
        || (shareablesOnType.length > 0 && shareablesOnType.some((d) => field.ofExtension() === d.ofExtension()));
      if (fieldIsShareable) {
        shareableFields.add(field.coordinate);
      }
      for (const provides of field.appliedDirectivesOf(providesDirective)) {
        forEachFieldSetArgument({
          parentType: baseType(field.type!) as CompositeType,
          directive: provides,
          callback: (f) => shareableFields.add(f.coordinate),
          includeInterfaceFieldsImplementations: true,
          validate: false,
        });
      }
    }
  }

  for (const type of schema.types<InterfaceType>('InterfaceType')) {
    addKeyFields(type);
  }

  return (field) => shareableFields.has(field.coordinate);
}

