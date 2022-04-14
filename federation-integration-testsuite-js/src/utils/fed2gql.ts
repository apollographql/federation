import { asFed2SubgraphDocument } from "@apollo/federation-internals";
import { gql } from './gql';

export function fed2gql(
  literals: string | readonly string[],
  ...args: any[]
) {
  return asFed2SubgraphDocument(gql(literals, ...args));
}
