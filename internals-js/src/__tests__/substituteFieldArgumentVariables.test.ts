import { CompositeType, Variable } from '../definitions';
import { buildSchema } from '../buildSchema';
import { parseSelectionSet } from '../operations';

const schema = buildSchema(`
  type Query {
    t: T
  }

  type T {
    scalar: Int
    x(arg: Int): Int
    xl(args: [Int]): Int
    obj: T
  }
`);

const tType = schema.type('T') as CompositeType;

// Parses a field set on `T`, tolerating the given field-argument variable names, then substitutes them and returns
// the resulting selection set as a normalized (whitespace-collapsed) string.
function substitute(fieldSet: string, substitutions: Map<string, any>): string {
  const selectionSet = parseSelectionSet({
    parentType: tType,
    source: fieldSet,
    allowedFieldArgumentVariables: new Set(['arg', 'a', 'b']),
  });
  return selectionSet
    .substituteFieldArgumentVariables(substitutions)
    .toString()
    .replace(/\s+/g, ' ')
    .trim();
}

describe('SelectionSet.substituteFieldArgumentVariables', () => {
  test('forwards an operation variable (substituting one variable for another)', () => {
    expect(
      substitute('x(arg: $arg)', new Map([['arg', new Variable('v')]])),
    ).toContain('x(arg: $v)');
  });

  test('inlines a literal value', () => {
    expect(
      substitute('x(arg: $arg)', new Map<string, any>([['arg', 7]])),
    ).toContain('x(arg: 7)');
  });

  test('substitutes null', () => {
    expect(
      substitute('x(arg: $arg)', new Map<string, any>([['arg', null]])),
    ).toContain('x(arg: null)');
  });

  test('substitutes a variable nested inside a list value', () => {
    expect(
      substitute('xl(args: [$arg])', new Map<string, any>([['arg', 5]])),
    ).toContain('xl(args: [5])');
  });

  test('leaves a variable that is not in the substitution map unchanged (forwarded)', () => {
    expect(
      substitute('x(arg: $arg)', new Map<string, any>([['other', 7]])),
    ).toContain('x(arg: $arg)');
  });

  test('recurses into nested selections', () => {
    const result = substitute(
      'obj { x(arg: $arg) }',
      new Map<string, any>([['arg', 3]]),
    );
    expect(result).toContain('x(arg: 3)');
  });

  test('substitutes multiple variables independently', () => {
    const result = substitute(
      'x(arg: $a) xl(args: [$b])',
      new Map<string, any>([
        ['a', new Variable('v1')],
        ['b', 9],
      ]),
    );
    expect(result).toContain('x(arg: $v1)');
    expect(result).toContain('xl(args: [9])');
  });
});
