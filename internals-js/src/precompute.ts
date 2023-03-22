import {
  assert,
  baseType,
  CompositeType,
  federationMetadata,
  FieldDefinition,
  collectTargetFields,
  Schema,
  isCompositeType,
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

  const shareableFields: Set<string> = new Set();
  const addKeyFields = (type: CompositeType) => {
    for (const key of type.appliedDirectivesOf(keyDirective)) {
      collectTargetFields({
        parentType: type,
        directive: key,
        includeInterfaceFieldsImplementations: true,
        validate: false,
      }).forEach((f) => shareableFields.add(f.coordinate));
    }
  };

  for (const type of schema.objectTypes()) {
    addKeyFields(type);
    const shareablesOnType = shareableDirective ? type.appliedDirectivesOf(shareableDirective) : [];
    for (const field of type.fields()) {
      const fieldIsShareable = shareableDirective && field.hasAppliedDirective(shareableDirective)
        || (shareablesOnType.length > 0 && shareablesOnType.some((d) => field.ofExtension() === d.ofExtension()));
      if (fieldIsShareable) {
        shareableFields.add(field.coordinate);
      }
      for (const provides of field.appliedDirectivesOf(providesDirective)) {
        const parentType = baseType(field.type!);
        // It's never valid to put a @provides on a non-composite type, but things haven't been fully validated when this
        // code run and we just want to ignore non-sensical cases (this is also why we pass `validate: false` below).
        if (isCompositeType(parentType)) {
          collectTargetFields({
            parentType,
            directive: provides,
            includeInterfaceFieldsImplementations: true,
            validate: false,
          }).forEach((f) => {
            // Fed2 schema reject provides on non-external field, but fed1 doesn't (at least not always), and we actually
            // call this on fed1 schema upgrader. So let's make sure we do ignore non-external fields.
            if (metadata.isFieldExternal(f)) {
              shareableFields.add(f.coordinate);
            }
          });
        }
      }
    }
  }

  for (const type of schema.interfaceTypes()) {
    addKeyFields(type);
  }

  return (field) => shareableFields.has(field.coordinate);
}
