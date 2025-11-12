import {InputType, NonNullType, Schema, isListType, isNonNullType} from "./definitions"
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

function supportAnyNonNullNestedArray(): TypeSupportValidator {
  return (_, type) =>
    isNonNullType(type) && isListType(type.ofType)
      && isNonNullType(type.ofType.ofType) && isListType(type.ofType.ofType.ofType)
        ? { valid: true }
        : { valid: false, supportedMsg: 'non nullable nested list types of any type' }
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

/**
 * Performs conjunction of 2d arrays that represent conditions in Disjunctive Normal Form.
 *
 * Each 2D array is interpreted as follows
 * * Inner array is interpreted as the conjunction (an AND) of the conditions in the array.
 * * Outer array is interpreted as the disjunction (an OR) of the inner arrays.
 *
 * Algorithm
 * * filter out duplicate entries to limit the amount of necessary computations
 * * calculate cartesian product of the arrays to find all possible combinations
 *   * simplify combinations by dropping duplicate conditions (i.e. p ^ p = p, p ^ q = q ^ p)
 * * eliminate entries that are subsumed by others (i.e. (p ^ q) subsumes (p ^ q ^ r))
 */
export function dnfConjunction<T>(values: T[][][]): T[][] {
  // should never be the case
  if (values.length == 0) {
    return [];
  }

  // Copy the 2D arrays, as we'll be modifying them below (due to sorting).
  for (let i = 0; i < values.length; i++) {
    // See the doc string for `convertEmptyToTrue()` to understand why this is
    // necessary.
    values[i] = convertEmptyToTrue(dnfCopy(values[i]));
  }

  // we first filter out duplicate values from candidates
  // this avoids exponential computation of exactly the same conditions
  const filtered = filterNestedArrayDuplicates(values);

  // initialize with first entry
  let result: T[][] = filtered[0];
  // perform cartesian product to find all possible entries
  for (let i = 1; i < filtered.length; i++) {
    const current = filtered[i];
    const accumulator: T[][] = [];
    const seen = new Set<string>;

    for (const accElement of result) {
      for (const currentElement of current) {
        // filter out elements that are already present in accElement
        const filteredElement = currentElement.filter((e) => !accElement.includes(e));
        const candidate = [...accElement, ...filteredElement].sort();
        const key = JSON.stringify(candidate);
        // only add entries which has not been seen yet
        if (!seen.has(key)) {
          seen.add(key);
          accumulator.push(candidate);
        }
      }
    }
    // Now we need to deduplicate the results. Given that
    // - outer array implies OR requirements
    // - inner array implies AND requirements
    // We can filter out any inner arrays that fully contain other inner arrays, i.e.
    //   A OR B OR (A AND B) OR (A AND B AND C) => A OR B
    result = deduplicateSubsumedValues(accumulator);
  }
  return result;
}

function filterNestedArrayDuplicates<T>(values: T[][][]): T[][][] {
  const filtered: T[][][] = [];
  const seen = new Set<string>;
  values.forEach((value) => {
    value.forEach((inner) => {
      inner.sort();
    })
    value.sort((a, b) => {
      const left = JSON.stringify(a);
      const right = JSON.stringify(b);
      return left > right ? 1 : left < right ? -1 : 0;
    });
    const key = JSON.stringify(value);
    if (!seen.has(key)) {
      seen.add(key);
      filtered.push(value);
    }
  });
  return filtered;
}

function deduplicateSubsumedValues<T>(values: T[][]): T[][] {
  const result: T[][] = [];
  // we first sort by length as the longer ones might be dropped
  values.sort((first, second) => {
    if (first.length < second.length) {
      return -1;
    } else if (first.length > second.length) {
      return 1;
    } else {
      return 0;
    }
  });

  for (const candidate of values) {
    const entry = new Set(candidate);
    let redundant = false;
    for (const r of result) {
      if (r.every(e => entry.has(e))) {
        // if `r` is a subset of a `candidate` then it means `candidate` is redundant
        redundant = true;
        break;
      }
    }

    if (!redundant) {
      result.push(candidate);
    }
  }
  return result;
}

function dnfCopy<T>(value: T[][]): T[][] {
  const newValue = new Array(value.length);
  for (let i = 0; i < value.length; i++) {
    newValue[i] = value[i].slice();
  }
  return newValue;
}

/**
 * Normally for DNF, you'd consider [] to be always false and [[]] to be always
 * true, and code that uses some()/every() needs no special-casing to work with
 * these definitions. However, router special-cases [] to also mean true, and so
 * if we're about to do any evaluation on DNFs, we need to do these conversions
 * beforehand.
 */
export function convertEmptyToTrue<T>(value: T[][]): T[][] {
  return value.length === 0 ? [[]] : value;
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
    mergeValues:
        mergeNullableValues(
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
  },
  DNF_CONJUNCTION: {
    name: 'DNF_CONJUNCTION',
    isTypeSupported: supportAnyNonNullNestedArray(),
    mergeValues: dnfConjunction
  }
}
