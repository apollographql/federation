/**
 * Exposes methods to reason about types and their relationship.
 */

import {
  AbstractType,
  InterfaceType,
  isCompositeType,
  isInterfaceType,
  isListType,
  isNamedType,
  isNonNullType,
  isObjectType,
  isUnionType,
  ObjectType,
  Type,
  UnionType
} from "./definitions";

export const ALL_SUBTYPING_RULES = [
  'direct' as const,
  'nonNullable_downgrade' as const,
  'list_upgrade' as const,
  'list_propagation' as const,
  'nonNullable_propagation' as const
];

export type SubtypingRule = typeof ALL_SUBTYPING_RULES[number];

// The subtyping rules that graphQL-js enforces in particular
export const DEFAULT_SUBTYPING_RULES = ALL_SUBTYPING_RULES.filter(r => r !== "list_upgrade");

/**
 * Tests whether 2 types are the "same" type.
 *
 * To be the same type, for this method, is defined as having the samee name for named types
 * or, for wrapper types, the same wrapper type and recursively same wrapped one.
 *
 * This method does not check that both types are from the same schema and does not validate
 * that the structure of named types is the same. Also note that it does not check the "kind"
 * of the type, which is actually relied on due to @interfaceObject (where the "same" type 
 * can be an interface in one subgraph but an object type in another, while fundamentally being
 * the same type).
 */
export function sameType(t1: Type, t2: Type): boolean {
  switch (t1.kind) {
    case 'ListType':
      return isListType(t2) && sameType(t1.ofType, t2.ofType);
    case 'NonNullType':
      return isNonNullType(t2) && sameType(t1.ofType, t2.ofType);
    default:
      return isNamedType(t2) && t1.name === t2.name;
  }
}

/**
 * Tests whether `maybeSubType` is a direct subtype of `type`.
 *
 * A type `maybeSubType` is a direct subtype of `type` if either `type` is a union and
 * `maybeSubType` is a member of that union, or `type` is an interface and `maybeSubType`
 * implements `type`.
 *
 * The notion of "direct" subtypes is a strict one, in that a type is never a direct subtype
 * of itself.
 *
 * This relation does _not_ check that both types are from the same schema: union type
 * membership and interface implementation is based on type names only.
 *
 */
export function isDirectSubtype(
  type: AbstractType,
  maybeSubType: ObjectType | InterfaceType,
  unionMembershipTester: (union: UnionType, maybeMember: ObjectType) => boolean = (u, m) => u.hasTypeMember(m),
  implementsInterfaceTester: (maybeImplementer: ObjectType | InterfaceType, itf: InterfaceType) => boolean = (m, i) => m.implementsInterface(i),
): boolean {
  if (isUnionType(type)) {
    return isObjectType(maybeSubType) && unionMembershipTester(type, maybeSubType);
  }
  return implementsInterfaceTester(maybeSubType, type);
}

/**
 * Tests whether `maybeSubType` is a subtype of `type`.
 *
 * Subtyping is defined as the notion of "direct" subtyping (of `isDirectSubtype`) extended to wrapper types
 * and to equality. More precisely, `maybeSubType` is a subtype of `type` if one of the following is true:
 * - both types are the same.
 * - `maybeSubType` is a direct subtype of `type`.
 * - `maybeSubType` and `type` are the same kind of wrapper type (both lists or both non-null), and the
 *   type wrapped by `maybeSubType` is a subtype of the type wrapped by `type`.
 * - `maybeSubType` is a non-null type and the type wrapped by `maybeSubType` is a subtype of `type`.
 *
 * As usual, this subtyping relation ensures that if a value is of type `subType` and `subType` is a subtype
 * of `type`, then it can be used where a value of type `type` is expected.
 *
 * If you to exclude equality from the relation, use `isStrictSubtype`.
 */
export function isSubtype(
  type: Type,
  maybeSubType: Type,
  allowedRules: SubtypingRule[] = DEFAULT_SUBTYPING_RULES,
  unionMembershipTester: (union: UnionType, maybeMember: ObjectType) => boolean = (u, m) => u.hasTypeMember(m),
  implementsInterfaceTester: (maybeImplementer: ObjectType | InterfaceType, itf: InterfaceType) => boolean = (m, i) => m.implementsInterface(i)
): boolean {
  return sameType(type, maybeSubType) || isStrictSubtype(type, maybeSubType, allowedRules, unionMembershipTester, implementsInterfaceTester);
}

/**
 * Tests whether `maybeSubType` is a strict subtype of `type`.
 *
 * Strict subtyping is the subtyping relation defined on `isSubtype`, but where
 * equality (as defined by `sameType`) is excluded.
 */
export function isStrictSubtype(
  type: Type,
  maybeSubType: Type,
  allowedRules: SubtypingRule[] = DEFAULT_SUBTYPING_RULES,
  unionMembershipTester: (union: UnionType, maybeMember: ObjectType) => boolean = (u, m) => u.hasTypeMember(m),
  implementsInterfaceTester: (maybeImplementer: ObjectType | InterfaceType, itf: InterfaceType) => boolean = (m, i) => m.implementsInterface(i)
): boolean {
  switch (maybeSubType.kind) {
    case 'ListType':
      return allowedRules.includes('list_propagation')
        && isListType(type)
        && isSubtype(type.ofType, maybeSubType.ofType, allowedRules, unionMembershipTester, implementsInterfaceTester);
    case 'NonNullType':
      if (isNonNullType(type)) {
        return allowedRules.includes('nonNullable_propagation')
          && isSubtype(type.ofType, maybeSubType.ofType, allowedRules, unionMembershipTester, implementsInterfaceTester);
      }
      return allowedRules.includes('nonNullable_downgrade')
        && isSubtype(type, maybeSubType.ofType, allowedRules, unionMembershipTester, implementsInterfaceTester);
    case 'ObjectType':
    case 'InterfaceType':
      if (isListType(type)) {
        return allowedRules.includes('list_upgrade')
          && isSubtype(type.ofType, maybeSubType, allowedRules, unionMembershipTester, implementsInterfaceTester);
      }
      return allowedRules.includes('direct')
        && (isInterfaceType(type) || isUnionType(type))
        && isDirectSubtype(type, maybeSubType, unionMembershipTester, implementsInterfaceTester);
    default:
      return isListType(type)
        && allowedRules.includes('list_upgrade')
        && isSubtype(type.ofType, maybeSubType, allowedRules, unionMembershipTester, implementsInterfaceTester);
  }
}

/**
 * This essentially follows the beginning of https://spec.graphql.org/draft/#SameResponseShape().
 * That is, the types cannot be merged unless:
 * - they have the same nullability and "list-ability", potentially recursively.
 * - their base type is either both composite, or are the same type.
 */
export function typesCanBeMerged(t1: Type, t2: Type): boolean {
  if (isNonNullType(t1)) {
    return isNonNullType(t2) ? typesCanBeMerged(t1.ofType, t2.ofType) : false;
  }
  if (isListType(t1)) {
    return isListType(t2) ? typesCanBeMerged(t1.ofType, t2.ofType) : false;
  }
  if (isCompositeType(t1)) {
    return isCompositeType(t2);
  }
  return sameType(t1, t2);
}

