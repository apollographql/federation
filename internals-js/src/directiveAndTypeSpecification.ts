import { ASTNode, DirectiveLocation, GraphQLError } from "graphql";
import {
  ArgumentDefinition,
  CoreFeature,
  DirectiveDefinition,
  EnumType,
  InputType,
  isCustomScalarType,
  isEnumType,
  isListType,
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
import { ArgumentCompositionStrategy } from "./argumentCompositionStrategies";
import { FeatureDefinition, FeatureVersion } from "./specs/coreSpec";
import { Subgraph } from '.';

export type DirectiveSpecification = {
  name: string,
  checkOrAdd: (schema: Schema, feature?: CoreFeature, asBuiltIn?: boolean) => GraphQLError[],
  composition?: DirectiveCompositionSpecification,
}

export type DirectiveCompositionSpecification = {
  supergraphSpecification: (federationVersion: FeatureVersion) => FeatureDefinition,
  argumentsMerger?: (schema: Schema, feature: CoreFeature) => ArgumentMerger | GraphQLError,
  staticArgumentTransform?: StaticArgumentsTransform,
}

export type StaticArgumentsTransform = (subgraph: Subgraph, args: Readonly<{[key: string]: any}>) => Readonly<{[key: string]: any}>;

export type ArgumentMerger = {
  merge: (argName: string, values: any[]) => any,
  toString: () => string,
}

export type TypeSpecification = {
  name: string,
  checkOrAdd: (schema: Schema, feature?: CoreFeature, asBuiltIn?: boolean) => GraphQLError[],
}

export type ArgumentSpecification = {
  name: string,
  type: (schema: Schema, feature?: CoreFeature) => InputType | GraphQLError[],
  defaultValue?: any,
}

export type DirectiveArgumentSpecification = ArgumentSpecification & {
  compositionStrategy?: ArgumentCompositionStrategy,
}

export type FieldSpecification = {
  name: string,
  type: OutputType,
  args?: ResolvedArgumentSpecification[],
}

type ResolvedArgumentSpecification = {
  name: string,
  type: InputType,
  defaultValue?: any,
}

export function createDirectiveSpecification({
  name,
  locations,
  repeatable = false,
  args = [],
  composes = false,
  supergraphSpecification = undefined,
  staticArgumentTransform = undefined,
}: {
  name: string,
  locations: DirectiveLocation[],
  repeatable?: boolean,
  args?: DirectiveArgumentSpecification[],
  composes?: boolean,
  supergraphSpecification?: (fedVersion: FeatureVersion) => FeatureDefinition,
  staticArgumentTransform?: (subgraph: Subgraph, args: {[key: string]: any}) => {[key: string]: any},
}): DirectiveSpecification {
  let composition: DirectiveCompositionSpecification | undefined = undefined;
  if (composes) {
    assert(supergraphSpecification, `Should provide a @link specification to use in supergraph for directive @${name} if it composes`);
    const argStrategies = new Map(args.filter((arg) => arg.compositionStrategy).map((arg) => [arg.name, arg.compositionStrategy!]));
    let argumentsMerger: ((schema: Schema, feature: CoreFeature) => ArgumentMerger | GraphQLError) | undefined = undefined;
    if (argStrategies.size > 0) {
      assert(!repeatable, () => `Invalid directive specification for @${name}: @${name} is repeatable and should not define composition strategy for its arguments`);
      assert(argStrategies.size === args.length, () => `Invalid directive specification for @${name}: not all arguments define a composition strategy`);
      argumentsMerger = (schema, feature) => {
        // Validate that the arguments have compatible types with the declared strategies (a bit unfortunate that we can't do this until
        // we have a schema but well, not a huge deal either).
        for (const { name: argName, type } of args) {
          const strategy = argStrategies.get(argName);
          // Note that we've built `argStrategies` from the declared args and checked that all argument had a strategy, so it would be
          // a bug in the code if we didn't get a strategy (not an issue in the directive declaration).
          assert(strategy, () => `Should have a strategy for ${argName}`);
          const argType = type(schema, feature);
          // By the time we call this, the directive should have been added to the schema and so getting the type should not raise errors.
          assert(!Array.isArray(argType), () => `Should have gotten error getting type for @${name}(${argName}:), but got ${argType}`)
          const { valid, supportedMsg } = strategy.isTypeSupported(schema, argType);
          if (!valid) {
            return new GraphQLError(
              `Invalid composition strategy ${strategy.name} for argument @${name}(${argName}:) of type ${argType}; `
              + `${strategy.name} only supports ${supportedMsg}`
            );
          }
        }
        return {
          merge: (argName, values) => {
            const strategy = argStrategies.get(argName);
            assert(strategy, () => `Should have a strategy for ${argName}`);
            return strategy.mergeValues(values);
          },
          toString: () => {
            if (argStrategies.size === 0) {
              return "<none>";
            }
            return '{ ' + [...argStrategies.entries()].map(([arg, strategy]) => `"${arg}": ${strategy.name}`).join(', ') + ' }';
          }
        };
      }
    }
    composition = {
      supergraphSpecification,
      argumentsMerger,
      staticArgumentTransform,
    };
  }

  return {
    name,
    composition,
    checkOrAdd: (schema: Schema, feature?: CoreFeature, asBuiltIn?: boolean) => {
      const actualName = feature?.directiveNameInSchema(name) ?? name;
      const { resolvedArgs, errors } = args.reduce<{ resolvedArgs: (ResolvedArgumentSpecification & { compositionStrategy?: ArgumentCompositionStrategy })[], errors: GraphQLError[] }>(
        ({ resolvedArgs, errors }, arg) => {
          const typeOrErrors = arg.type(schema, feature);
          if (Array.isArray(typeOrErrors)) {
            errors.push(...typeOrErrors);
          } else {
            resolvedArgs.push({ ...arg, type: typeOrErrors });
          }
          return { resolvedArgs, errors };
        },
        { resolvedArgs: [], errors: [] }
      );
      if (errors.length > 0) {
        return errors;
      }
      const existing = schema.directive(actualName);
      if (existing) {
        return ensureSameDirectiveStructure({ name: actualName, locations, repeatable, args: resolvedArgs }, existing);
      } else {
        const directive = schema.addDirectiveDefinition(new DirectiveDefinition(actualName, asBuiltIn));
        directive.repeatable = repeatable;
        directive.addLocations(...locations);
        for (const { name, type, defaultValue } of resolvedArgs) {
          directive.addArgument(name, type, defaultValue);
        }
        return [];
      }
    },
  }
}

export function createScalarTypeSpecification({ name }: { name: string }): TypeSpecification {
  return {
    name,
    checkOrAdd: (schema: Schema, feature?: CoreFeature, asBuiltIn?: boolean) => {
      const actualName = feature?.typeNameInSchema(name) ?? name;
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
    checkOrAdd: (schema: Schema, feature?: CoreFeature, asBuiltIn?: boolean) => {
      const actualName = feature?.typeNameInSchema(name) ?? name;
      const expectedFields = fieldsFct(schema);
      const existing = schema.type(actualName);
      if (existing) {
        let errors = ensureSameTypeKind('ObjectType', existing);
        if (errors.length > 0) {
          return errors;
        }
        assert(isObjectType(existing), 'Should be an object type');
        for (const { name, type, args } of expectedFields) {
          const existingField = existing.field(name);
          if (!existingField) {
            errors = errors.concat(ERRORS.TYPE_DEFINITION_INVALID.err(
              `Invalid definition of type ${name}: missing field ${name}`,
              { nodes: existing.sourceAST },
            ));
            continue;
          }
          // We allow adding non-nullability because we've seen redefinition of the federation _Service type with type String! for the `sdl` field
          // and we don't want to break backward compatibility as this doesn't feel too harmful.
          let existingType = existingField.type!;
          if (!isNonNullType(type) && isNonNullType(existingType)) {
            existingType = existingType.ofType;
          }
          if (!sameType(type, existingType)) {
            errors = errors.concat(ERRORS.TYPE_DEFINITION_INVALID.err(
              `Invalid definition for field ${name} of type ${name}: should have type ${type} but found type ${existingField.type}`,
              { nodes: existingField.sourceAST },
            ));
          }
          errors = errors.concat(ensureSameArguments(
            { name, args },
            existingField,
            `field "${existingField.coordinate}"`,
          ));
        }
        return errors;
      } else {
        const createdType = schema.addType(new ObjectType(actualName, asBuiltIn));
        for (const { name, type, args } of expectedFields) {
          const field = createdType.addField(name, type);
          for (const { name: argName, type: argType, defaultValue } of args ?? []) {
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
    checkOrAdd: (schema: Schema, feature?: CoreFeature, asBuiltIn?: boolean) => {
      const actualName = feature?.typeNameInSchema(name) ?? name;
      const existing = schema.type(actualName);
      const expectedMembers = membersFct(schema).sort((n1, n2) => n1.localeCompare(n2));
      if (expectedMembers.length === 0) {
        if (existing) {
          return [ERRORS.TYPE_DEFINITION_INVALID.err(
            `Invalid definition of type ${name}: expected the union type to not exist/have no members but it is defined.`,
            { nodes: existing.sourceAST },
          )];
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
          errors = errors.concat(ERRORS.TYPE_DEFINITION_INVALID.err(
            `Invalid definition of type ${name}: expected members [${expectedMembers}] but found [${actualMembers}].`,
            { nodes: existing.sourceAST },
          ));
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

export function createEnumTypeSpecification({
  name,
  values,
}: {
  name: string,
  values: { name: string, description?: string }[],
}): TypeSpecification {
  return {
    name,
    checkOrAdd: (schema: Schema, feature?: CoreFeature, asBuiltIn?: boolean) => {
      const actualName = feature?.typeNameInSchema(name) ?? name;
      const existing = schema.type(actualName);
      const expectedValueNames = values.map((v) => v.name).sort((n1, n2) => n1.localeCompare(n2));
      if (existing) {
        let errors = ensureSameTypeKind('EnumType', existing);
        if (errors.length > 0) {
          return errors;
        }
        assert(isEnumType(existing), 'Should be an enum type');
        const actualValueNames = existing.values.map(v => v.name).sort((n1, n2) => n1.localeCompare(n2));
        if (!arrayEquals(expectedValueNames, actualValueNames)) {
          errors = errors.concat(ERRORS.TYPE_DEFINITION_INVALID.err(
            `Invalid definition for type "${name}": expected values [${expectedValueNames.join(', ')}] but found [${actualValueNames.join(', ')}].`,
            { nodes: existing.sourceAST },
          ));
        }
        return errors;
      } else {
        const type = schema.addType(new EnumType(actualName, asBuiltIn));
        for (const { name, description } of values) {
          type.addValue(name).description = description;
        }
        return [];
      }
    },
  }
}

function ensureSameTypeKind(expected: NamedType['kind'], actual: NamedType): GraphQLError[] {
  return expected === actual.kind
    ? []
    : [
      ERRORS.TYPE_DEFINITION_INVALID.err(
        `Invalid definition for type ${actual.name}: ${actual.name} should be a ${expected} but is defined as a ${actual.kind}`,
        { nodes: actual.sourceAST },
      )
    ];
}

function ensureSameDirectiveStructure(
  expected: {
    name: string,
    locations: DirectiveLocation[],
    repeatable: boolean,
    args: ResolvedArgumentSpecification[]
  },
  actual: DirectiveDefinition<any>,
): GraphQLError[] {
  const directiveName = `"@${expected.name}"`
  let errors = ensureSameArguments(expected, actual, `directive ${directiveName}`);
  // It's ok to say you'll never repeat a repeatable directive. It's not ok to repeat one that isn't.
  if (!expected.repeatable && actual.repeatable) {
    errors = errors.concat(ERRORS.DIRECTIVE_DEFINITION_INVALID.err(
      `Invalid definition for directive ${directiveName}: ${directiveName} should${expected.repeatable ? "" : " not"} be repeatable`,
      { nodes: actual.sourceAST },
    ));
  }
  // Similarly, it's ok to say that you will never use a directive in some locations, but not that you will use it in places not allowed by what is expected.
  if (!actual.locations.every(loc => expected.locations.includes(loc))) {
    errors = errors.concat(ERRORS.DIRECTIVE_DEFINITION_INVALID.err(
      `Invalid definition for directive ${directiveName}: ${directiveName} should have locations ${expected.locations.join(', ')}, but found (non-subset) ${actual.locations.join(', ')}`,
      { nodes: actual.sourceAST },
    ));
  }
  return errors;
}

function ensureSameArguments(
  expected: {
    name: string,
    args?: ResolvedArgumentSpecification[]
  },
  actual: { argument(name: string): ArgumentDefinition<any> | undefined, arguments(): readonly ArgumentDefinition<any>[] },
  what: string,
  containerSourceAST?: ASTNode,
): GraphQLError[] {
  const expectedArguments = expected.args ?? [];
  const errors: GraphQLError[] = [];
  for (const { name, type, defaultValue } of expectedArguments) {
    const actualArgument = actual.argument(name);
    if (!actualArgument) {
      // Not declaring an optional argument is ok: that means you won't be able to pass a non-default value in your schema, but we allow you that.
      // But missing a required argument it not ok.
      if (isNonNullType(type) && defaultValue === undefined) {
        errors.push(ERRORS.DIRECTIVE_DEFINITION_INVALID.err(
          `Invalid definition for ${what}: missing required argument "${name}"`,
          { nodes: containerSourceAST },
        ));
      }
      continue;
    }

    let actualType = actualArgument.type!;
    if (isNonNullType(actualType) && !isNonNullType(type)) {
      // It's ok to redefine an optional argument as mandatory. For instance, if you want to force people on your team to provide a "deprecation reason", you can
      // redefine @deprecated as `directive @deprecated(reason: String!)...` to get validation. In other words, you are allowed to always pass an argument that
      // is optional if you so wish.
      actualType = actualType.ofType;
    }
    if (!sameType(type, actualType) && !isValidInputTypeRedefinition(type, actualType)) {
      errors.push(ERRORS.DIRECTIVE_DEFINITION_INVALID.err(
        `Invalid definition for ${what}: argument "${name}" should have type "${type}" but found type "${actualArgument.type!}"`,
        { nodes: actualArgument.sourceAST },
      ));
    } else if (!isNonNullType(actualArgument.type!) && !valueEquals(defaultValue, actualArgument.defaultValue)) {
      errors.push(ERRORS.DIRECTIVE_DEFINITION_INVALID.err(
        `Invalid definition for ${what}: argument "${name}" should have default value ${valueToString(defaultValue)} but found default value ${valueToString(actualArgument.defaultValue)}`,
        { nodes: actualArgument.sourceAST },
      ));
    }
  }
  for (const actualArgument of actual.arguments()) {
    // If it's an expect argument, we already validated it. But we still need to reject unkown argument.
    if (!expectedArguments.some((arg) => arg.name === actualArgument.name)) {
      errors.push(ERRORS.DIRECTIVE_DEFINITION_INVALID.err(
        `Invalid definition for ${what}: unknown/unsupported argument "${actualArgument.name}"`,
        { nodes: actualArgument.sourceAST },
      ));
    }
  }
  return errors;
}

function isValidInputTypeRedefinition(expectedType: InputType, actualType: InputType): boolean {
  // If the expected type is a custom scalar, then we allow the redefinition to be another type (unless it's a custom scalar, in which
  // case it has to be the same scalar). The rational being that since graphQL does no validation of values passed to a custom scalar,
  // any code that gets some value as input for a custom scalar has to do validation manually, and so there is little harm in allowing
  // a redefinition with another type since any truly invalid value would failed that "manual validation". In practice, this leeway
  // make sense because many scalar will tend to accept only one kind of values (say, strings) and exists only to inform that said string
  // needs to follow a specific format, and in such case, letting user redefine the type as String adds flexibility while doing little harm.
  if (isListType(expectedType)) {
    return isListType(actualType) && isValidInputTypeRedefinition(expectedType.ofType, actualType.ofType);
  }
  if (isNonNullType(expectedType)) {
    return isNonNullType(actualType) && isValidInputTypeRedefinition(expectedType.ofType, actualType.ofType);
  }
  return isCustomScalarType(expectedType) && !isCustomScalarType(actualType);
}
