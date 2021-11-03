import {
  ArgumentDefinition,
  DEFAULT_SUBTYPING_RULES,
  EnumType,
  FieldDefinition,
  InputObjectType,
  InputType,
  InterfaceType,
  isEnumType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isScalarType,
  isSubtype,
  ObjectType,
  SchemaElement,
  SubtypingRule,
  UnionType,
} from '@apollo/federation-internals';

function typeComparison<T>(
  t1: any,
  t2: any,
  typeTest: (t: any) => t is T,
  test: (t1: T, t2: T) => boolean
): boolean | undefined {
  if (typeTest(t1)) {
    return typeTest(t2) ? test(t1, t2) : false;
  }
  return typeTest(t2) ? false : undefined;
}

function isSubset<T>(set: T[], maybeSubset: T[]): boolean {
  return maybeSubset.every(v => set.includes(v));
}

function isAccessible(element: SchemaElement<any, any>): boolean {
  return element.hasAppliedDirective('inaccessible');
}

// The enum string values, with any values marked by @inaccessible filtered out.
// TODO: should we move this and related to a different place? It's more of a composition specific
//   type of subtyping.
function accessibleEnumValues(enumType: EnumType): string[] {
  return enumType
    .values
    .filter(v => isAccessible(v))
    .map(v => v.name);
}

// We may compare the same enum name, but where one has only a subset of the values of the other
// one because one definition comes from a subgraph and one from a supergraph. In that case,
// subtyping is that of values.
function isEnumInputSubtype(enumType: EnumType, maybeSubType: EnumType): boolean {
  if (enumType.name != maybeSubType.name) {
    return false;
  }
  return isSubset(accessibleEnumValues(maybeSubType), accessibleEnumValues(enumType));
}

// We may compare the same object input name, but where one has only a subset of the fields of the other
// one because one definition comes from a subgraph and one from a supergraph. In that case, subtyping is
// that of fields.
function isObjectInputSubtype(objectInputType: InputObjectType, maybeSubType: InputObjectType) {
  if (objectInputType.name != maybeSubType.name) {
    return false;
  }
  return maybeSubType.fields()
    .filter(isAccessible)
    .every(subtypeField => {
      const field = objectInputType.field(subtypeField.name);
      return field && isAccessible(field) ? isStructuralInputSubType(field.type!, subtypeField.type!) : false;
    });
}

export function isStructuralInputSubType(inputType: InputType, maybeSubType: InputType): boolean {
  if (isNonNullType(inputType)) {
    // A nullable type cannot be a subtype of a non-nullable on.
    return isNonNullType(maybeSubType) ? isStructuralInputSubType(inputType.ofType, maybeSubType.ofType) : false;
  }
  /// A non-nullable type is a subtype of a nullable one if it is a subtype of that other type.
  if (isNonNullType(maybeSubType)) {
    return isStructuralInputSubType(inputType, maybeSubType.ofType);
  }
  let c = typeComparison(inputType, maybeSubType, isListType, (l1, l2) => isStructuralInputSubType(l1.ofType, l2.ofType));
  if (c != undefined) {
    return c;
  }
  c = typeComparison(inputType, maybeSubType, isScalarType, (l1, l2) => l1.name == l2.name);
  if (c != undefined) {
    return c;
  }
  c = typeComparison(inputType, maybeSubType, isEnumType, (l1, l2) => isEnumInputSubtype(l1, l2));
  if (c != undefined) {
    return c;
  }
  c = typeComparison(inputType, maybeSubType, isInputObjectType, (l1, l2) => isObjectInputSubtype(l1, l2));
  return c ?? false;
}

function getArg(field: FieldDefinition<any>, argName: string): ArgumentDefinition<any> | undefined {
  const arg = field.argument(argName);
  return arg && isAccessible(arg) ? arg : undefined;
}

export function isStructuralFieldSubtype(
  fieldDef: FieldDefinition<any>,
  maybeSubType: FieldDefinition<any>,
  allowedRules: SubtypingRule[] = DEFAULT_SUBTYPING_RULES,
  unionMembershipTester: (union: UnionType, maybeMember: ObjectType) => boolean = (u, m) => u.hasTypeMember(m),
  implementsInterfaceTester: (maybeImplementer: ObjectType | InterfaceType, itf: InterfaceType) => boolean = (m, i) => m.implementsInterface(i)
): boolean {
  if (fieldDef.name !== maybeSubType.name) {
    return false;
  }
  if (!isSubtype(maybeSubType.type!, fieldDef.type!, allowedRules, unionMembershipTester, implementsInterfaceTester)) {
    return false;
  }
  for (const argDef of maybeSubType.arguments().filter(isAccessible)) {
    const providedArgDef = getArg(fieldDef, argDef.name);
    if (!providedArgDef || !isStructuralInputSubType(providedArgDef.type!, argDef.type!)) {
      return false;
    }
  }
  return true;
}

