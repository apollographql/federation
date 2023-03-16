import { InputType, ListType, NonNullType, Schema } from "./definitions"

export type ArgumentCompositionStrategy = {
  name: string,
  types: (schema: Schema) => InputType[],
  mergeValues: (values: any[]) => any,
}

export const ARGUMENT_COMPOSITION_STRATEGIES = {
  MAX: {
    name: 'MAX',
    types: (schema: Schema) => [new NonNullType(schema.intType())],
    mergeValues: (values: any[]) => Math.max(...values),
  },
  MIN: {
    name: 'MIN',
    types: (schema: Schema) => [new NonNullType(schema.intType())],
    mergeValues: (values: any[]) => Math.min(...values),
  },
  SUM: {
    name: 'SUM',
    types: (schema: Schema) => [new NonNullType(schema.intType())],
    mergeValues: (values: any[]) => values.reduce((acc, val) => acc + val, 0),
  },
  INTERSECTION: {
    name: 'INTERSECTION',
    types: (schema: Schema) => schema.builtInScalarTypes().map((t) => new NonNullType(new ListType(new NonNullType(t)))),
    mergeValues: (values: any[]) => values.reduce((acc, val) => acc.filter((v: any) => val.includes(v)), values[0]),
  },
  UNION: {
    name: 'UNION',
    types: (schema: Schema) => schema.builtInScalarTypes().map((t) => new NonNullType(new ListType(new NonNullType(t)))),
    mergeValues: (values: any[]) =>
      values.reduce((acc, val) => {
        const newValues = val.filter((v: any) => !acc.includes(v));
        return acc.concat(newValues);
      }, []),
  },
}
