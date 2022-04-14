import { parse, Kind } from "graphql";
import stripIndent from 'strip-indent';
// This function signature is mostly lifted from the upstream `graphql-tag`.
// The motivation for this `gql` implementation is the desire to preserve
// the `locations` attributes from parsing, which `graphql-tag` purges.
// We don't typically use the function-invocation (e.g., `gql("string")`),
// but the same mode is preserved from `graphql-tag`.  The similarities
// might be appreciated.  (Or not, but having symmetry in a same-named
// function is somewhat appealing, indeed.)
export function gql(
  literals: string | readonly string[],
  ...args: any[]
) {

  if (typeof literals === 'string') {
    literals = [literals];
  }

  let result = literals[0];

  args.forEach((arg, i) => {
    if (arg && arg.kind === Kind.DOCUMENT) {
      result += arg.loc.source.body;
    } else {
      result += arg;
    }
    result += literals[i + 1];
  });

  return parse(stripIndent(result));
}
