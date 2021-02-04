import diff, { DiffOptions } from 'jest-diff';
import { EXPECTED_COLOR, RECEIVED_COLOR } from 'jest-matcher-utils';
import prettyFormat from 'pretty-format';
import {
  queryPlanSerializer,
  astSerializer,
  typeSerializer,
} from '../snapshotSerializers';

const defaultFormatOptions: prettyFormat.OptionsReceived = {
  plugins: [queryPlanSerializer, astSerializer, typeSerializer],
};

export function diffFormatted(
  expected: unknown,
  received: unknown,
  diffOptions?: DiffOptions,
  formatOptions: prettyFormat.OptionsReceived = defaultFormatOptions,
) {
  const expectedString = prettyFormat(expected, formatOptions);
  const receivedString = prettyFormat(received, formatOptions);

  return diff(expectedString, receivedString, diffOptions);
}

export function indentLines(
  text: string,
  depth: number = 1,
  indent: string = ' ',
) {
  const indentation = indent.repeat(depth);
  return text
    .split('\n')
    .map((line) => indentation + line)
    .join('\n');
}

// The corresponding functions in `jest-matcher-utils` call their own `stringify` function,
// and that doesn't allow passing in custom pretty-format plugins.

export function printReceivedFormatted(
  value: unknown,
  formatOptions: prettyFormat.OptionsReceived = defaultFormatOptions,
): string {
  return RECEIVED_COLOR(prettyFormat(value, formatOptions));
}

export function printExpectedFormatted(
  value: unknown,
  formatOptions: prettyFormat.OptionsReceived = defaultFormatOptions,
): string {
  return EXPECTED_COLOR(prettyFormat(value, formatOptions));
}
