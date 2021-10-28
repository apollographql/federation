import { ASTNode, GraphQLError, Source } from "graphql";

export function error(
  code: string,
  message: string,
  nodes?: readonly ASTNode[] | ASTNode,
  source?: Source,
  positions?: readonly number[],
  path?: readonly (string | number)[],
  originalError?: Error,
  extensions?: { [key: string]: any },
) {
  return new GraphQLError(
    message,
    nodes,
    source,
    positions,
    path,
    originalError,
    {
      ...extensions,
      code,
    },
  );
}
