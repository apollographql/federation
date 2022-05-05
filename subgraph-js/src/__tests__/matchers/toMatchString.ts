// Make this file a module (See: https://github.com/microsoft/TypeScript/issues/17736)
export {};

// TODO: this is the same than in definition.test.ts. Could we move those to a common place (but is it worth having
// a new module for that)? Maybe there is a better, more jest-native, way to do this.
// Note(Sylvain): I initially added those because I didn't figure out a way to make `toMatchSnapshotInline` work
// with strings cleanly: I always either ended up with indentation issuels, or the result looks very ugly in the
// tests. But it could be I just don't understand well enough how it work.
declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchString(actual: string): R;
      toMatchStringArray(actual: string[]): R;
    }
  }
}

function deIndent(str: string): string {
  // Strip leading \n
  str = str.slice(str.search(/[^\n]/));
  // Strip trailing \n or space
  while (str.charAt(str.length - 1) === '\n' || str.charAt(str.length - 1) === ' ') {
    str = str.slice(0, str.length - 1);
  }
  const indent = str.search(/[^ ]/);
  return str
    .split('\n')
    .map(line => line.slice(indent))
    .join('\n');
}

expect.extend({
  toMatchString(expected: string, received: string) {
    received = deIndent(received);
    // If the expected string as a trailing '\n', add one since we removed it.
    if (expected.charAt(expected.length - 1) === '\n') {
      received = received + '\n';
    }
    const pass = this.equals(expected, received);
    const message = pass
      ? () => this.utils.matcherHint('toMatchString', undefined, undefined)
          + '\n\n'
          + `Expected: not ${this.printExpected(expected)}`
      : () => {
        return (
          this.utils.matcherHint('toMatchString', undefined, undefined,)
          + '\n\n'
          + this.utils.printDiffOrStringify(expected, received, 'Expected', 'Received', true));
      };
    return {received, expected, message, name: 'toMatchString', pass};
  },

  toMatchStringArray(expected: string[], received: string[]) {
    if (expected.length !== received.length) {
      const message = () => 
        this.utils.matcherHint('toMatchStringArray', undefined, undefined,)
          + `\n\nExpected an array of size ${expected.length} but got one of size ${received.length}\n\n`
          + this.utils.printDiffOrStringify(expected, received, 'Expected', 'Received', true);
      return {received, expected, message, name: 'toMatchStringArray', pass: false};
    }

    let pass = true;
    const messages: string[] = [];
    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i];
      const rec = deIndent(received[i]);
      if (!this.equals(exp, rec)) {
        pass = false;
        messages.push(
          `Elements at index ${i} do no match:\n`
          + this.utils.printDiffOrStringify(exp, rec, 'Expected', 'Received', true)
        );
      }
    }
    const message = () => 
      this.utils.matcherHint('toMatchString', undefined, undefined) 
        + '\n\n'
        + (pass ? `Expected: not ${this.printExpected(expected)}` : messages.join('\n\n'));

    return {received, expected, message, name: 'toMatchStringArray', pass};
  }
});

