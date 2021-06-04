import deepEqual from 'deep-equal';
import { ArgumentDefinition, InputType, isEnumType, isInputObjectType, isListType, isNonNullType, isScalarType } from './definitions';
import { ArgumentNode, GraphQLError, Kind, valueFromASTUntyped, ValueNode } from 'graphql';
import { didYouMean, suggestionList } from './suggestions';
import { inspect } from 'util';

export function valueToString(v: any): string {
  if (v === undefined || v === null) {
    return "null";
  }

  if (Array.isArray(v)) {
    return '[' + v.map(e => valueToString(e)).join(', ') + ']';
  }

  if (typeof v === 'object') {
    return '{' + Object.keys(v).map(k => `${k}: ${valueToString(v[k])}`).join(', ') + '}';
  }

  if (typeof v === 'string') {
    return JSON.stringify(v);
  }

  return String(v);
}

export function valueEquals(a: any, b: any): boolean {
  return deepEqual(a, b);
}

function buildError(message: string): Error {
  // Maybe not the right error for this?
  return new Error(message);
}

export function applyDefaultValues(value: any, type: InputType): any {
  if (value === null) {
    if (isNonNullType(type)) {
      throw new GraphQLError(`Invalid null value for non-null type ${type} while computing default values`);
    }
    return null;
  }

  if (isNonNullType(type)) {
    return applyDefaultValues(value, type.ofType);
  }

  if (isListType(type)) {
    if (Array.isArray(value)) {
      return value.map(v => applyDefaultValues(v, type.ofType));
    } else {
      return applyDefaultValues(value, type.ofType);
    }
  }

  if (isInputObjectType(type)) {
    if (typeof value !== 'object') {
      throw new GraphQLError(`Expected value for type ${type} to be an object, but is ${typeof value}.`);
    }

    const updated = Object.create(null);
    for (const field of type.fields.values()) {
      if (!field.type) {
        throw buildError(`Cannot compute default value for field ${field.name} of ${type} as the field type is undefined`);
      }
      const fieldValue = value[field.name];
      if (fieldValue === undefined) {
        if (field.defaultValue !== undefined) {
          updated[field.name] = applyDefaultValues(field.defaultValue, field.type);
        } else if (isNonNullType(field.type)) {
          throw new GraphQLError(`Field "${field.name}" of required type ${type} was not provided.`);
        }
      } else {
        updated[field.name] = applyDefaultValues(fieldValue, field.type);
      }
    }

    // Ensure every provided field is defined.
    for (const fieldName of Object.keys(value)) {
      if (!type.fields.has(fieldName)) {
        const suggestions = suggestionList(fieldName, [...type.fields.keys()]);
        throw new GraphQLError(`Field "${fieldName}" is not defined by type "${type}".` + didYouMean(suggestions));
      }
    }
    return updated;
  }
  return value;
}

export function withDefaultValues(value: any, argument: ArgumentDefinition<any>): any {
  if (!argument.type) {
    throw buildError(`Cannot compute default value for argument ${argument} as the type is undefined`);
  }
  if (value === undefined) {
    if (argument.defaultValue) {
      return applyDefaultValues(argument.defaultValue ?? null, argument.type);
    }
  }
  return applyDefaultValues(value, argument.type);
}

const integerStringRegExp = /^-?(?:0|[1-9][0-9]*)$/;

// Adapted from the `astFromValue` function in graphQL-js
export function valueToAST(value: any, type: InputType): ValueNode | null {
  if (isNonNullType(type)) {
    const astValue = valueToAST(value, type.ofType);
    return astValue?.kind === Kind.NULL ? null : astValue;
  }

  // only explicit null, not undefined, NaN
  if (value === null) {
    return { kind: Kind.NULL };
  }

  if (value === undefined) {
    return null;
  }

  // Convert JavaScript array to GraphQL list. If the GraphQLType is a list, but
  // the value is not an array, convert the value using the list's item type.
  if (isListType(type)) {
    const itemType: InputType = type.ofType;
    const items = Array.from(value);
    if (items != null) {
      const valuesNodes = [];
      for (const item of items) {
        const itemNode = valueToAST(item, itemType);
        if (itemNode != null) {
          valuesNodes.push(itemNode);
        }
      }
      return { kind: Kind.LIST, values: valuesNodes };
    }
    return valueToAST(value, itemType);
  }

  // Populate the fields of the input object by creating ASTs from each value
  // in the JavaScript object according to the fields in the input type.
  if (isInputObjectType(type)) {
    if (typeof value !== 'object') {
      return null;
    }
    const fieldNodes = [];
    for (const field of type.fields.values()) {
      if (!field.type) {
        return null;
      }
      const fieldValue = valueToAST(value[field.name], field.type);
      if (fieldValue) {
        fieldNodes.push({
          kind: Kind.OBJECT_FIELD,
          name: { kind: Kind.NAME, value: field.name },
          value: fieldValue,
        });
      }
    }
    return { kind: Kind.OBJECT, fields: fieldNodes };
  }

  // TODO: we may have to handle some coercions (not sure it matters in our use case
  // though).

  if (typeof value === 'boolean') {
    return { kind: Kind.BOOLEAN, value: value };
  }

  if (typeof value === 'number' && isFinite(value)) {
    const stringNum = String(value);
    return integerStringRegExp.test(stringNum)
      ? { kind: Kind.INT, value: stringNum }
      : { kind: Kind.FLOAT, value: stringNum };
  }

  if (typeof value === 'string') {
    // Enum types use Enum literals.
    if (isEnumType(type)) {
      return { kind: Kind.ENUM, value: value };
    }

    // ID types can use Int literals.
    if (type === type.schema()?.idType() && integerStringRegExp.test(value)) {
      return { kind: Kind.INT, value: value };
    }

    return {
      kind: Kind.STRING,
      value: value,
    };
  }

  throw new Error("Invalid value, cannot be converted to AST: " + inspect(value));
}

export function isValidValue(value: any, type: InputType): boolean {
  if (isNonNullType(type)) {
    return value !== null && isValidValue(value, type.ofType);
  }

  if (value === null) {
    return true;
  }

  if (isListType(type)) {
    const itemType: InputType = type.ofType;
    if (Array.isArray(value)) {
      return value.every(item => isValidValue(item, itemType));
    }
    // Equivalent of coercing non-null element as a list of one.
    return isValidValue(value, itemType);
  }

  if (isInputObjectType(type)) {
    if (typeof value !== 'object') {
      return false;
    }
    return [...type.fields.values()].every(field => isValidValue(value[field.name], field.type!));
  }

  // TODO: we may have to handle some coercions (not sure it matters in our use case
  // though).

  if (typeof value === 'boolean') {
    return type === type.schema()?.booleanType();
  }

  if (typeof value === 'number' && isFinite(value)) {
    const stringNum = String(value);
    if (type === type.schema()?.intType()) {
      return integerStringRegExp.test(stringNum);
    }
    return type === type.schema()?.floatType();
  }

  if (typeof value === 'string') {
    if (isEnumType(type)) {
      return type.value(value) !== undefined;
    }
    return isScalarType(type)
      && type !== type.schema()?.booleanType()
      && type !== type.schema()?.intType()
      && type !== type.schema()?.floatType();
  }
  return false;
}

export function astArgumentsToValues(args: readonly ArgumentNode[] | undefined): {[key: string]: any} {
  const values = Object.create(null);
  if (args) {
    for (const argNode of args) {
      values[argNode.name.value] = valueFromASTUntyped(argNode.value);
    }
  }
  return values;
}
