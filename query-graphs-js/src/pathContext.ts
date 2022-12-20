import { 
  assert,
  isVariable,
  OperationElement,
  Variable,
} from "@apollo/federation-internals";
import deepEqual from "deep-equal";

export function isPathContext(v: any): v is PathContext {
  return v instanceof PathContext;
}

export type OperationConditional = {
  kind: 'include' | 'skip',
  value: boolean | Variable,
}

export function extractOperationConditionals(operation: OperationElement): OperationConditional[] {
  const conditionals: OperationConditional[] = [];
  addExtractedConditional(operation, 'skip', conditionals);
  addExtractedConditional(operation, 'include', conditionals);
  return conditionals;
}

function addExtractedConditional(operation: OperationElement, kind: 'include' | 'skip', addTo: OperationConditional[]) {
  const applied = operation.appliedDirectivesOf(kind);
  if (applied.length > 0) {
    assert(applied.length === 1, () => `${kind} shouldn't be repeated on ${operation}`)
    const value = applied[0].arguments()['if'];
    assert(typeof value === 'boolean' || isVariable(value), () => `Invalid value ${value} found as condition of @${kind}`);
    addTo.push({ kind, value });
  }
}

/**
 * Records, as we walk a graphQL operation path, important directives encountered (@include and @skip with their conditions).
 */
export class PathContext {
  constructor(
    // A list of conditionals (say: [{ kind 'include', value: 'true'}], [{ kind: 'skip', value: '$foo' }]]) in the reverse order in which they were applied (so 
    // the first element is the inner-most applied skip/include).
    readonly conditionals: OperationConditional[],
  ) {
  }

  isEmpty() {
    return this.conditionals.length === 0;
  }

  withContextOf(operation: OperationElement): PathContext {
    if (operation.appliedDirectives.length === 0) {
      return this;
    }

    const newConditionals = extractOperationConditionals(operation);
    return newConditionals.length === 0
      ? this
      : new PathContext(newConditionals.concat(this.conditionals));
  }

  equals(that: PathContext): boolean {
    return deepEqual(this.conditionals, that.conditionals);
  }

  toString(): string {
    return '['
      + this.conditionals.map(({kind, value}) => `@${kind}(if: ${value})`).join(', ')
      + ']';
  }
}

export const emptyContext = new PathContext([]);

