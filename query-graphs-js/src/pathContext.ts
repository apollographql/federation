import { 
  assert,
  OperationElement,
} from "@apollo/federation-internals";
import deepEqual from "deep-equal";

export function isPathContext(v: any): v is PathContext {
  return v instanceof PathContext;
}

function addExtractedDirective(operation: OperationElement, directiveName: string, addTo: [string, any][]) {
  const applied = operation.appliedDirectivesOf(directiveName);
  if (applied.length > 0) {
    assert(applied.length === 1, () => `${directiveName} shouldn't be repeated on ${operation}`)
    const value = applied[0].arguments()['if'];
    addTo.push([directiveName, value]);
  }
}

/**
 * Records, as we walk a graphQL operation path, the @include and @skip directives encountered (with their conditions).
 */
export class PathContext {
  // A list of [<directiveName>, <ifCondition>] (say: [['include', true], ['skip', $foo]]) in
  // the reverse order ot which they were applied (so the first element is the inner-most applied skip/include).
  constructor(readonly directives: [string, any][]) {
  }

  isEmpty() {
    return this.directives.length === 0;
  }

  size() {
    return this.directives.length;
  }

  withContextOf(operation: OperationElement): PathContext {
    if (operation.appliedDirectives.length === 0) {
      return this;
    }

    const newDirectives: [string, any][] = [];
    addExtractedDirective(operation, 'skip', newDirectives);
    addExtractedDirective(operation, 'include', newDirectives);
    return newDirectives.length === 0
      ? this
      : new PathContext(newDirectives.concat(this.directives));
  }

  equals(that: PathContext): boolean {
    return deepEqual(this.directives, that.directives);
  }

  toString(): string {
      return '[' + this.directives.map(([name, cond]) => `@${name}(if: ${cond})`).join(', ') + ']';
  }
}

export const emptyContext = new PathContext([]);

