import {
  ArgumentDefinition,
  EnumType,
  InputFieldDefinition,
  InputObjectType,
  InputType,
  isBooleanType,
  isCustomScalarType,
  isEnumType,
  isFloatType,
  isIDType,
  isInputObjectType,
  isIntType,
  isListType,
  isNonNullType,
  isScalarType,
  isStringType,
  isVariable,
  ScalarType,
  Schema,
  Variable,
  VariableCollector,
  VariableDefinition,
  VariableDefinitions,
} from './definitions';
import {
  ArgumentNode,
  GraphQLError,
  Kind,
  print,
  ValueNode,
  ObjectFieldNode,
  ConstValueNode,
  ConstObjectFieldNode,
} from 'graphql';
import { didYouMean, suggestionList } from './suggestions';
import { inspect } from 'util';
import { sameType } from './types';
import { assert, assertUnreachable } from './utils';
import { ERRORS } from './error';

// Per-GraphQL spec, max and value for an Int type.
const MAX_INT = 2147483647;
const MIN_INT = -2147483648;

/**
 * Converts a graphQL value into it's textual representation.
 *
 * @param v - the value to convert/display. This method assumes that it is a value graphQL
 *   value (essentially, one that could have been produced by `valueFromAST`/`valueFormASTUntyped`).
 *   If this is not the case, the behaviour is unspecified, and in particular this method may
 *   throw or produce an output that is not valid graphQL syntax.
 * @param expectedType - the type of the value being converted. This is optional is only used to
 *   ensure enum values are displayed as such and not as strings. In other words, the type of
 *   the value should be provided when possible (when the value is known to be of a ype) but
 *   using this method without a type is useful to dispaly the value in error/debug messages
 *   where no type may be known. Note that if `v` is not a valid value for `expectedType`,
 *   this method will not throw but enum values may be represented by strings in the output.
 * @return a textual representation of the value. It is guaranteed to  be valid graphQL syntax
 *   if the input value is a valid graphQL value.
 */
export function valueToString(v: any, expectedType?: InputType): string {
  if (v === undefined || v === null) {
    return "null";
  }

  if (expectedType && isNonNullType(expectedType)) {
    return valueToString(v, expectedType.ofType);
  }

  if (expectedType && isCustomScalarType(expectedType)) {
    // If the expected type is a custom scalar, we can't really infer anything from it.
    expectedType = undefined;
  }

  if (isVariable(v)) {
    return v.toString();
  }

  if (Array.isArray(v)) {
    let elementsType: InputType | undefined = undefined;
    // If the expected type is not a list, we've been given an invalid type. We don't want this
    // method to fail though, so we just ignore the provided type from that point one (passing
    // `undefined` to the recursion).
    if (expectedType && isListType(expectedType)) {
      elementsType = expectedType.ofType;
    }
    return '[' + v.map(e => valueToString(e, elementsType)).join(', ') + ']';
  }

  // We know the value is not a list/array. But if the type is a list, we still want to print
  // the value correctly, at least as long as it's a valid value for the element type, since
  // list input coercions may allow this.
  if (expectedType && isListType(expectedType)) {
    return valueToString(v, expectedType.ofType);
  }

  if (typeof v === 'object') {
    if (expectedType && !isInputObjectType(expectedType)) {
      // expectedType does not match the value, we ignore it for what remains.
      expectedType = undefined;
    }
    return '{' + Object.keys(v).map(k => {
      const valueType = expectedType ? (expectedType as InputObjectType).field(k)?.type : undefined;
      return `${k}: ${valueToString(v[k], valueType)}`;
    }).join(', ') + '}';
  }

  if (typeof v === 'string') {
    if (expectedType) {
      if (isEnumType(expectedType)) {
        // If the value is essentially invalid (not one of the enum value), then we display it as a string. This
        // avoid strange syntax errors if the string itself is not even valid graphQL. Note that validation will
        // reject such a value at some point with a proper error message, but this isn't the right place to error
        // out and generate something syntactially invalid is dodgy (in particular because the input from which this
        // value comes was probably syntactially valid, so the value was probably inputed as a string there).
        return expectedType.value(v) ? v : JSON.stringify(v);
      }
      if (expectedType === expectedType.schema().idType() && integerStringRegExp.test(v)) {
        return v;
      }
    }
    return JSON.stringify(v);
  }

  return String(v);
}

// Fundamentally a deep-equal, but the generic 'deep-equal' was showing up on profiling and
// as we know our values can only so many things, we can do faster fairly simply.
export function valueEquals(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a)) {
    return Array.isArray(b) && arrayValueEquals(a, b) ;
  }
  // Note that typeof null === 'object', so we have to manually rule that out
  // here.
  if (a !== null && typeof a === 'object') {
    return b !== null && typeof b === 'object' && objectEquals(a, b);
  }
  return a === b;
}

function arrayValueEquals(a: any[], b: any[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; ++i) {
    if (!valueEquals(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

function objectEquals(a: {[key: string]: any}, b: {[key: string]: any}): boolean {
  const keys1 = Object.keys(a);
  const keys2 = Object.keys(b);
  if (keys1.length != keys2.length) {
    return false;
  }
  for (const key of keys1) {
    const v1 = a[key];
    const v2 = b[key];
    // Beware of false-negative due to getting undefined because the property is not
    // in args2.
    if (v2 === undefined && !keys2.includes(key)) {
      return false;
    }
    if (!valueEquals(v1, v2)) {
      return false;
    }
  }
  return true;
}

export function argumentsEquals(args1: {[key: string]: any}, args2: {[key: string]: any}): boolean {
  if (args1 === args2) {
    return true;
  }
  return objectEquals(args1, args2);
}

function buildError(message: string): Error {
  // Maybe not the right error for this?
  return new Error(message);
}

function applyDefaultValues(value: any, type: InputType): any {
  if (isVariable(value)) {
    return value;
  }

  if (value === null) {
    if (isNonNullType(type)) {
      throw ERRORS.INVALID_GRAPHQL.err(`Invalid null value for non-null type ${type} while computing default values`);
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
      throw ERRORS.INVALID_GRAPHQL.err(`Expected value for type ${type} to be an object, but is ${typeof value}.`);
    }

    const updated = Object.create(null);
    for (const field of type.fields()) {
      if (!field.type) {
        throw buildError(`Cannot compute default value for field ${field.name} of ${type} as the field type is undefined`);
      }
      const fieldValue = value[field.name];
      if (fieldValue === undefined) {
        if (field.defaultValue !== undefined) {
          updated[field.name] = applyDefaultValues(field.defaultValue, field.type);
        } else if (!isNonNullType(field.type)) {
          updated[field.name] = null;
        } else {
          throw ERRORS.INVALID_GRAPHQL.err(`Required field "${field.name}" of type ${type} was not provided.`);
        }
      } else {
        updated[field.name] = applyDefaultValues(fieldValue, field.type);
      }
    }

    // Ensure every provided field is defined.
    for (const fieldName of Object.keys(value)) {
      if (!type.field(fieldName)) {
        const suggestions = suggestionList(fieldName, type.fields().map(f => f.name));
        throw ERRORS.INVALID_GRAPHQL.err(`Field "${fieldName}" is not defined by type "${type}".` + didYouMean(suggestions));
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
    if (argument.defaultValue !== undefined) {
      return applyDefaultValues(argument.defaultValue, argument.type);
    } else if (!isNonNullType(argument.type)) {
      return null;
    } else {
      throw ERRORS.INVALID_GRAPHQL.err(`Required argument "${argument.coordinate}" was not provided.`);
    }
  }
  return applyDefaultValues(value, argument.type);
}

const integerStringRegExp = /^-?(?:0|[1-9][0-9]*)$/;

function objectFieldNodeToConst(field: ObjectFieldNode): ConstObjectFieldNode {
  return { ...field, value: valueNodeToConstValueNode(field.value) };
}

/**
 * Transforms a ValueNode to a ConstValueNode. This should only be invoked when we know that the value node can be const
 * as it will result in an exception if it contains a VariableNode
 */
export function valueNodeToConstValueNode(value: ValueNode): ConstValueNode {
  if (value.kind === Kind.NULL
    || value.kind === Kind.INT
    || value.kind === Kind.FLOAT
    || value.kind === Kind.STRING
    || value.kind === Kind.BOOLEAN
    || value.kind === Kind.ENUM
    ) {
    return value;
  }
  if (value.kind === Kind.LIST) {
    const constValues = value.values.map(v => valueNodeToConstValueNode(v));
    return { ...value, values: constValues };
  }
  if (value.kind === Kind.OBJECT) {
    const constFields = value.fields.map(f => objectFieldNodeToConst(f));
    return { ...value, fields: constFields };
  }
  if (value.kind === Kind.VARIABLE) {
    // VarableNode does not exist in ConstValueNode
    throw new Error('Unexpected VariableNode in const AST');
  }
  assertUnreachable(value);
}

// Adapted from the `astFromValue` function in graphQL-js
export function valueToAST(value: any, type: InputType): ValueNode | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isNonNullType(type)) {
    const astValue = valueToAST(value, type.ofType);
    if (astValue?.kind === Kind.NULL) {
      throw buildError(`Invalid null value ${valueToString(value)} for non-null type ${type}`);
    }
     return astValue;
  }

  // only explicit null, not undefined, NaN
  if (value === null) {
    return { kind: Kind.NULL };
  }

  if (isVariable(value)) {
    return { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: value.name } };
  }

  if (isCustomScalarType(type)) {
    return valueToASTUntyped(value);
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
      throw buildError(`Invalid non-objet value for input type ${type}, cannot be converted to AST: ${inspect(value, true, 10, true)}`);
    }
    const fieldNodes: ObjectFieldNode[] = [];
    for (const field of type.fields()) {
      if (!field.type) {
        throw buildError(`Cannot convert value ${valueToString(value)} as field ${field} has no type set`);
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
    if (type === type.schema().idType() && integerStringRegExp.test(value)) {
      return { kind: Kind.INT, value: value };
    }

    return {
      kind: Kind.STRING,
      value: value,
    };
  }

  throw buildError(`Invalid value for type ${type}, cannot be converted to AST: ${inspect(value)}`);
}

function valueToASTUntyped(value: any): ValueNode | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return { kind: Kind.NULL };
  }

  if (isVariable(value)) {
    return { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: value.name } };
  }

  // Convert JavaScript array to GraphQL list. If the GraphQLType is a list, but
  // the value is not an array, convert the value using the list's item type.
  if (Array.isArray(value)) {
    const valuesNodes = [];
    for (const item of value) {
      const itemNode = valueToASTUntyped(item);
      if (itemNode !== undefined) {
        valuesNodes.push(itemNode);
      }
    }
    return { kind: Kind.LIST, values: valuesNodes };
  }

  if (typeof value === 'object') {
    const fieldNodes: ObjectFieldNode[] = [];
    for (const key of Object.keys(value)) {
      const fieldValue = valueToASTUntyped(value[key]);
      if (fieldValue) {
        fieldNodes.push({
          kind: Kind.OBJECT_FIELD,
          name: { kind: Kind.NAME, value: key },
          value: fieldValue,
        });
      }
    }
    return { kind: Kind.OBJECT, fields: fieldNodes };
  }

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
    return { kind: Kind.STRING, value: value };
  }

  throw buildError(`Invalid value, cannot be converted to AST: ${inspect(value, true, 10, true)}`);
}

// see https://spec.graphql.org/draft/#IsVariableUsageAllowed()
function isValidVariable(variable: VariableDefinition, locationType: InputType, locationDefault: any): boolean {
  const variableType = variable.type;

  if (isNonNullType(locationType) && !isNonNullType(variableType)) {
    const hasVariableDefault = variable.defaultValue !== undefined && variable.defaultValue !== null;
    const hasLocationDefault = locationDefault !== undefined;
    if (!hasVariableDefault && !hasLocationDefault) {
      return false;
    }
    return areTypesCompatible(variableType, locationType.ofType);
  }

  return areTypesCompatible(variableType, locationType);
}

// see https://spec.graphql.org/draft/#AreTypesCompatible()
function areTypesCompatible(variableType: InputType, locationType: InputType): boolean {
  if (isNonNullType(locationType)) {
    if (!isNonNullType(variableType)) {
      return false;
    }
    return areTypesCompatible(variableType.ofType, locationType.ofType);
  }
  if (isNonNullType(variableType)) {
    return areTypesCompatible(variableType.ofType, locationType);
  }
  if (isListType(locationType)) {
    if (!isListType(variableType)) {
      return false;
    }
    return areTypesCompatible(variableType.ofType, locationType.ofType);
  }
  return !isListType(variableType) && sameType(variableType, locationType);
}

export function isValidValue(value: any, argument: ArgumentDefinition<any> | InputFieldDefinition, variableDefinitions: VariableDefinitions): boolean {
  return isValidValueApplication(value, argument.type!, argument.defaultValue, variableDefinitions);
}

export function isValidValueApplication(value: any, locationType: InputType, locationDefault: any, variableDefinitions: VariableDefinitions): boolean {
  // Note that this needs to be first, or the recursive call within 'isNonNullType' would break for variables
  if (isVariable(value)) {
    const definition = variableDefinitions.definition(value);
    return !!definition && isValidVariable(definition, locationType, locationDefault);
  }

  if (isNonNullType(locationType)) {
    return value !== null && isValidValueApplication(value, locationType.ofType, undefined, variableDefinitions);
  }

  if (value === null || value === undefined) {
    return true;
  }

  if (isListType(locationType)) {
    const itemType: InputType = locationType.ofType;
    if (Array.isArray(value)) {
      return value.every(item => isValidValueApplication(item, itemType, undefined, variableDefinitions));
    }
    // Equivalent of coercing non-null element as a list of one.
    return isValidValueApplication(value, itemType, locationDefault, variableDefinitions);
  }

  if (isInputObjectType(locationType)) {
    if (typeof value !== 'object') {
      return false;
    }
    const valueKeys = new Set(Object.keys(value));
    const fieldsAreValid = locationType.fields().every(field => {
      valueKeys.delete(field.name);
      return isValidValueApplication(value[field.name], field.type!, field.defaultValue, variableDefinitions)
    });
    const hasUnexpectedField = valueKeys.size !== 0
    return fieldsAreValid && !hasUnexpectedField;
  }

  // TODO: we may have to handle some coercions (not sure it matters in our use case
  // though).
  return isValidLeafValue(locationType.schema(), value, locationType);
}

export function valueFromAST(node: ValueNode, expectedType: InputType): any {
  if (node.kind === Kind.NULL) {
    if (isNonNullType(expectedType)) {
      throw ERRORS.INVALID_GRAPHQL.err(`Invalid null value for non-null type "${expectedType}"`);
    }
    return null;
  }

  if (node.kind === Kind.VARIABLE) {
    return new Variable(node.name.value);
  }

  if (isNonNullType(expectedType)) {
    expectedType = expectedType.ofType;
  }

  if (isListType(expectedType)) {
    const baseType = expectedType.ofType;
    if (node.kind === Kind.LIST) {
      return node.values.map(v => valueFromAST(v, baseType));
    }
    return [valueFromAST(node, baseType)];
  }

  if (isIntType(expectedType)) {
    if (node.kind !== Kind.INT) {
      throw ERRORS.INVALID_GRAPHQL.err(`Int cannot represent non-integer value ${print(node)}.`);
    }
    const i = parseInt(node.value, 10);
    if (i > MAX_INT || i < MIN_INT) {
      throw ERRORS.INVALID_GRAPHQL.err(`Int cannot represent non 32-bit signed integer value ${i}.`);
    }
    return i;
  }

  if (isFloatType(expectedType)) {
    let parsed: number;
    if (node.kind === Kind.INT) {
      parsed = parseInt(node.value, 10);
    } else if (node.kind === Kind.FLOAT) {
      parsed = parseFloat(node.value);
    } else {
      throw ERRORS.INVALID_GRAPHQL.err(`Float can only represent integer or float value, but got a ${node.kind}.`);
    }
    if (!isFinite(parsed)) {
      throw ERRORS.INVALID_GRAPHQL.err( `Float cannot represent non numeric value ${parsed}.`);
    }
    return parsed;
  }

  if (isBooleanType(expectedType)) {
    if (node.kind !== Kind.BOOLEAN) {
      throw ERRORS.INVALID_GRAPHQL.err(`Boolean cannot represent a non boolean value ${print(node)}.`);
    }
    return node.value;
  }

  if (isStringType(expectedType)) {
    if (node.kind !== Kind.STRING) {
      throw ERRORS.INVALID_GRAPHQL.err(`String cannot represent non string value ${print(node)}.`);
    }
    return node.value;
  }

  if (isIDType(expectedType)) {
    if (node.kind !== Kind.STRING && node.kind !== Kind.INT) {
      throw ERRORS.INVALID_GRAPHQL.err(`ID cannot represent value ${print(node)}.`);
    }
    return node.value;
  }

  if (isScalarType(expectedType)) {
    return valueFromASTUntyped(node);
  }

  if (isInputObjectType(expectedType)) {
    if (node.kind !== Kind.OBJECT) {
      throw ERRORS.INVALID_GRAPHQL.err(`Input Object Type ${expectedType} cannot represent non-object value ${print(node)}.`);
    }
    const obj = Object.create(null);
    for (const f of node.fields) {
      const name = f.name.value;
      const field = expectedType.field(name);
      if (!field) {
        throw ERRORS.INVALID_GRAPHQL.err(`Unknown field "${name}" found in value for Input Object Type "${expectedType}".`);
      }
      // TODO: as we recurse in sub-objects, we may get an error on a field value deep in the object
      // and the error will not be precise to where it happens. We could try to build the path to
      // the error and include it in the error somehow.
      obj[name] = valueFromAST(f.value, field.type!);
    }
    return obj;
  }

  if (isEnumType(expectedType)) {
    if (node.kind !== Kind.STRING && node.kind !== Kind.ENUM) {
      throw ERRORS.INVALID_GRAPHQL.err(`Enum Type ${expectedType} cannot represent value ${print(node)}.`);
    }
    if (!expectedType.value(node.value)) {
      throw ERRORS.INVALID_GRAPHQL.err(`Enum Type ${expectedType} has no value ${node.value}.`);
    }
    return node.value;
  }

  assert(false, () => `Unexpected input type ${expectedType} of kind ${expectedType.kind}.`);
}

export function valueFromASTUntyped(node: ValueNode): any {
  switch (node.kind) {
    case Kind.NULL:
      return null;
    case Kind.INT:
      return parseInt(node.value, 10);
    case Kind.FLOAT:
      return parseFloat(node.value);
    case Kind.STRING:
    case Kind.ENUM:
    case Kind.BOOLEAN:
      return node.value;
    case Kind.LIST:
      return node.values.map(valueFromASTUntyped);
    case Kind.OBJECT:
      const obj = Object.create(null);
      node.fields.forEach(f => obj[f.name.value] = valueFromASTUntyped(f.value));
      return obj;
    case Kind.VARIABLE:
      return new Variable(node.name.value);
  }
}

export function isValidLeafValue(schema: Schema, value: any, type: ScalarType | EnumType): boolean {
  if (isCustomScalarType(type)) {
    // There is no imposition on what a custom scalar value can be.
    return true;
  }

  if (typeof value === 'boolean') {
    return type === schema.booleanType();
  }

  if (typeof value === 'number' && isFinite(value)) {
    const stringNum = String(value);
    if (type === schema.intType() || type === schema.idType()) {
      return integerStringRegExp.test(stringNum);
    }
    return type === schema.floatType();
  }

  if (typeof value === 'string') {
    if (isEnumType(type)) {
      return type.value(value) !== undefined;
    }
    return type !== schema.booleanType()
      && type !== schema.intType()
      && type !== schema.floatType();
  }
  return false;
}

export function argumentsFromAST(
  context: string,
  args: readonly ArgumentNode[] | undefined,
  argsDefiner: { argument(name: string): ArgumentDefinition<any> | undefined }
): {[key: string]: any} | undefined {
  if (!args || args.length === 0) {
    return undefined;
  }

  const values = Object.create(null);
  for (const argNode of args) {
    const name = argNode.name.value;
    const expectedType = argsDefiner.argument(name)?.type;
    if (!expectedType) {
      throw ERRORS.INVALID_GRAPHQL.err(
        `Unknown argument "${name}" found in value: "${context}" has no argument named "${name}"`
      );
    }
    try {
      values[name] = valueFromAST(argNode.value, expectedType);
    } catch (e) {
      if (e instanceof GraphQLError) {
        throw ERRORS.INVALID_GRAPHQL.err(`Invalid value for argument "${name}": ${e.message}`);
      }
      throw e;
    }
  }
  return values;
}

export function collectVariablesInValue(value: any, collector: VariableCollector) {
  if (isVariable(value)) {
    collector.add(value);
    return;
  }

  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(v => collectVariablesInValue(v, collector));
  }

  if (typeof value === 'object') {
    Object.keys(value).forEach(k => collectVariablesInValue(value[k], collector));
  }
}
