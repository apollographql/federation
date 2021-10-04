import { Directive, DirectiveDefinition, NamedSchemaElement, Schema, sourceASTs, VariableDefinitions } from "./definitions";
import { GraphQLError } from "graphql";
import { isValidValue } from "./values";

// Note really meant to be called manually as it is part of
// `Schema.validate`, but separated for core-organisation reasons.
export function validateSchema(schema: Schema): GraphQLError[] {
  // TODO: There is quite a few more needed additional graphqQL validations.
  return new Validator(schema).validate();
}


class Validator {
  private readonly emptyVariables = new VariableDefinitions();
  private readonly errors: GraphQLError[] = [];

  constructor(readonly schema: Schema) {}

  validate(): GraphQLError[] {
    for (const directive of this.schema.allDirectives()) {
      for (const application of directive.applications()) {
        this.validateDirectiveApplication(directive, application)
      }
    }
    return this.errors;
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
      if (!isValidValue(value, argument, this.emptyVariables)) {
        const parent = application.parent!;
        // The only non-named SchemaElement is the `schema` definition.
        const parentDesc = parent instanceof NamedSchemaElement
          ? parent.coordinate
          : 'schema';
        throw new GraphQLError(
          `Invalid value for "${argument.coordinate}" of type "${argument.type}" in application of "${definition.coordinate}" to "${parentDesc}".`,
          sourceASTs(application, argument)
        );
      }
    }
  }
}

