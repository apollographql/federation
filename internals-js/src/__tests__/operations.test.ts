import {
  Schema,
} from '../../dist/definitions';
import { buildSchema } from '../../dist/buildSchema';
import { parseOperation, SelectionSet } from '../../dist/operations';
import './matchers';

function parseSchema(schema: string): Schema {
  try {
    return buildSchema(schema);
  } catch (e) {
    throw new Error('Error parsing the schema:\n' + e.toString());
  }
}

test('fragments optimization of selection sets', () => {
  const schema = parseSchema(`
    type Query {
      t: T1
    }

    interface I {
      b: Int
    }

    type T1 {
      a: Int
      b: Int
      u: U
    }

    type T2 {
      x: String
      y: String
      b: Int
      u: U
    }

    union U = T1 | T2
  `);

  const operation = parseOperation(schema, `
    fragment OnT1 on T1 {
      a
      b
    }

    fragment OnT2 on T2 {
      x
      y
    }

    fragment OnI on I {
      b
    }

    fragment OnU on U {
      ...OnI
      ...OnT1
      ...OnT2
    }

    query {
      t {
        ...OnT1
        ...OnT2
        ...OnI
        u {
          ...OnU
        }
      }
    }
  `);

  const withoutFragments = parseOperation(schema, operation.toString(true, true));
  expect(withoutFragments.toString()).toMatchString(`
    {
      t {
        ... on T1 {
          a
          b
        }
        ... on T2 {
          x
          y
        }
        ... on I {
          b
        }
        u {
          ... on U {
            ... on I {
              b
            }
            ... on T1 {
              a
              b
            }
            ... on T2 {
              x
              y
            }
          }
        }
      }
    }
  `);

  const optimized = withoutFragments.optimize(operation.selectionSet.fragments!);
  // Note that we expect onU to *not* be recreated because, by default, optimize only
  // add add back a fragment if it is used at least twice (otherwise, the fragment just
  // make the query bigger).
  expect(optimized.toString()).toMatchString(`
    fragment OnT1 on T1 {
      a
      b
    }

    fragment OnT2 on T2 {
      x
      y
    }

    fragment OnI on I {
      b
    }

    {
      t {
        ...OnT1
        ...OnT2
        ...OnI
        u {
          ... on U {
            ...OnI
            ...OnT1
            ...OnT2
          }
        }
      }
    }
  `);
});

describe('selection set freezing', () => {
  it('throws if one tries to modify a frozen selection set', () => {
    const schema = parseSchema(`
      type Query {
        t: T
      }

      type T {
        a: Int
        b: Int
      }
    `);

    // Note that we use parseOperation to help us build selection/selection sets because it's more readable/convenient
    // thant to build the object "programmatically".
    const s1 = parseOperation(schema, `{ t { a } }`).selectionSet;
    const s2 = parseOperation(schema, `{ t { b } }`).selectionSet;

    const s = new SelectionSet(schema.schemaDefinition.rootType('query')!);

    // Control: check we can add to the selection set while not yet frozen
    expect(s.isFrozen()).toBeFalsy();
    expect(() => s.mergeIn(s1)).not.toThrow();

    s.freeze();
    expect(s.isFrozen()).toBeTruthy();
    expect(() => s.mergeIn(s2)).toThrowError('Cannot add to frozen selection: { t { a } }');
  });

  it('it does not clone non-frozen selections when adding to another one', () => {
    // This test is a bit debatable because what it tests is not so much a behaviour
    // we *need* absolutely to preserve, but rather test how things happens to
    // behave currently and illustrate the current contrast between frozen and
    // non-frozen selection set.
    // That is, this test show what happens if the test
    //   "it automaticaly clones frozen selections when adding to another one"
    // is done without freezing.

    const schema = parseSchema(`
      type Query {
        t: T
      }

      type T {
        a: Int
        b: Int
      }
    `);

    const s1 = parseOperation(schema, `{ t { a } }`).selectionSet;
    const s2 = parseOperation(schema, `{ t { b } }`).selectionSet;
    const s = new SelectionSet(schema.schemaDefinition.rootType('query')!);

    s.mergeIn(s1);
    s.mergeIn(s2);

    expect(s.toString()).toBe('{ t { a b } }');

    // This next assertion is where differs from the case where `s1` is frozen. Namely,
    // when we do `s.mergeIn(s1)`, then `s` directly references `s1` without cloning
    // and thus the next modification (`s.mergeIn(s2)`) ends up modifying both `s` and `s1`.
    // Note that we don't mean by this test that the fact that `s.mergeIn(s1)` does
    // not clone `s1` is a behaviour one should *rely* on, but it currently done for
    // efficiencies sake: query planning does a lot of selection set building through
    // `SelectionSet::mergeIn` and `SelectionSet::add` and we often pass to those method
    // newly constructed selections as input, so cloning them would wast CPU and early
    // query planning benchmarking showed that this could add up on the more expansive
    // plan computations. This is why freezing exists: it allows us to save cloning
    // in general, but to protect those selection set we know should be immutable
    // so they do get cloned in such situation.
    expect(s1.toString()).toBe('{ t { a b } }');
    expect(s2.toString()).toBe('{ t { b } }');
  });

  it('it automaticaly clones frozen selections when adding to another one', () => {
    const schema = parseSchema(`
      type Query {
        t: T
      }

      type T {
        a: Int
        b: Int
      }
    `);

    const s1 = parseOperation(schema, `{ t { a } }`).selectionSet.freeze();
    const s2 = parseOperation(schema, `{ t { b } }`).selectionSet.freeze();
    const s = new SelectionSet(schema.schemaDefinition.rootType('query')!);

    s.mergeIn(s1);
    s.mergeIn(s2);

    // We check S is what we expect...
    expect(s.toString()).toBe('{ t { a b } }');

    // ... but more importantly for this test, that s1/s2 were not modified.
    expect(s1.toString()).toBe('{ t { a } }');
    expect(s2.toString()).toBe('{ t { b } }');
  });
});
