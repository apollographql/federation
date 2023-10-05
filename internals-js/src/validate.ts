import {
  ArgumentDefinition,
  Directive,
  DirectiveDefinition,
  EnumType,
  InputFieldDefinition,
  InputObjectType,
  InterfaceType,
  isInputObjectType,
  isNonNullType,
  isScalarType,
  NamedSchemaElement,
  ObjectType,
  Schema,
  sourceASTs,
  Type,
  UnionType,
  VariableDefinitions
} from "./definitions";
import { assertName, ASTNode, GraphQLError, GraphQLErrorOptions } from "graphql";
import { isValidValue, valueToString, isValidValueApplication } from "./values";
import { introspectionTypeNames, isIntrospectionName } from "./introspection";
import { isSubtype, sameType } from "./types";
import { ERRORS } from "./error";

// Note really meant to be called manually as it is part of `Schema.validate`, but separated for core-organization reasons.
// This mostly apply the validations that graphQL-js does in `validateSchema` which we don't reuse because it applies to
// a `GraphQLSchema` (but note that the bulk of the validation is done by `validateSDL` which we _do_ reuse in `Schema.validate`).
export function validateSchema(schema: Schema): GraphQLError[] {
  return new Validator(schema).validate();
}

class InputObjectCircularRefsValidator {
  private readonly visitedTypes = new Set<string>();
  // Array of types nodes used to produce meaningful errors
  private readonly fieldPath: InputFieldDefinition[] = [];
  // Position in the field path
  private readonly fieldPathIndexByTypeName = new Map<string, number>();

  constructor(private readonly onError: (message: string, options: GraphQLErrorOptions) => void) {
  }

  detectCycles(type: InputObjectType) {
    if (this.visitedTypes.has(type.name)) {
      return;
    }

    this.visitedTypes.add(type.name);
    this.fieldPathIndexByTypeName.set(type.name, this.fieldPath.length);

    for (const field of type.fields()) {
      if (isNonNullType(field.type!) && isInputObjectType(field.type.ofType)) {
        const fieldType = field.type.ofType;
        const cycleIndex = this.fieldPathIndexByTypeName.get(fieldType.name);

        this.fieldPath.push(field);
        if (cycleIndex === undefined) {
          this.detectCycles(fieldType);
        } else {
          const cyclePath = this.fieldPath.slice(cycleIndex);
          const pathStr = cyclePath.map((fieldObj) => fieldObj.name).join('.');
          this.onError(
            `Cannot reference Input Object "${fieldType.name}" within itself through a series of non-null fields: "${pathStr}".`,
            { nodes: sourceASTs(...cyclePath) },
          );
        }
        this.fieldPath.pop();
      }
    }
    this.fieldPathIndexByTypeName.delete(type.name);
  }
}

class Validator {
  private readonly emptyVariables = new VariableDefinitions();
  private hasMissingTypes: boolean = false;
  private readonly errors: GraphQLError[] = [];

  constructor(readonly schema: Schema) {}

  validate(): GraphQLError[] {
    for (const type of this.schema.types()) {

      if (!introspectionTypeNames.includes(type.name)) {
        this.validateName(type);
      }
      switch (type.kind) {
        case 'ObjectType':
        case 'InterfaceType':
          this.validateObjectOrInterfaceType(type);
          break;
        case 'InputObjectType':
          this.validateInputObjectType(type);
          break;
        case 'UnionType':
          this.validateUnionType(type);
          break;
        case 'EnumType':
          this.validateEnumType(type);
          break;
      }
    }

    for (const directive of this.schema.allDirectives()) {
      this.validateName(directive);
      for (const arg of directive.arguments()) {
        this.validateArg(arg);
      }
      for (const application of directive.applications()) {
        this.validateDirectiveApplication(directive, application)
      }
    }

    // We do the interface implementation and input object cycles validation after we've validated
    // all types, because both of those checks reach into other types than the one directly checked
    // so we want to make sure all types are properly set. That is also why we skip those checks if
    // we found any type missing (in which case, there will be some errors and users should fix those
    // first).
    if (!this.hasMissingTypes) {
      const refsValidator = new InputObjectCircularRefsValidator((msg, opts) => this.addError(msg, opts));
      for (const type of this.schema.types()) {
        switch (type.kind) {
          case 'ObjectType':
          case 'InterfaceType':
            this.validateImplementedInterfaces(type);
            break;
          case 'InputObjectType':
            refsValidator.detectCycles(type);
            break;
        }
      }
    }

    return this.errors;
  }

  private addError(message: string, options: GraphQLErrorOptions) {
    this.errors.push(ERRORS.INVALID_GRAPHQL.err(message, options));
  }

  private validateHasType(elt: { type?: Type, coordinate: string, sourceAST?: ASTNode }): boolean {
    // Note that this error can't happen if you parse the schema since it wouldn't be valid syntax, but it can happen for
    // programmatically constructed schema.
    if (!elt.type) {
      this.addError(`Element ${elt.coordinate} does not have a type set`, { nodes: elt.sourceAST });
      this.hasMissingTypes = false;
    }
    return !!elt.type;
  }

  private validateName(elt: { name: string, sourceAST?: ASTNode}) {
    if (isIntrospectionName(elt.name)) {
      this.addError(
        `Name "${elt.name}" must not begin with "__", which is reserved by GraphQL introspection.`,
        elt.sourceAST ? { nodes: elt.sourceAST } : {}
      );
      return;
    }
    try {
      assertName(elt.name);
    } catch (e) {
      this.addError(e.message, elt.sourceAST ? { nodes: elt.sourceAST } : {});
    }
  }

  private validateObjectOrInterfaceType(type: ObjectType | InterfaceType) {
    if (!type.hasFields()) {
      this.addError(`Type ${type.name} must define one or more fields.`, { nodes: type.sourceAST });
    }
    for (const field of type.fields()) {
      this.validateName(field);
      this.validateHasType(field);
      for (const arg of field.arguments()) {
        this.validateArg(arg);
      }
    }
  }

  private validateImplementedInterfaces(type: ObjectType | InterfaceType) {
    if (type.implementsInterface(type.name)) {
      this.addError(
        `Type ${type} cannot implement itself because it would create a circular reference.`,
        { nodes: sourceASTs(type, type.interfaceImplementation(type.name)!) },
      );
    }

    for (const itf of type.interfaces()) {
      for (const itfField of itf.fields()) {
        const field = type.field(itfField.name);
        if (!field) {
          this.addError(
            `Interface field ${itfField.coordinate} expected but ${type} does not provide it.`,
            { nodes: sourceASTs(itfField, type) },
          );
          continue;
        }
        // Note that we may not have validated the interface yet, so making sure we have a meaningful error
        // if the type is not set, even if that means a bit of cpu wasted since we'll re-check later (and
        // as many type as the interface is implemented); it's a cheap check anyway.
        if (this.validateHasType(itfField) && !isSubtype(itfField.type!, field.type!)) {
          this.addError(
            `Interface field ${itfField.coordinate} expects type ${itfField.type} but ${field.coordinate} of type ${field.type} is not a proper subtype.`,
            { nodes: sourceASTs(itfField, field) },
          );
        }

        for (const itfArg of itfField.arguments()) {
          const arg = field.argument(itfArg.name);
          if (!arg) {
            this.addError(
              `Interface field argument ${itfArg.coordinate} expected but ${field.coordinate} does not provide it.`,
              { nodes: sourceASTs(itfArg, field) },
            );
            continue;
          }
          // Note that we could use contra-variance but as graphQL-js currently doesn't allow it, we mimic that.
          if (this.validateHasType(itfArg) && !sameType(itfArg.type!, arg.type!)) {
            this.addError(
              `Interface field argument ${itfArg.coordinate} expects type ${itfArg.type} but ${arg.coordinate} is type ${arg.type}.`,
              { nodes: sourceASTs(itfArg, arg) },
            );
          }
        }

        for (const arg of field.arguments()) {
          // Now check arguments on the type field that are not in the interface. They should not be required.
          if (itfField.argument(arg.name)) {
            continue;
          }
          if (arg.isRequired()) {
            this.addError(
              `Field ${field.coordinate} includes required argument ${arg.name} that is missing from the Interface field ${itfField.coordinate}.`,
              { nodes: sourceASTs(arg, itfField) },
            );
          }
        }
      }

      // Now check that this type also declare implementations of all the interfaces of its interface.
      for (const itfOfItf of itf.interfaces()) {
        if (!type.implementsInterface(itfOfItf)) {
          if (itfOfItf === type) {
            this.addError(
              `Type ${type} cannot implement ${itf} because it would create a circular reference.`,
              { nodes: sourceASTs(type, itf) },
            );
          } else {
            this.addError(
              `Type ${type} must implement ${itfOfItf} because it is implemented by ${itf}.`,
              { nodes: sourceASTs(type, itf, itfOfItf) },
            );
          }
        }
      }
    }
  }

  private validateInputObjectType(type: InputObjectType) {
    if (!type.hasFields()) {
      this.addError(`Input Object type ${type.name} must define one or more fields.`, { nodes: type.sourceAST });
    }
    for (const field of type.fields()) {
      this.validateName(field);
      if (!this.validateHasType(field)) {
        continue;
      }
      if (field.isRequired() && field.isDeprecated()) {
        this.addError(
          `Required input field ${field.coordinate} cannot be deprecated.`,
          { nodes: sourceASTs(field.appliedDirectivesOf('deprecated')[0], field) },
        );
      }
      if (field.defaultValue !== undefined && !isValidValue(field.defaultValue, field, new VariableDefinitions())) {
        this.addError(
          `Invalid default value (got: ${valueToString(field.defaultValue)}) provided for input field ${field.coordinate} of type ${field.type}.`,
          { nodes: sourceASTs(field) },
        );
      }
    }
  }

  private validateArg(arg: ArgumentDefinition<any>) {
    this.validateName(arg);
    if (!this.validateHasType(arg)) {
      return;
    }
    if (arg.isRequired() && arg.isDeprecated()) {
      this.addError(
        `Required argument ${arg.coordinate} cannot be deprecated.`,
        { nodes: sourceASTs(arg.appliedDirectivesOf('deprecated')[0], arg) },
      );
    }
    if (arg.defaultValue !== undefined && !isValidValue(arg.defaultValue, arg, new VariableDefinitions())) {
      // don't error if custom scalar is shadowing a builtin scalar
      const builtInScalar = this.schema.builtInScalarTypes().find((t) => arg.type && isScalarType(arg.type) && t.name === arg.type.name);
      if (!builtInScalar || !isValidValueApplication(arg.defaultValue, builtInScalar, arg.defaultValue, new VariableDefinitions())) {
        this.addError(
          `Invalid default value (got: ${valueToString(arg.defaultValue)}) provided for argument ${arg.coordinate} of type ${arg.type}.`,
          { nodes: sourceASTs(arg) },
        );
      }
    }
  }

  private validateUnionType(type: UnionType) {
    if (type.membersCount() === 0) {
      this.addError(`Union type ${type.coordinate} must define one or more member types.`, { nodes: type.sourceAST });
    }
  }

  private validateEnumType(type: EnumType) {
    if (type.values.length === 0) {
      this.addError(`Enum type ${type.coordinate} must define one or more values.`, { nodes: type.sourceAST });
    }
    for (const value of type.values) {
      this.validateName(value);
      if (value.name === 'true' || value.name === 'false' || value.name === 'null') {
        this.addError(
          `Enum type ${type.coordinate} cannot include value: ${value}.`,
          { nodes: value.sourceAST },
        );
      }
    }
  }

  private validateDirectiveApplication(definition: DirectiveDefinition, application: Directive) {
    // Note that graphQL `validateSDL` method will already have validated that we only have
    // known arguments and that that we don't miss a required argument. What remains is to
    // ensure each provided value if valid for the argument type.
    for (const argument of definition.arguments()) {
      const value = application.arguments()[argument.name];
      if (!value) {
        // Again, that implies that value is not required.
        continue;
      }
      // Note that we validate if the definition argument has a type set separatly
      // and log an error if necesary, but we just want to avoid calling
      // `isValidValue` if there is not type as it may throw.
      if (argument.type && !isValidValue(value, argument, this.emptyVariables)) {
        const parent = application.parent;
        // The only non-named SchemaElement is the `schema` definition.
        const parentDesc = parent instanceof NamedSchemaElement
          ? parent.coordinate
          : 'schema';
        this.addError(
          `Invalid value for "${argument.coordinate}" of type "${argument.type}" in application of "${definition.coordinate}" to "${parentDesc}".`,
          { nodes: sourceASTs(application, argument) },
        );
      }
    }
  }
}
