import { InputType, ListType, NonNullType, Schema } from "./definitions"

export type ArgumentCompositionStrategy = {
  name: string,
  supportedTypes: (schema: Schema) => InputType[],
  mergeValues: (values: any[]) => any,
}

export const ARGUMENT_COMPOSITION_STRATEGIES = {
  MAX: {
    name: 'MAX',
    supportedTypes: (schema: Schema) => [new NonNullType(schema.intType())],
    mergeValues: (values: any[]) => Math.max(...values),
  },
  MIN: {
    name: 'MIN',
    supportedTypes: (schema: Schema) => [new NonNullType(schema.intType())],
    mergeValues: (values: any[]) => Math.min(...values),
  },
  SUM: {
    name: 'SUM',
    supportedTypes: (schema: Schema) => [new NonNullType(schema.intType())],
    mergeValues: (values: any[]) => values.reduce((acc, val) => acc + val, 0),
  },
  INTERSECTION: {
    name: 'INTERSECTION',
    supportedTypes: (schema: Schema) => schema.builtInScalarTypes().map((t) => new NonNullType(new ListType(new NonNullType(t)))),
    mergeValues: (values: any[]) => values.reduce((acc, val) => acc.filter((v: any) => val.includes(v)), values[0]),
  },
  UNION: {
    name: 'UNION',
    supportedTypes: (schema: Schema) => schema.builtInScalarTypes().map((t) => new NonNullType(new ListType(new NonNullType(t)))),
    mergeValues: (values: any[]) =>
      values.reduce((acc, val) => {
        const newValues = val.filter((v: any) => !acc.includes(v));
        return acc.concat(newValues);
      }, []),
  },
}
