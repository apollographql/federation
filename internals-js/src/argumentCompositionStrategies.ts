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
    if (!supported.some((t) => sameType(t, type))) {
      return { valid: false, supportedMsg: `type(s) ${supported.join(', ')}` };
    }
    return { valid: true };
  };
}

function supportAnyNonNullArray(): TypeSupportValidator {
  return (_, type) => {
    if (!isNonNullType(type) || !isListType(type.ofType)) {
      return { valid: false, supportedMsg: 'non nullable list types of any type'};
    }
    return { valid: true };
  };
}

export const ARGUMENT_COMPOSITION_STRATEGIES = {
  MAX: {
    name: 'MAX',
    isTypeSupported: supportFixedTypes((schema: Schema) => [new NonNullType(schema.intType())]),
    mergeValues: (values: any[]) => Math.max(...values),
  },
  MIN: {
    name: 'MIN',
    isTypeSupported: supportFixedTypes((schema: Schema) => [new NonNullType(schema.intType())]),
    mergeValues: (values: any[]) => Math.min(...values),
  },
  SUM: {
    name: 'SUM',
    isTypeSupported: supportFixedTypes((schema: Schema) => [new NonNullType(schema.intType())]),
    mergeValues: (values: any[]) => values.reduce((acc, val) => acc + val, 0),
  },
  INTERSECTION: {
    name: 'INTERSECTION',
    isTypeSupported: supportAnyNonNullArray(),
    mergeValues: (values: any[]) => values.reduce((acc, val) => acc.filter((v1: any) => val.some((v2: any) => valueEquals(v1, v2))), values[0]),
  },
  UNION: {
    name: 'UNION',
    isTypeSupported: supportAnyNonNullArray(),
    mergeValues: (values: any[]) =>
      values.reduce((acc, val) => {
        const newValues = val.filter((v1: any) => !acc.some((v2: any) => valueEquals(v1, v2)));
        return acc.concat(newValues);
      }, []),
  },
  NULLABLE_OR: {
    name: 'NULLABLE_OR',
    isTypeSupported: supportFixedTypes((schema: Schema) => [schema.booleanType()]),
    mergeValues: (values: (boolean | null | undefined)[]) => values.reduce((acc, next) => {
      if (acc === null || acc === undefined) {
        return next;
      } else if (next === null || next === undefined) {
        return acc;
      } else {
        return acc || next;
      }
    }),
  },
  NULLABLE_MAX: {
    name: 'NULLABLE_MAX',
    isTypeSupported: supportFixedTypes((schema: Schema) => [schema.intType(), new NonNullType(schema.intType())]),
    mergeValues: (values: any[]) => values.reduce((a: any, b: any) => a !== undefined && b !== undefined ? Math.max(a, b) : a ?? b, undefined),
  },
  NULLABLE_UNION: {
    name: 'NULLABLE_UNION',
    isTypeSupported: (_: Schema, type: InputType) => ({ valid: isListType(type) }),
    mergeValues: (values: any[][]) => {
      const combined = new Set();
      for (const subgraphValues of values) {
        for (const value of subgraphValues) {
          combined.add(value);
        }
      }
      return Array.from(combined);
    }
  }
}
