import { ErrGraphQLAPISchemaValidationFailed, FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import {
  ArgumentDefinition,
  CoreFeatures,
  DirectiveDefinition,
  EnumType,
  EnumValue,
  executableDirectiveLocations,
  FieldDefinition,
  InputFieldDefinition,
  InputObjectType,
  InputType,
  InterfaceType,
  isEnumType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isScalarType,
  isVariable,
  NamedType,
  ObjectType,
  ScalarType,
  Schema,
  SchemaDefinition,
  SchemaElement,
  UnionType,
} from "./definitions";
import { GraphQLError, DirectiveLocation } from "graphql";
import { registerKnownFeature } from "./knownCoreFeatures";
import { ERRORS } from "./error";
import { createDirectiveSpecification, DirectiveSpecification } from "./directiveAndTypeSpecification";
import { assert } from "./utils";

export const inaccessibleIdentity = 'https://specs.apollo.dev/inaccessible';

export class InaccessibleSpecDefinition extends FeatureDefinition {
  public readonly inaccessibleLocations: DirectiveLocation[];
  public readonly inaccessibleDirectiveSpec: DirectiveSpecification;
  private readonly printedTagDefinition: string;

  constructor(version: FeatureVersion) {
    super(new FeatureUrl(inaccessibleIdentity, 'inaccessible', version));
    this.inaccessibleLocations = [
      DirectiveLocation.FIELD_DEFINITION,
      DirectiveLocation.OBJECT,
      DirectiveLocation.INTERFACE,
      DirectiveLocation.UNION,
    ];
    this.printedTagDefinition = 'directive @inaccessible on FIELD_DEFINITION | INTERFACE | OBJECT | UNION';
    if (!this.isV01()) {
      this.inaccessibleLocations.push(
        DirectiveLocation.ARGUMENT_DEFINITION,
        DirectiveLocation.SCALAR,
        DirectiveLocation.ENUM,
        DirectiveLocation.ENUM_VALUE,
        DirectiveLocation.INPUT_OBJECT,
        DirectiveLocation.INPUT_FIELD_DEFINITION,
      );
      this.printedTagDefinition = 'directive @inaccessible on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION';
    }
    this.inaccessibleDirectiveSpec = createDirectiveSpecification({
      name: 'inaccessible',
      locations: this.inaccessibleLocations,
    });
  }

  isV01() {
    return this.version.equals(new FeatureVersion(0, 1));
  }

  addElementsToSchema(schema: Schema): GraphQLError[] {
    return this.addDirectiveSpec(schema, this.inaccessibleDirectiveSpec);
  }

  inaccessibleDirective(schema: Schema): DirectiveDefinition<Record<string, never>> | undefined {
    return this.directive(schema, 'inaccessible');
  }

  checkCompatibleDirective(definition: DirectiveDefinition): GraphQLError | undefined {
    const hasUnknownArguments = Object.keys(definition.arguments()).length > 0;
    const hasRepeatable = definition.repeatable;
    const hasValidLocations = definition.locations.every(loc => this.inaccessibleLocations.includes(loc));
    if (hasUnknownArguments || hasRepeatable || !hasValidLocations) {
      return ERRORS.DIRECTIVE_DEFINITION_INVALID.err({
        message: `Found invalid @inaccessible directive definition. Please ensure the directive definition in your schema's definitions matches the following:\n\t${this.printedTagDefinition}`,
      });
    }
    return undefined;
  }

  allElementNames(): string[] {
    return ['@inaccessible'];
  }
}

export const INACCESSIBLE_VERSIONS = new FeatureDefinitions<InaccessibleSpecDefinition>(inaccessibleIdentity)
  .add(new InaccessibleSpecDefinition(new FeatureVersion(0, 1)))
  .add(new InaccessibleSpecDefinition(new FeatureVersion(0, 2)));

registerKnownFeature(INACCESSIBLE_VERSIONS);

export function removeInaccessibleElements(schema: Schema) {
  // Note it doesn't hurt to validate here, since we expect the schema to be
  // validated already, and if it has been, it's cached/inexpensive.
  schema.validate();

  const coreFeatures = schema.coreFeatures;
  if (!coreFeatures) {
    return;
  }

  const inaccessibleFeature = coreFeatures.getByIdentity(inaccessibleIdentity);
  if (!inaccessibleFeature) {
    return;
  }
  const inaccessibleSpec = INACCESSIBLE_VERSIONS.find(
    inaccessibleFeature.url.version
  );
  if (!inaccessibleSpec) {
    throw ErrGraphQLAPISchemaValidationFailed([new GraphQLError(
      `Cannot remove inaccessible elements: the schema uses unsupported` +
      ` inaccessible spec version ${inaccessibleFeature.url.version}` +
      ` (supported versions: ${INACCESSIBLE_VERSIONS.versions().join(', ')})`
    )]);
  }

  const inaccessibleDirective = inaccessibleSpec.inaccessibleDirective(schema);
  if (!inaccessibleDirective) {
    throw ErrGraphQLAPISchemaValidationFailed([new GraphQLError(
      `Invalid schema: declares ${inaccessibleSpec.url} spec but does not` +
      ` define a @inaccessible directive.`
    )]);
  }

  const incompatibleError =
    inaccessibleSpec.checkCompatibleDirective(inaccessibleDirective);
  if (incompatibleError) {
    throw ErrGraphQLAPISchemaValidationFailed([incompatibleError]);
  }

  validateInaccessibleElements(
    schema,
    coreFeatures,
    inaccessibleSpec,
    inaccessibleDirective,
  );

  removeInaccessibleElementsAssumingValid(
    schema,
    inaccessibleDirective,
  )
}

// These are elements that may be hidden, by either @inaccessible or core
// feature definition hiding.
type HideableElement =
  | ObjectType
  | InterfaceType
  | UnionType
  | ScalarType
  | EnumType
  | InputObjectType
  | DirectiveDefinition
  | FieldDefinition<ObjectType | InterfaceType>
  | ArgumentDefinition<
    | DirectiveDefinition
    | FieldDefinition<ObjectType | InterfaceType>>
  | InputFieldDefinition
  | EnumValue

// Validate the applications of @inaccessible in the schema. Some of these may
// technically be caught by Schema.validate() later, but we'd like to give
// clearer error messaging when possible.
function validateInaccessibleElements(
  schema: Schema,
  coreFeatures: CoreFeatures,
  inaccessibleSpec: InaccessibleSpecDefinition,
  inaccessibleDirective: DirectiveDefinition,
): void {
  function isInaccessible(element: SchemaElement<any, any>): boolean {
    return element.hasAppliedDirective(inaccessibleDirective);
  }

  const featureList = [...coreFeatures.allFeatures()];
  function isFeatureDefinition(
    element: NamedType | DirectiveDefinition
  ): boolean {
    return featureList.some((feature) => feature.isFeatureDefinition(element));
  }

  function isInAPISchema(element: HideableElement): boolean {
    // If this element is @inaccessible, it's not in the API schema.
    if (
      !(element instanceof DirectiveDefinition) &&
      isInaccessible(element)
    ) return false;

    if (
      (element instanceof ObjectType) ||
      (element instanceof InterfaceType) ||
      (element instanceof UnionType) ||
      (element instanceof ScalarType) ||
      (element instanceof EnumType) ||
      (element instanceof InputObjectType) ||
      (element instanceof DirectiveDefinition)
    ) {
      // These are top-level elements. If they're not @inaccessible, the only
      // way they won't be in the API schema is if they're definitions of some
      // core feature.
      return !isFeatureDefinition(element);
    } else if (
      (element instanceof FieldDefinition) ||
      (element instanceof ArgumentDefinition) ||
      (element instanceof InputFieldDefinition) ||
      (element instanceof EnumValue)
    ) {
      // While this element isn't marked @inaccessible, this element won't be in
      // the API schema if its parent isn't.
      return isInAPISchema(element.parent);
    }
    assert(false, "Unreachable code, element is of unknown type.");
  }

  function fetchInaccessibleElementsInDescendants(
    element: HideableElement
  ): HideableElement[] {
    const inaccessibleElements: HideableElement[] = [];
    if (isInaccessible(element)) {
      inaccessibleElements.push(element);
    }

    if (
      (element instanceof ObjectType) ||
      (element instanceof InterfaceType) ||
      (element instanceof InputObjectType)
    ) {
      for (const field of element.fields()) {
        inaccessibleElements.push(
          ...fetchInaccessibleElementsInDescendants(field),
        );
      }
      return inaccessibleElements;
    } else if (element instanceof EnumType) {
      for (const enumValue of element.values) {
        inaccessibleElements.push(
          ...fetchInaccessibleElementsInDescendants(enumValue),
        )
      }
      return inaccessibleElements;
    } else if (
      (element instanceof DirectiveDefinition) ||
      (element instanceof FieldDefinition)
    ) {
      for (const argument of element.arguments()) {
        inaccessibleElements.push(
          ...fetchInaccessibleElementsInDescendants(argument),
        )
      }
      return inaccessibleElements;
    } else if (
      (element instanceof UnionType) ||
      (element instanceof ScalarType) ||
      (element instanceof ArgumentDefinition) ||
      (element instanceof InputFieldDefinition) ||
      (element instanceof EnumValue)
    ) {
      return inaccessibleElements;
    }
    assert(false, "Unreachable code, element is of unknown type.");
  }

  const errors: GraphQLError[] = [];
  let defaultValueReferencers: Map<
    DefaultValueReference,
    SchemaElementWithDefaultValue[]
  > | undefined = undefined;
  if (!inaccessibleSpec.isV01()) {
    // Note that for inaccessible v0.1, enum values and input fields can't be
    // @inaccessible, so there's no need to validate default values and compute
    // references (also, starting to validate default values would be a breaking
    // change for inaccessible v0.1).
    defaultValueReferencers = computeDefaultValueReferencers(
      schema,
      errors
    );
  }

  for (const type of schema.allTypes()) {
    if (hasBuiltInName(type)) {
      // Built-in types (and their descendants) aren't allowed to be
      // @inaccessible, regardless of shadowing.
      const inaccessibleElements = fetchInaccessibleElementsInDescendants(type);
      if (inaccessibleElements.length > 0) {
        errors.push(ERRORS.DISALLOWED_INACCESSIBLE.err({
          message:
            `Built-in type "${type.coordinate}" cannot use @inaccessible.`,
          nodes: type.sourceAST,
          extensions: {
            disallowed_element: type.coordinate,
            inaccessible_elements: inaccessibleElements
              .map((element) => element.coordinate),
          }
        }));
      }
    } else if (isFeatureDefinition(type)) {
      // Core feature types (and their descendants) aren't allowed to be
      // @inaccessible.
      const inaccessibleElements = fetchInaccessibleElementsInDescendants(type);
      if (inaccessibleElements.length > 0) {
        errors.push(ERRORS.DISALLOWED_INACCESSIBLE.err({
          message:
            `Core feature type "${type.coordinate}" cannot use @inaccessible.`,
          nodes: type.sourceAST,
          extensions: {
            disallowed_element: type.coordinate,
            inaccessible_elements: inaccessibleElements
              .map((element) => element.coordinate),
          }
        }));
      }
    } else if (isInaccessible(type)) {
      // Types can be referenced by other schema elements in a few ways:
      // 1. Fields, arguments, and input fields may have the type as their base
      //    type.
      // 2. Union types may have the type as a member (for object types).
      // 3. Object and interface types may implement the type (for interface
      //    types).
      // 4. Schemas may have the type as a root operation type (for object
      //    types).
      //
      // When a type is hidden, the referencer must follow certain rules for the
      // schema to be valid. Respectively, these rules are:
      // 1. The field/argument/input field must not be in the API schema.
      // 2. The union type, if empty, must not be in the API schema.
      // 3. No rules are imposed in this case.
      // 4. The root operation type must not be the query type.
      //
      // We validate the 1st and 4th rules above, and leave the 2nd for when we
      // look at accessible union types.
      const referencers = type.referencers();
      for (const referencer of referencers) {
        if (
          referencer instanceof FieldDefinition ||
          referencer instanceof ArgumentDefinition ||
          referencer instanceof InputFieldDefinition
        ) {
          if (isInAPISchema(referencer)) {
            errors.push(ERRORS.REFERENCED_INACCESSIBLE.err({
              message:
                `Type "${type.coordinate}" is @inaccessible but is referenced` +
                ` by "${referencer.coordinate}", which is in the API schema.`,
              nodes: type.sourceAST,
              extensions: {
                inaccessible_element: type.coordinate,
                inaccessible_element_referencer: referencer.coordinate,
              }
            }));
          }
        } else if (referencer instanceof SchemaDefinition) {
          if (type === referencer.rootType('query')) {
            errors.push(ERRORS.QUERY_ROOT_TYPE_INACCESSIBLE.err({
              message:
                `Type "${type.coordinate}" is @inaccessible but is the root` +
                ` query type, which must be in the API schema.`,
              nodes: type.sourceAST,
              extensions: {
                inaccessible_element: type.coordinate,
              }
            }));
          }
        }
      }
    } else {
      // At this point, we know the type must be in the API schema. For types
      // with children (all types except scalar), we check that at least one of
      // the children is accessible.
      if (
        (type instanceof ObjectType) ||
        (type instanceof InterfaceType) ||
        (type instanceof InputObjectType)
      ) {
        let isEmpty = true;
        for (const field of type.fields()) {
          if (!isInaccessible(field)) isEmpty = false;
        }
        if (isEmpty) {
          errors.push(ERRORS.ONLY_INACCESSIBLE_CHILDREN.err({
            message:
              `Type "${type.coordinate}" is in the API schema but all of its` +
              ` ${(type instanceof InputObjectType) ? 'input ' : ''}fields` +
              ` are @inaccessible.`,
            nodes: type.sourceAST,
            extensions: {
              inaccessible_elements_parent: type.coordinate,
              inaccessible_elements: type.fields()
                .map((field) => field.coordinate),
            }
          }));
        }
      } else if (type instanceof UnionType) {
        let isEmpty = true;
        for (const member of type.types()) {
          if (!isInaccessible(member)) isEmpty = false;
        }
        if (isEmpty) {
          errors.push(ERRORS.ONLY_INACCESSIBLE_CHILDREN.err({
            message:
              `Type "${type.coordinate}" is in the API schema but all of its` +
              ` members are @inaccessible.`,
            nodes: type.sourceAST,
            extensions: {
              inaccessible_elements_parent: type.coordinate,
              inaccessible_elements: type.types()
                .map((type) => type.coordinate),
            }
          }));
        }
      } else if (type instanceof EnumType) {
        let isEmpty = true;
        for (const enumValue of type.values) {
          if (!isInaccessible(enumValue)) isEmpty = false;
        }
        if (isEmpty) {
          errors.push(ERRORS.ONLY_INACCESSIBLE_CHILDREN.err({
            message:
              `Type "${type.coordinate}" is in the API schema but all of its` +
             ` values are @inaccessible.`,
            nodes: type.sourceAST,
            extensions: {
              inaccessible_elements_parent: type.coordinate,
              inaccessible_elements: type.values
                .map((enumValue) => enumValue.coordinate),
            }
          }));
        }
      }

      // Descend into the type's children if needed.
      if (
        (type instanceof ObjectType) ||
        (type instanceof InterfaceType)
      ) {
        const implementedInterfaces = type.interfaces();
        const implementingTypes: (ObjectType | InterfaceType)[] = [];
        if (type instanceof InterfaceType) {
          for (const referencer of type.referencers()) {
            if (
              (referencer instanceof ObjectType) ||
              (referencer instanceof InterfaceType)
            ) {
              implementingTypes.push(referencer);
            }
          }
        }
        for (const field of type.fields()) {
          if (isInaccessible(field)) {
            // Fields can be "referenced" by the corresponding fields of any
            // interfaces their parent type implements. When a field is hidden
            // (but its parent isn't), we check that such implemented fields
            // aren't in the API schema.
            for (const implementedInterface of implementedInterfaces) {
              const implementedField = implementedInterface.field(field.name);
              if (implementedField && isInAPISchema(implementedField)) {
                errors.push(ERRORS.IMPLEMENTED_BY_INACCESSIBLE.err({
                  message:
                    `Field "${field.coordinate}" is @inaccessible but` +
                    ` implements the interface field` +
                    ` "${implementedField.coordinate}", which is in the API` +
                    ` schema.`,
                  nodes: field.sourceAST,
                  extensions: {
                    inaccessible_element: field.coordinate,
                    inaccessible_element_implements:
                      implementedField.coordinate,
                  }
                }));
              }
            }
          } else {
            // Descend into the field's arguments.
            for (const argument of field.arguments()) {
              if (isInaccessible(argument)) {
                // When an argument is hidden (but its ancestors aren't), we
                // check that it isn't a required argument of its field.
                if (argument.isRequired()) {
                  errors.push(ERRORS.REQUIRED_INACCESSIBLE.err({
                    message:
                      `Argument "${argument.coordinate}" is @inaccessible but` +
                      ` is a required argument of its field.`,
                    nodes: argument.sourceAST,
                    extensions: {
                      inaccessible_element: argument.coordinate,
                      inaccessible_element_requirer: argument.coordinate,
                    }
                  }));
                }
                // When an argument is hidden (but its ancestors aren't), we
                // check that it isn't a required argument of any implementing
                // fields in the API schema. This is because the GraphQL spec
                // requires that any arguments of an implementing field that
                // aren't in its implemented field are optional.
                //
                // You might be thinking that a required argument in an
                // implementing field would necessitate that the implemented
                // field would also require that argument (and thus the check
                // above would also always error, removing the need for this
                // one), but the GraphQL spec does not enforce this. E.g. it's
                // valid GraphQL for the implementing and implemented arguments
                // to be both non-nullable, but for just the implemented
                // argument to have a default value. Not providing a value for
                // the argument when querying the implemented type succeeds
                // GraphQL operation validation, but results in input coercion
                // failure for the field at runtime.
                for (const implementingType of implementingTypes) {
                  const implementingField = implementingType.field(field.name);
                  assert(
                    implementingField,
                    "Schema should have been valid, but an implementing type" +
                    " did not implement one of this type's fields."
                  );
                  const implementingArgument = implementingField
                    .argument(argument.name);
                  assert(
                    implementingArgument,
                    "Schema should have been valid, but an implementing type" +
                    " did not implement one of this type's field's arguments."
                  );
                  if (
                    isInAPISchema(implementingArgument) &&
                    implementingArgument.isRequired()
                  ) {
                    errors.push(ERRORS.REQUIRED_INACCESSIBLE.err({
                      message:
                        `Argument "${argument.coordinate}" is @inaccessible` +
                        ` but is implemented by the required argument` +
                        ` "${implementingArgument.coordinate}", which is` +
                        ` in the API schema.`,
                      nodes: argument.sourceAST,
                      extensions: {
                        inaccessible_element: argument.coordinate,
                        inaccessible_element_requirer:
                          implementingArgument.coordinate,
                      }
                    }));
                  }
                }

                // Arguments can be "referenced" by the corresponding arguments
                // of any interfaces their parent type implements. When an
                // argument is hidden (but its ancestors aren't), we check that
                // such implemented arguments aren't in the API schema.
                for (const implementedInterface of implementedInterfaces) {
                  const implementedArgument = implementedInterface
                    .field(field.name)
                    ?.argument(argument.name);
                  if (
                    implementedArgument &&
                    isInAPISchema(implementedArgument)
                  ) {
                    errors.push(ERRORS.IMPLEMENTED_BY_INACCESSIBLE.err({
                      message:
                        `Argument "${argument.coordinate}" is @inaccessible` +
                        ` but implements the interface argument` +
                        ` "${implementedArgument.coordinate}", which is in` +
                        ` the API schema.`,
                      nodes: argument.sourceAST,
                      extensions: {
                        inaccessible_element: argument.coordinate,
                        inaccessible_element_implements:
                          implementedArgument.coordinate,
                      }
                    }));
                  }
                }
              }
            }
          }
        }
      } else if (type instanceof InputObjectType) {
        for (const inputField of type.fields()) {
          if (isInaccessible(inputField)) {
            // When an input field is hidden (but its parent isn't), we check
            // that it isn't a required argument of its field.
            if (inputField.isRequired()) {
              errors.push(ERRORS.REQUIRED_INACCESSIBLE.err({
                message:
                  `Input field "${inputField.coordinate}" is @inaccessible` +
                  ` but is a required input field of its type.`,
                nodes: inputField.sourceAST,
                extensions: {
                  inaccessible_element: inputField.coordinate,
                  inaccessible_element_requirer: inputField.coordinate,
                }
              }));
            }

            // Input fields can be referenced by schema default values. When an
            // input field is hidden (but its parent isn't), we check that the
            // arguments/input fields with such default values aren't in the API
            // schema.
            assert(
              defaultValueReferencers,
              "Input fields can't be @inaccessible in v0.1, but default value" +
              " referencers weren't computed (which is only skipped for v0.1)."
            );
            const referencers = defaultValueReferencers.get(inputField) ?? [];
            for (const referencer of referencers) {
              if (isInAPISchema(referencer)) {
                errors.push(ERRORS.DEFAULT_VALUE_USES_INACCESSIBLE.err({
                  message:
                    `Input field "${inputField.coordinate}" is @inaccessible` +
                    ` but is used in the default value of` +
                    ` "${referencer.coordinate}", which is in the API schema.`,
                  nodes: type.sourceAST,
                  extensions: {
                    inaccessible_element: type.coordinate,
                    inaccessible_element_referencer: referencer.coordinate,
                  }
                }));
              }
            }
          }
        }
      } else if (type instanceof EnumType) {
        for (const enumValue of type.values) {
          if (isInaccessible(enumValue)) {
            // Enum values can be referenced by schema default values. When an
            // enum value is hidden (but its parent isn't), we check that the
            // arguments/input fields with such default values aren't in the API
            // schema.
            assert(
              defaultValueReferencers,
              "Enum values can't be @inaccessible in v0.1, but default value" +
              " referencers weren't computed (which is only skipped for v0.1)."
            );
            const referencers = defaultValueReferencers.get(enumValue) ?? [];
            for (const referencer of referencers) {
              if (isInAPISchema(referencer)) {
                errors.push(ERRORS.DEFAULT_VALUE_USES_INACCESSIBLE.err({
                  message:
                    `Enum value "${enumValue.coordinate}" is @inaccessible` +
                    ` but is used in the default value of` +
                    ` "${referencer.coordinate}", which is in the API schema.`,
                  nodes: type.sourceAST,
                  extensions: {
                    inaccessible_element: type.coordinate,
                    inaccessible_element_referencer: referencer.coordinate,
                  }
                }));
              }
            }
          }
        }
      }
    }
  }

  const executableDirectiveLocationSet = new Set(executableDirectiveLocations);
  for (const directive of schema.allDirectives()) {
    const typeSystemLocations = directive.locations.filter((loc) =>
      !executableDirectiveLocationSet.has(loc)
    );
    if (hasBuiltInName(directive)) {
      // Built-in directives (and their descendants) aren't allowed to be
      // @inaccessible, regardless of shadowing.
      const inaccessibleElements =
        fetchInaccessibleElementsInDescendants(directive);
      if (inaccessibleElements.length > 0) {
        errors.push(ERRORS.DISALLOWED_INACCESSIBLE.err({
          message:
            `Built-in directive "${directive.coordinate}" cannot use` +
            ` @inaccessible.`,
          nodes: directive.sourceAST,
          extensions: {
            disallowed_element: directive.coordinate,
            inaccessible_elements: inaccessibleElements
              .map((element) => element.coordinate),
          }
        }));
      }
    } else if (isFeatureDefinition(directive)) {
      // Core feature directives (and their descendants) aren't allowed to be
      // @inaccessible.
      const inaccessibleElements =
        fetchInaccessibleElementsInDescendants(directive);
      if (inaccessibleElements.length > 0) {
        errors.push(ERRORS.DISALLOWED_INACCESSIBLE.err({
          message:
            `Core feature directive "${directive.coordinate}" cannot use` +
            ` @inaccessible.`,
          nodes: directive.sourceAST,
          extensions: {
            disallowed_element: directive.coordinate,
            inaccessible_elements: inaccessibleElements
              .map((element) => element.coordinate),
          }
        }));
      }
    } else if (typeSystemLocations.length > 0) {
      // Directives that can appear on type-system locations (and their
      // descendants) aren't allowed to be @inaccessible.
      const inaccessibleElements =
        fetchInaccessibleElementsInDescendants(directive);
      if (inaccessibleElements.length > 0) {
        errors.push(ERRORS.DISALLOWED_INACCESSIBLE.err({
          message:
            `Directive "${directive.coordinate}" cannot use @inaccessible` +
            ` because it may be applied to these type-system locations:` +
            ` ${typeSystemLocations.join(', ')}.`,
          nodes: directive.sourceAST,
          extensions: {
            disallowed_element: directive.coordinate,
            inaccessible_elements: inaccessibleElements
              .map((element) => element.coordinate),
          }
        }));
      }
    } else {
      // At this point, we know the directive must be in the API schema. Descend
      // into the directive's arguments.
      for (const argument of directive.arguments()) {
        // When an argument is hidden (but its parent isn't), we check that it
        // isn't a required argument of its directive.
        if (argument.isRequired()) {
          if (isInaccessible(argument)) {
            errors.push(ERRORS.REQUIRED_INACCESSIBLE.err({
              message:
                `Argument "${argument.coordinate}" is @inaccessible but is a` +
                ` required argument of its directive.`,
              nodes: argument.sourceAST,
              extensions: {
                inaccessible_element: argument.coordinate,
                inaccessible_element_requirer: argument.coordinate,
              }
            }));
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw ErrGraphQLAPISchemaValidationFailed(errors);
  }
}

type DefaultValueReference = InputFieldDefinition | EnumValue;
type SchemaElementWithDefaultValue =
  | ArgumentDefinition<
    | DirectiveDefinition
    | FieldDefinition<ObjectType | InterfaceType>>
  | InputFieldDefinition;

// Default values in a schema may contain references to selectable elements that
// are @inaccessible (input fields and enum values). For a given schema, this
// function returns a map from such selectable elements to the elements with
// default values referencing them. (The default values of built-ins and their
// descendants are skipped.)
//
// Note that this will involve validating schema default values, which (at the
// time of writing) is conspicuously not in the GraphQL spec. These are
// validated similar to operation AST values as in the "Values of Correct Type"
// validation in the GraphQL spec; please see
// https://spec.graphql.org/draft/#sec-Values-of-Correct-Type
// for details. The differences are that variable references aren't allowed, and
// scalar input coercion is skipped (since coercion success is very dependent on
// the environment/server characteristics).
//
// Any errors encountered during default value validation will be pushed onto
// the given errors array.
function computeDefaultValueReferencers(
  schema: Schema,
  errors: GraphQLError[],
): Map<
  DefaultValueReference,
  SchemaElementWithDefaultValue[]
> {
  const referencers = new Map<
    DefaultValueReference,
    SchemaElementWithDefaultValue[]
  >();

  function addReference(
    reference: DefaultValueReference,
    referencer: SchemaElementWithDefaultValue,
  ) {
    const referencerList = referencers.get(reference) ?? [];
    if (referencerList.length === 0) {
      referencers.set(reference, referencerList);
    }
    referencerList.push(referencer);
  }

  // Note that the fields/arguments/input fields for built-in schema elements
  // can presumably only have types that are built-in types. Since built-ins and
  // their children aren't allowed to be @inaccessible, this means we shouldn't
  // have to worry about references within the default values of arguments and
  // input fields of built-ins, which is why we skip them below.
  for (const type of schema.allTypes()) {
    if (hasBuiltInName(type)) continue;

    // Scan object/interface field arguments.
    if (
      (type instanceof ObjectType) ||
      (type instanceof InterfaceType)
    ) {
      for (const field of type.fields()) {
        for (const argument of field.arguments()) {
          for (
            const reference of computeDefaultValueReferences(argument, errors)
          ) {
            addReference(reference, argument);
          }
        }
      }
    }

    // Scan input object fields.
    if (type instanceof InputObjectType) {
      for (const inputField of type.fields()) {
        for (
          const reference of computeDefaultValueReferences(inputField, errors)
        ) {
          addReference(reference, inputField);
        }
      }
    }
  }

  // Scan directive definition arguments.
  for (const directive of schema.allDirectives()) {
    if (hasBuiltInName(directive)) continue;
    for (const argument of directive.arguments()) {
      for (
        const reference of computeDefaultValueReferences(argument, errors)
      ) {
        addReference(reference, argument);
      }
    }
  }

  return referencers;
}

// For the given element, compute a list of input fields and enum values that
// are referenced in its default value (if any). As mentioned above, this will
// involve validating the default value to an extent. Any errors encountered
// during default value validation will be pushed onto the given errors array.
function computeDefaultValueReferences(
  element: SchemaElementWithDefaultValue,
  errors: GraphQLError[],
): DefaultValueReference[] {
  const references: DefaultValueReference[] = [];
  addValueReferences(
    element.defaultValue,
    getInputType(element),
    references,
    element,
    errors,
  )
  return references;
}

function getInputType(element: SchemaElementWithDefaultValue): InputType {
  const type = element.type;
  assert(
    type,
    "Schema should have been valid, but argument/input field did not have type."
  );
  return type;
}

// Modelled similarly to valueFromAST() from graphql-js, while adding in some
// missing validations from ValuesOfCorrectTypeRule() (specifically for input
// objects). For understanding how AST nodes are represented as JS values, see
// buildValue(), which is used to create any default values when building a
// Schema object.
//
// As noted above, the primary differences are that variable references aren't
// allowed, and that scalar input coercion is skipped, even for built-ins. The
// skipping is because coercion success depends on the environment/server
// characteristics (e.g. float input coercion success depends on the available
// precision as per the spec, which is machine-dependent). It would be bad if
// the user believed a supergraph schema was valid according to the inaccessible
// spec, but the server believed it was invalid and refused to load the schema
// because of differences in input coercion.
function addValueReferences(
  value: any,
  type: InputType,
  references: DefaultValueReference[],
  element: SchemaElementWithDefaultValue,
  errors: GraphQLError[],
): void {
  if (value === undefined) {
    return;
  }

  if (isVariable(value)) {
    errors.push(ERRORS.INVALID_DEFAULT_VALUE.err({
      message:
        `Default value "${element.defaultValue}" of "${element.coordinate}"` +
        ` cannot contain the variable reference "${value}".`,
      nodes: element.sourceAST,
      extensions: {
        element: element.coordinate,
        default_value: element.defaultValue,
      }
    }));
    return;
  }

  if (isNonNullType(type)) {
    if (value === null) {
      errors.push(ERRORS.INVALID_DEFAULT_VALUE.err({
        message:
          `Default value "${element.defaultValue}" of "${element.coordinate}"` +
          ` cannot provide null for non-nullable type "${type}".`,
        nodes: element.sourceAST,
        extensions: {
          element: element.coordinate,
          default_value: element.defaultValue,
        }
      }));
    } else {
      addValueReferences(
        value,
        type.ofType,
        references,
        element,
        errors,
      );
    }
    return;
  }

  if (value === null) {
    return;
  }

  if (isListType(type)) {
    const itemType: InputType = type.ofType;
    if (Array.isArray(value)) {
      for (const item of value) {
        addValueReferences(
          item,
          itemType,
          references,
          element,
          errors,
        );
      }
    } else {
      // Equivalent of coercing non-null element as a list of one.
      addValueReferences(
        value,
        itemType,
        references,
        element,
        errors,
      );
    }
    return;
  }

  if (isScalarType(type)) {
    // We explicitly do not attempt scalar input coercion, as the results are
    // dependent on environment/server characteristics. (It's also not needed to
    // compute references.)
    return;
  }

  if (isInputObjectType(type)) {
    if (typeof value !== 'object') {
      errors.push(ERRORS.INVALID_DEFAULT_VALUE.err({
        message:
          `Default value "${element.defaultValue}" of "${element.coordinate}"` +
          ` cannot provide non-object value "${value}" for input object type` +
          ` ${type}.`,
        nodes: element.sourceAST,
        extensions: {
          element: element.coordinate,
          default_value: element.defaultValue,
        }
      }));
    } else {
      const valueKeys = new Set(Object.keys(value));
      for (const field of type.fields()) {
        valueKeys.delete(field.name);
        const fieldValue = value[field.name];
        if (fieldValue === undefined) {
          if (
            field.defaultValue === undefined &&
            isNonNullType(getInputType(field))
          ) {
            errors.push(ERRORS.INVALID_DEFAULT_VALUE.err({
              message:
                `Default value "${element.defaultValue}" of` +
                ` "${element.coordinate}" is missing required field` +
                ` "${field.name}" for input object type "${type}".`,
              nodes: element.sourceAST,
              extensions: {
                element: element.coordinate,
                default_value: element.defaultValue,
              }
            }));
          }
        } else {
          references.push(field);
          addValueReferences(
            fieldValue,
            getInputType(field),
            references,
            element,
            errors,
          );
        }
      }
      for (const fieldName of valueKeys) {
        errors.push(ERRORS.INVALID_DEFAULT_VALUE.err({
          message:
            `Default value "${element.defaultValue}" of` +
            ` "${element.coordinate}" contains input field "${fieldName}"` +
            ` that is not defined in the input object type "${type}".`,
          nodes: element.sourceAST,
          extensions: {
            element: element.coordinate,
            default_value: element.defaultValue,
          }
        }));
      }
    }
    return;
  }

  if (isEnumType(type)) {
    // Note that Schema represents enum values as JS strings. Unfortunately, it
    // does not ensure that AST string values aren't provided for enum types,
    // which isn't allowed as per enum input coercion rules in the GraphQL spec.
    // This can't be easily done in buildValue(), since it doesn't validate type
    // information there, so the AST information is lost when the Schema builds
    // and the representation changes. In the future this may change (although
    // this is a breaking validation change, and ideally would be enacted in a
    // major version bump).
    if (typeof value !== 'string') {
      errors.push(ERRORS.INVALID_DEFAULT_VALUE.err({
        message:
          `Default value "${element.defaultValue}" of "${element.coordinate}"` +
          ` cannot provide non-enum value "${value}" for enum type "${type}".`,
        nodes: element.sourceAST,
        extensions: {
          element: element.coordinate,
          default_value: element.defaultValue,
        }
      }));
    } else {
      const enumValue = type.value(value);
      if (enumValue === undefined) {
        errors.push(ERRORS.INVALID_DEFAULT_VALUE.err({
          message:
            `Default value "${element.defaultValue}" of` +
            ` "${element.coordinate}" contains enum value "${value}" that is` +
            ` not defined in the enum type "${type}".`,
          nodes: element.sourceAST,
          extensions: {
            element: element.coordinate,
            default_value: element.defaultValue,
          }
        }));
      } else {
        references.push(enumValue);
      }
    }
    return;
  }

  assert(false, "Unreachable code, element is of unknown type.")
}

// Determine whether a given schema element has a built-in's name. Note that
// this is not the same as the isBuiltIn flag, due to shadowing definitions
// (which will not have the flag set).
function hasBuiltInName(element: NamedType | DirectiveDefinition): boolean {
  const schema = element.schema();
  if (
    (element instanceof ObjectType) ||
    (element instanceof InterfaceType) ||
    (element instanceof UnionType) ||
    (element instanceof ScalarType) ||
    (element instanceof EnumType) ||
    (element instanceof InputObjectType)
  ) {
    return schema.builtInTypes(true).some((type) =>
      type.name === element.name
    );
  } else if (element instanceof DirectiveDefinition) {
    return schema.builtInDirectives(true).some((directive) =>
      directive.name === element.name
    );
  }
  assert(false, "Unreachable code, element is of unknown type.")
}

// Remove schema elements marked with @inaccessible in the schema, assuming the
// schema has been validated with validateInaccessibleElements().
//
// Note the schema that results from this may not necessarily be valid GraphQL
// until core feature definitions have been removed by removeFeatureElements().
function removeInaccessibleElementsAssumingValid(
  schema: Schema,
  inaccessibleDirective: DirectiveDefinition,
): void {
  function isInaccessible(element: SchemaElement<any, any>): boolean {
    return element.hasAppliedDirective(inaccessibleDirective);
  }

  for (const type of schema.types()) {
    if (isInaccessible(type)) {
      type.remove();
    } else {
      if ((type instanceof ObjectType) || (type instanceof InterfaceType)) {
        for (const field of type.fields()) {
          if (isInaccessible(field)) {
            field.remove();
          } else {
            for (const argument of field.arguments()) {
              if (isInaccessible(argument)) {
                argument.remove();
              }
            }
          }
        }
      } else if (type instanceof InputObjectType) {
        for (const inputField of type.fields()) {
          if (isInaccessible(inputField)) {
            inputField.remove();
          }
        }
      } else if (type instanceof EnumType) {
        for (const enumValue of type.values) {
          if (isInaccessible(enumValue)) {
            enumValue.remove();
          }
        }
      }
    }
  }

  for (const directive of schema.directives()) {
    for (const argument of directive.arguments()) {
      if (isInaccessible(argument)) {
        argument.remove();
      }
    }
  }
}
