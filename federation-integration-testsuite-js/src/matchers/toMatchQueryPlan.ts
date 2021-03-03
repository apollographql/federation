import { QueryPlan } from '@apollo/query-planner';
import { MatcherHintOptions } from 'jest-matcher-utils';
import { diffFormatted, indentLines, printExpectedFormatted } from './utils';

declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchQueryPlan(expected: QueryPlan): R;
    }
  }
}

expect.extend({
  toMatchQueryPlan(received: QueryPlan, expected: QueryPlan) {
    const matcherName = 'toMatchQueryPlan';
    const options: MatcherHintOptions = {
      isNot: this.isNot,
      promise: this.promise,
    };

    const pass = this.equals(received, expected);

    const message = pass
      ? () =>
          this.utils.matcherHint(matcherName, undefined, undefined, options) +
          '\n\n' +
          `Expected query plan to not equal:\n` +
          indentLines(printExpectedFormatted(expected))
      : () =>
          this.utils.matcherHint(matcherName, undefined, undefined, options) +
          '\n\n' +
          diffFormatted(expected, received, {
            aAnnotation: 'Expected',
            bAnnotation: 'Received',
            expand: this.expand ?? true,
            includeChangeCounts: true,
          });
    return {
      message,
      pass,
    };
  },
});
