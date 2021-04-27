import { parse } from "graphql";
import stripIndent from 'strip-indent';

export function gql(
  literals: string | readonly string[],
  ...args: any[]
) {

  if (typeof literals === 'string') {
    literals = [literals];
  }

  let result = literals[0];

  args.forEach((arg, i) => {
    if (arg && arg.kind === 'Document') {
      result += arg.loc.source.body;
    } else {
      result += arg;
    }
    result += literals[i + 1];
  });

  return parse(stripIndent(result));
}
