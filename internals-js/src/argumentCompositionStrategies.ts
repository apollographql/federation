import { InputType, NonNullType, Schema, isListType, isNonNullType } from "./definitions"
import { sameType } from "./types";
import { valueEquals } from "./values";

type TypeSupportValidator = (schema: Schema, type: InputType) => { valid: boolean, supportedMsg?: string };

export type ArgumentCompositionStrategy = {
  name: string,
  isTypeSupported: TypeSupportValidator,
  mergeValues: (values: any[]) => any,
}

function supportFixedTypes(types: (schema: Schema) => InputType[]): TypeSupportValidator {
  return (schema, type) => {
    const supported = types(schema);
    return supported.some((t) => sameType(t, type))
      ? { valid: true }
      : { valid: false, supportedMsg: `type(s) ${supported.join(', ')}` };
  };
}

function supportAnyNonNullArray(): TypeSupportValidator {
  return (_, type) => isNonNullType(type) && isListType(type.ofType)
    ? { valid: true }
    : { valid: false, supportedMsg: 'non nullable list types of any type' }
}

function supportAnyArray(): TypeSupportValidator {
  return (_, type) => isListType(type) || (isNonNullType(type) && isListType(type.ofType))
    ? { valid: true }
    : { valid: false, supportedMsg: 'list types of any type' };
}

// NOTE: This function makes the assumption that for the directive argument
// being merged, it is not "nullable with non-null default" in the supergraph
// schema (this kind of type/default combo is confusing and should be avoided,
// if possible). This assumption allows this function to replace null with
// undefined, which makes for a cleaner supergraph schema.
function mergeNullableValues<T>(
  mergeValues: (values: T[]) => T
): (values: (T | null | undefined)[]) => T | undefined {
  return (values: (T | null | undefined)[]) => {
    const nonNullValues = values.filter((v) => v !== null && v !== undefined) as T[];
    return nonNullValues.length > 0
      ? mergeValues(nonNullValues)
      : undefined;
  };
}

function unionValues(values: any[]): any {
  return values.reduce((acc, next) => {
    const newValues = next.filter((v1: any) => !acc.some((v2: any) => valueEquals(v1, v2)));
    return acc.concat(newValues);
  }, []);
}

export const ARGUMENT_COMPOSITION_STRATEGIES = {
  MAX: {
    name: 'MAX',
    isTypeSupported: supportFixedTypes((schema: Schema) => [new NonNullType(schema.intType())]),
    mergeValues: (values: number[]) => Math.max(...values),
  },
  MIN: {
    name: 'MIN',
    isTypeSupported: supportFixedTypes((schema: Schema) => [new NonNullType(schema.intType())]),
    mergeValues: (values: number[]) => Math.min(...values),
  },
  // NOTE: This doesn't work today because directive applications are de-duped
  // before being merged, we'd need to modify merge logic if we need this kind
  // of behavior.
  // SUM: {
  //   name: 'SUM',
  //   isTypeSupported: supportFixedTypes((schema: Schema) => [new NonNullType(schema.intType())]),
  //   mergeValues: (values: any[]) => values.reduce((acc, val) => acc + val, 0),
  // },
  INTERSECTION: {
    name: 'INTERSECTION',
    isTypeSupported: supportAnyNonNullArray(),
    mergeValues: (values: any[]) => values.reduce((acc, next) => {
      if (acc === undefined) {
        return next;
      } else {
        return acc.filter((v1: any) => next.some((v2: any) => valueEquals(v1, v2)));
      }  
    }, undefined) ?? [],
  },
  UNION: {
    name: 'UNION',
    isTypeSupported: supportAnyNonNullArray(),
    mergeValues: unionValues,
  },
  NULLABLE_AND: {
    name: 'NULLABLE_AND',
    isTypeSupported: supportFixedTypes((schema: Schema) => [
      schema.booleanType(),
      new NonNullType(schema.booleanType())
    ]),
    mergeValues: mergeNullableValues(
      (values: boolean[]) => values.every((v) => v)
    ),
  },
  NULLABLE_MAX: {
    name: 'NULLABLE_MAX',
    isTypeSupported: supportFixedTypes((schema: Schema) => [
      schema.intType(),
      new NonNullType(schema.intType())
    ]),
    mergeValues: mergeNullableValues(
      (values: number[]) => Math.max(...values)
    )
  },
  NULLABLE_UNION: {
    name: 'NULLABLE_UNION',
    isTypeSupported: supportAnyArray(),
    mergeValues: mergeNullableValues(unionValues),
  }
}
