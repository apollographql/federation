import { DirectiveLocation, GraphQLError } from "graphql";
import {
  ArgumentDefinition,
  DirectiveDefinition,
  InputType,
  isNonNullType,
  isObjectType,
  isUnionType,
  NamedType,
  ObjectType,
  OutputType,
  ScalarType,
  Schema,
  UnionType,
} from "./definitions";
import { ERRORS } from "./error";
import { valueEquals, valueToString } from "./values";
import { sameType } from "./types";
import { arrayEquals, assert } from "./utils";

export type DirectiveSpecification = {
  name: string,
  checkOrAdd: (schema: Schema, nameInSchema?: string, asBuiltIn?: boolean) => GraphQLError[],
}

export type TypeSpecification = {
  name: string,
  checkOrAdd: (schema: Schema, nameInSchema?: string, asBuiltIn?: boolean) => GraphQLError[],
}

export type ArgumentSpecification = [string, InputType, any?];

export type FieldSpecification = [string, OutputType, ArgumentSpecification[]];

export function createDirectiveSpecification({
  name,
  locations,
  repeatable = false,
  argumentFct = undefined,
}: {
  name: string,
  locations: DirectiveLocation[],
  repeatable?: boolean,
  argumentFct?: (schema: Schema) => ArgumentSpecification[],
}): DirectiveSpecification {
  return {
    name,
    checkOrAdd: (schema: Schema, nameInSchema?: string, asBuiltIn?: boolean) => {
      const args = argumentFct ? argumentFct(schema) : [];
      const actualName = nameInSchema ?? name;
      const existing = schema.directive(actualName);
      if (existing) {
        return ensureSameDirectiveStructure({name: actualName, locations, repeatable, args}, existing);
      } else {
        const directive = schema.addDirectiveDefinition(new DirectiveDefinition(actualName, asBuiltIn));
        directive.repeatable = repeatable;
        directive.addLocations(...locations);
        for (const [argName, argType, defaultValue] of args) {
          directive.addArgument(argName, argType, defaultValue);
        }
        return [];
      }
    },
  }
}

export function createScalarTypeSpecification({ name }: { name: string }): TypeSpecification {
  return {
    name,
    checkOrAdd: (schema: Schema, nameInSchema?: string, asBuiltIn?: boolean) => {
      const actualName = nameInSchema ?? name;
      const existing = schema.type(actualName);
      if (existing) {
        return ensureSameTypeKind('ScalarType', existing);
      } else {
        schema.addType(new ScalarType(actualName, asBuiltIn));
        return [];
      }
    },
  }
}

export function createObjectTypeSpecification({ 
  name,
  fieldsFct,
}: {
  name: string,
  fieldsFct: (schema: Schema) => FieldSpecification[],
}): TypeSpecification {
  return {
    name,
    checkOrAdd: (schema: Schema, nameInSchema?: string, asBuiltIn?: boolean) => {
      const actualName = nameInSchema ?? name;
      const expectedFields = fieldsFct(schema);
      const existing = schema.type(actualName);
      if (existing) {
        let errors = ensureSameTypeKind('ObjectType', existing);
        if (errors.length > 0) {
          return errors;
        }
        assert(isObjectType(existing), 'Should be an object type');
        for (const [expectedFieldName, expectedFieldType, expectedFieldArgs] of expectedFields) {
          const existingField = existing.field(expectedFieldName);
          if (!existingField) {
            errors = errors.concat(ERRORS.TYPE_DEFINITION_INVALID.err({
              message: `Invalid definition of type ${name}: missing field ${expectedFieldName}`,
              nodes: existing.sourceAST
            }));
            continue;
          }
          // We allow adding non-nullability because we've seen redefinition of the federation _Service type with type String! for the `sdl` field
          // and we don't want to break backward compatibility as this doesn't feel too harmful.
          let existingType = existingField.type!;
          if (!isNonNullType(expectedFieldType) && isNonNullType(existingType)) {
            existingType = existingType.ofType;
          }
          if (!sameType(expectedFieldType, existingType)) {
            errors = errors.concat(ERRORS.TYPE_DEFINITION_INVALID.err({
              message: `Invalid definition for field ${expectedFieldName} of type ${name}: should have type ${expectedFieldType} but found type ${existingField.type}`,
              nodes: existingField.sourceAST
            }));
          }
          errors = errors.concat(ensureSameArguments(
            { name: expectedFieldName, args: expectedFieldArgs},
            existingField,
            `field ${existingField.coordinate}`,
          ));
        }
        return errors;
      } else {
        const type = schema.addType(new ObjectType(actualName, asBuiltIn));
        for (const [fieldName, fieldType, fieldArgs] of expectedFields) {
          const field = type.addField(fieldName, fieldType);
          for (const [argName, argType, defaultValue] of fieldArgs) {
            field.addArgument(argName, argType, defaultValue);
          }
        }
        return [];
      }
    },
  }
}

export function createUnionTypeSpecification({ 
  name,
  membersFct,
}: {
  name: string,
  membersFct: (schema: Schema) => string[],
}): TypeSpecification {
  return {
    name,
    checkOrAdd: (schema: Schema, nameInSchema?: string, asBuiltIn?: boolean) => {
      const actualName = nameInSchema ?? name;
      const existing = schema.type(actualName);
      const expectedMembers = membersFct(schema).sort((n1, n2) => n1.localeCompare(n2));
      if (expectedMembers.length === 0) {
        if (existing) {
          return [ERRORS.TYPE_DEFINITION_INVALID.err({
            message: `Invalid definition of type ${name}: expected the union type to not exist/have no members but it is defined.`,
            nodes: existing.sourceAST
          })];
        }
        return [];
      }
      if (existing) {
        let errors = ensureSameTypeKind('UnionType', existing);
        if (errors.length > 0) {
          return errors;
        }
        assert(isUnionType(existing), 'Should be an union type');
        const actualMembers = existing.members().map(m => m.type.name).sort((n1, n2) => n1.localeCompare(n2));
        // This is kind of fragile in a core schema world where members may have been renamed, but we currently
        // only use this one for the _Entity type where that shouldn't be an issue.
        if (!arrayEquals(expectedMembers, actualMembers)) {
          errors = errors.concat(ERRORS.TYPE_DEFINITION_INVALID.err({
            message: `Invalid definition of type ${name}: expected members [${expectedMembers}] but found [${actualMembers}].`,
            nodes: existing.sourceAST
          }));
        }
        return errors;
      } else {
        const type = schema.addType(new UnionType(actualName, asBuiltIn));
        for (const member of expectedMembers) {
          type.addType(member);
        }
        return [];
      }
    },
  }
}

function ensureSameTypeKind(expected: NamedType['kind'], actual: NamedType): GraphQLError[] {
  return expected === actual.kind
    ? []
    : [ERRORS.TYPE_DEFINITION_INVALID.err({
      message: `Invalid definition for type ${actual.name}: ${actual.name} should be a ${expected} but is defined as a ${actual.kind}`,
      nodes: actual.sourceAST
    })];
}

function ensureSameDirectiveStructure(
  expected: {
    name: string,
    locations: DirectiveLocation[],
    repeatable: boolean,
    args: ArgumentSpecification[]
  },
  actual: DirectiveDefinition<any>,
): GraphQLError[] {
  let errors = ensureSameArguments(expected, actual, `directive ${expected}`);
  // It's ok to say you'll never repeat a repeatable directive. It's not ok to repeat one that isn't.
  if (!expected.repeatable && actual.repeatable) {
    errors = errors.concat(ERRORS.DIRECTIVE_DEFINITION_INVALID.err({
      message: `Invalid definition for directive ${expected}: ${expected} should${expected.repeatable ? "" : " not"} be repeatable`,
      nodes: actual.sourceAST
    }));
  }
  // Similarly, it's ok to say that you will never use a directive in some locations, but not that you will use it in places not allowed by what is expected.
  if (!actual.locations.every(loc => expected.locations.includes(loc))) {
    errors = errors.concat(ERRORS.DIRECTIVE_DEFINITION_INVALID.err({
      message: `Invalid efinition for directive ${expected}: ${expected} should have locations ${expected.locations.join(', ')}, but found (non-subset) ${actual.locations.join(', ')}`,
      nodes: actual.sourceAST
    }));
  }
  return errors;
}

function ensureSameArguments(
  expected: {
    name: string,
    args: ArgumentSpecification[]
  },
  actual: { argument(name: string): ArgumentDefinition<any> | undefined, arguments(): readonly ArgumentDefinition<any>[] },
  what: string,
): GraphQLError[] {
  const expectedArguments = expected.args;
  const foundArguments = actual.arguments();
  if (expectedArguments.length !== foundArguments.length) {
    return [ERRORS.DIRECTIVE_DEFINITION_INVALID.err({
      message: `Invalid definition for ${what}: should have ${expectedArguments.length} arguments but ${foundArguments.length} found`,
    })];
  }
  let errors: GraphQLError[] = [];
  for (const [expectedName, expectedType, expectedDefault] of expectedArguments) {
    const actualArgument = actual.argument(expectedName)!;
    let actualType = actualArgument.type!;
    if (isNonNullType(actualType) && !isNonNullType(expectedType)) {
      // It's ok to redefine an optional argument as mandatory. For instance, if you want to force people on your team to provide a "deprecation reason", you can
      // redefine @deprecated as `directive @deprecated(reason: String!)...` to get validation. In other words, you are allowed to always pass an argument that
      // is optional if you so wish.
      actualType = actualType.ofType;
    }
    if (!sameType(expectedType, actualType)) {
      errors = errors.concat(ERRORS.DIRECTIVE_DEFINITION_INVALID.err({
        message: `Invalid definition of ${what}: ${expectedName} should have type ${expectedType} but found type ${actualArgument.type!}`,
        nodes: actualArgument.sourceAST
      }));
    } else if (!isNonNullType(actualType) && !valueEquals(expectedDefault, actualArgument.defaultValue)) {
      errors = errors.concat(ERRORS.DIRECTIVE_DEFINITION_INVALID.err({
        message: `Invalid definition of ${what}: ${expectedName} should have default value ${valueToString(expectedDefault)} but found default value ${valueToString(actualArgument.defaultValue)}`,
        nodes: actualArgument.sourceAST
      }));
    }
  }
  return errors;
}

