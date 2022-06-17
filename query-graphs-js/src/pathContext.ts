import { 
  assert,
  OperationElement,
} from "@apollo/federation-internals";
import deepEqual from "deep-equal";

export function isPathContext(v: any): v is PathContext {
  return v instanceof PathContext;
}

function addExtractedConditional(operation: OperationElement, directiveName: string, addTo: [string, any][]) {
  const applied = operation.appliedDirectivesOf(directiveName);
  if (applied.length > 0) {
    assert(applied.length === 1, () => `${directiveName} shouldn't be repeated on ${operation}`)
    const value = applied[0].arguments()['if'];
    addTo.push([directiveName, value]);
  }
}

/**
 * Records, as we walk a graphQL operation path, important directives encountered (@include and @skip with their conditions).
 */
export class PathContext {
  constructor(
    // A list of [<directiveName>, <ifCondition>] (say: [['include', true], ['skip', $foo]]) in
    // the reverse order in which they were applied (so the first element is the inner-most applied skip/include).
    readonly conditionals: [string, any][],
  ) {
  }

  isEmpty() {
    return this.conditionals.length === 0;
  }

  withContextOf(operation: OperationElement): PathContext {
    if (operation.appliedDirectives.length === 0) {
      return this;
    }

    const newConditionals: [string, any][] = [];
    addExtractedConditional(operation, 'skip', newConditionals);
    addExtractedConditional(operation, 'include', newConditionals);

    return newConditionals.length === 0
      ? this
      : new PathContext(newConditionals.concat(this.conditionals));
  }

  equals(that: PathContext): boolean {
    return deepEqual(this.conditionals, that.conditionals);
  }

  toString(): string {
    return '['
      + this.conditionals.map(([name, cond]) => `@${name}(if: ${cond})`).join(', ')
      + ']';
  }
}

export const emptyContext = new PathContext([]);

