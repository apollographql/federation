import {
  baseType,
  CompositeType,
  Directive,
  federationBuiltIns,
  FieldDefinition,
  InterfaceType,
  isInterfaceType,
  NamedType,
  ObjectType,
  parseFieldSetArgument,
  Schema
} from ".";

export function computeShareables(schema: Schema): (field: FieldDefinition<CompositeType>) => boolean {
  const keyDirective = federationBuiltIns.keyDirective(schema);
  const providesDirective = federationBuiltIns.providesDirective(schema);
  const shareableDirective = federationBuiltIns.shareableDirective(schema);

  const shareableFields: Set<String> = new Set();
  const addKeyFields = (type: CompositeType) => {
    for (const key of type.appliedDirectivesOf(keyDirective)) {
      forEachFieldSetArgumentResolvingInterfaces(
        type,
        key,
        (f) => shareableFields.add(f.coordinate)
      );
    }
  };

  for (const type of schema.types<ObjectType>('ObjectType')) {
    addKeyFields(type);
    const shareablesOnType = type.appliedDirectivesOf(shareableDirective);
    for (const field of type.fields()) {
      const fieldIsShareable = field.hasAppliedDirective(shareableDirective)
        || (shareablesOnType.length > 0 && shareablesOnType.some((d) => field.ofExtension() === d.ofExtension()));
      if (fieldIsShareable) {
        shareableFields.add(field.coordinate);
      }
      for (const provides of field.appliedDirectivesOf(providesDirective)) {
        forEachFieldSetArgumentResolvingInterfaces(
          baseType(field.type!) as CompositeType,
          provides,
          (f) => shareableFields.add(f.coordinate)
        );
      }
    }
  }

  for (const type of schema.types<InterfaceType>('InterfaceType')) {
    addKeyFields(type);
  }

  return (field) => shareableFields.has(field.coordinate);
}

function forEachFieldSetArgumentResolvingInterfaces(
  parentType: CompositeType,
  directive: Directive<NamedType | FieldDefinition<CompositeType>, {fields: any}>,
  callback: (field: FieldDefinition<CompositeType>) => void,
) {
  parseFieldSetArgument(parentType, directive, (t, f) => {
    const field = t.field(f);
    if (field) {
      callback(field);
      if (isInterfaceType(t)) {
        for (const implType of t.possibleRuntimeTypes()) {
          const implField = implType.field(f);
          if (implField) {
            callback(implField);
          }
        }
      }
    }
    return field;
  });
}
