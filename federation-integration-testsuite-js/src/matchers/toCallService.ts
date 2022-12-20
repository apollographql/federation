import { QueryPlan, PlanNode, SubscriptionNode, evaluateCondition } from '@apollo/query-planner';
import { astSerializer, queryPlanSerializer } from '../snapshotSerializers';
import prettyFormat from 'pretty-format';
import { assert, VariableDefinitions } from '@apollo/federation-internals';

declare global {
  namespace jest {
    interface Matchers<R> {
      toCallService(
        service: string,
        conditionVariables?: { definitions: VariableDefinitions, values: Record<string, boolean> },
      ): R;
    }
  }
}

// function printNode(node: ExecutionNode) {
//   return prettyFormat(
//     { nodes: [node], kind: 'QueryPlan' },
//     {
//       plugins: [queryPlanSerializer, astSerializer],
//     },
//   );
// }

const lineEndRegex = /^/gm;
function indentString(string: string, count = 2) {
  if (!string) return string;
  return string.replace(lineEndRegex, ' '.repeat(count));
}

function toCallService(
  this: jest.MatcherUtils,
  queryPlan: QueryPlan,
  service: string,
  conditionVariables?: {
    definitions: VariableDefinitions,
    values: Record<string, boolean>,
  },
): { message(): string; pass: boolean } {
  // const receivedString = print(received);
  // const expectedString = print(expected);

  const printReceived = (string: string) =>
    this.utils.RECEIVED_COLOR(indentString(string));
  const printExpected = (string: string) =>
    this.utils.EXPECTED_COLOR(indentString(string));

  let pass = false;
  // let initialServiceCall = null;
  // recurse the node, find first match of service name, return
  function walkExecutionNode(node?: PlanNode | SubscriptionNode) {
    if (!node) return;
    if ((node.kind === 'Fetch') && node.serviceName === service) {
      pass = true;
      // initialServiceCall = node;
      return;
    }
    switch (node.kind) {
      case 'Flatten':
        walkExecutionNode(node.node);
        break;
      case 'Parallel':
      case 'Sequence':
        node.nodes.forEach(walkExecutionNode);
        break;
      case 'Subscription':
        walkExecutionNode(node.primary);
        walkExecutionNode(node.rest);
        break;
      case 'Condition':
        assert(conditionVariables?.definitions, 'The operation variable definitions should be provided');
        const condition = evaluateCondition(node, conditionVariables?.definitions, conditionVariables?.values);
        walkExecutionNode(condition ? node.ifClause : node.elseClause);
        break;
      default:
        return;
    }
  }

  walkExecutionNode(queryPlan.node);

  const message = pass
    ? () =>
        this.utils.matcherHint('.not.toCallService') +
        '\n\n' +
        `Expected query plan to not call service:\n` +
        printExpected(service) +
        '\n' +
        `Received:\n` +
        // FIXME print just the node
        printReceived(
          prettyFormat(queryPlan, {
            plugins: [queryPlanSerializer, astSerializer],
          }),
        )
    : () => {
        return (
          this.utils.matcherHint('.toCallService') +
          '\n\n' +
          `Expected query plan to call service:\n` +
          printExpected(service) +
          '\n' +
          `Received query plan:\n` +
          printReceived(
            prettyFormat(queryPlan, {
              plugins: [queryPlanSerializer, astSerializer],
            }),
          )
        );
      };
  return {
    message,
    pass,
  };
}

expect.extend({
  toCallService,
});
