import { parse } from "graphql";
import stripIndent from 'strip-indent';

export function gql(
  literals: string | readonly string[],
) {

  if (typeof literals === 'string') {
    literals = [literals];
  }

  let result = literals[0];

  return parse(stripIndent(result));
}
