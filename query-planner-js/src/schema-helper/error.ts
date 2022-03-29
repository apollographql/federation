import { GraphQLError } from "graphql";

export class GraphQLSchemaValidationError extends GraphQLError {
  constructor(public errors: ReadonlyArray<GraphQLError>) {
    const message = errors.map(error => error.message).join("\n\n");
    super(message);

    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
