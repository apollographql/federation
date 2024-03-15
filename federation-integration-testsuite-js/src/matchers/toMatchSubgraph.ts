import { defaultPrintOptions, orderPrintedDefinitions, Subgraph } from "@apollo/federation-internals";

// Make this file a module (See: https://github.com/microsoft/TypeScript/issues/17736)
export {};

declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchSubgraph(actual: Subgraph): R;
    }
  }
}

expect.extend({
  toMatchSubgraph(expected: Subgraph, actual: Subgraph) {
    // Note: we use `Subgraph.toString`, not `printSchema()` because 1) it's simpler and 2) the former skips federation
    // specific definitions, making errors diffs more readable.
    const printOptions = orderPrintedDefinitions(defaultPrintOptions);
    const expectedString = expected.toString(printOptions);
    const actualString = actual.toString(printOptions);
    const pass = this.equals(expectedString, actualString);
    const msgBase = `For subgraph ${expected.name}\n`
      + this.utils.matcherHint('toMatchSubgraph', undefined, undefined)
      + '\n\n'
    const message = pass
      ? () => msgBase + `Expected: not ${this.printExpected(expectedString)}`
      : () =>  msgBase + this.utils.printDiffOrStringify(expectedString, actualString, 'Expected', 'Received', true);
    return {actual, expected, message, name: 'toMatchString', pass};
  }
});
