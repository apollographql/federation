import {
  defaultRootName,
  Schema,
  SchemaRootKind,
} from '../../dist/definitions';
import { buildSchema } from '../../dist/buildSchema';
import { MutableSelectionSet, Operation, operationFromDocument, parseOperation } from '../../dist/operations';
import './matchers';
import { DocumentNode, FieldNode, GraphQLError, Kind, OperationDefinitionNode, OperationTypeNode, SelectionNode, SelectionSetNode } from 'graphql';

function parseSchema(schema: string): Schema {
  try {
    return buildSchema(schema);
  } catch (e) {
    throw new Error('Error parsing the schema:\n' + e.toString());
  }
}

function astField(name: string, selectionSet?: SelectionSetNode): FieldNode {
  return {
    kind: Kind.FIELD,
    name: { kind: Kind.NAME, value: name },
    selectionSet,
  };
}

function astSSet(...selections: SelectionNode[]): SelectionSetNode {
  return {
    kind: Kind.SELECTION_SET,
    selections,
  };
}

describe('fragments optimization', () => {
  // Takes a query with fragments as inputs, expand all those fragments, and ensures that all the
  // fragments gets optimized back, and that we get back the exact same query. 
  function testFragmentsRoundtrip({
    schema,
    query,
    expanded,
  }: {
    schema: Schema,
    query: string,
    expanded: string,
  }) {
    const operation = parseOperation(schema, query);
    // We call `trimUnsatisfiableBranches` because the selections we care about in the query planner
    // will effectively have had gone through that function (and even if that function wasn't called,
    // the query planning algorithm would still end up removing unsatisfiable branches anyway), so
    // it is a more interesting test.
    const withoutFragments = operation.expandAllFragments().trimUnsatisfiableBranches();

    expect(withoutFragments.toString()).toMatchString(expanded);

    // We force keeping all reused fragments, even if they are used only once, because the tests using
    // this are just about testing the reuse of fragments and this make things shorter/easier to write.
    // There is tests in `buildPlan.test.ts` that double-check that we don't reuse fragments used only
    // once in actual query plans.
    const optimized = withoutFragments.optimize(operation.selectionSet.fragments!, 1);
    expect(optimized.toString()).toMatchString(operation.toString());
  }

  test('handles fragments using other fragments', () => {
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
          ...OnI
          ...OnT1
          ...OnT2
          u {
            ...OnI
            ...OnT1
            ...OnT2
          }
        }
      }
    `);
  });

  test('handles fragments with nested selections', () => {
    const schema = parseSchema(`
      type Query {
        t1a: T1
        t2a: T1
      }

      type T1 {
        t2: T2
      }

      type T2 {
        x: String
        y: String
      }
    `);

    testFragmentsRoundtrip({
      schema,
      query: `
        fragment OnT1 on T1 {
          t2 {
            x
          }
        }

        query {
          t1a {
            ...OnT1
            t2 {
              y
            }
          }
          t2a {
            ...OnT1
          }
        }
      `,
      expanded: `
        {
          t1a {
            t2 {
              x
              y
            }
          }
          t2a {
            t2 {
              x
            }
          }
        }
      `,
    });
  });

  test('handles nested fragments with field intersection', () => {
    const schema = parseSchema(`
      type Query {
        t: T
      }

      type T {
        a: A
        b: Int
      }

      type A {
        x: String
        y: String
        z: String
      }
    `);


    // The subtlety here is that `FA` contains `__typename` and so after we're reused it, the
    // selection will look like:
    // {
    //   t {
    //     a {
    //       ...FA
    //     }
    //   }
    // }
    // But to recognize that `FT` can be reused from there, we need to be able to see that
    // the `__typename` that `FT` wants is inside `FA` (and since FA applies on the parent type `A`
    // directly, it is fine to reuse).
    testFragmentsRoundtrip({
      schema,
      query:  `
        fragment FA on A {
          __typename
          x
          y
        }

        fragment FT on T {
          a {
            __typename
            ...FA
          }
        }

        query {
          t {
            ...FT
          }
        }
      `,
      expanded: `
        {
          t {
            a {
              __typename
              x
              y
            }
          }
        }
      `,
    });
  });

  test('handles fragment matching subset of field selection', () => {
    const schema = parseSchema(`
      type Query {
        t: T
      }

      type T {
        a: String
        b: B
        c: Int
        d: D
      }

      type B {
        x: String
        y: String
      }

      type D {
        m: String
        n: String
      }
    `);

    testFragmentsRoundtrip({
      schema,
      query: `
        fragment FragT on T {
          b {
            __typename
            x
          }
          c
          d {
            m
          }
        }

        {
          t {
            ...FragT
            d {
              n
            }
            a
          }
        }
      `,
      expanded: `
        {
          t {
            b {
              __typename
              x
            }
            c
            d {
              m
              n
            }
            a
          }
        }
      `,
    });
  });

  test('handles fragment matching subset of inline fragment selection', () => {
    // Pretty much the same test than the previous one, but matching inside a fragment selection inside
    // of inside a field selection.
    const schema = parseSchema(`
      type Query {
        i: I
      }

      interface I {
        a: String
      }

      type T {
        a: String
        b: B
        c: Int
        d: D
      }

      type B {
        x: String
        y: String
      }

      type D {
        m: String
        n: String
      }
    `);

    testFragmentsRoundtrip({
      schema,
      query: `
        fragment FragT on T {
          b {
            __typename
            x
          }
          c
          d {
            m
          }
        }

        {
          i {
            ... on T {
              ...FragT
              d {
                n
              }
              a
            }
          }
        }
      `,
      expanded: `
        {
          i {
            ... on T {
              b {
                __typename
                x
              }
              c
              d {
                m
                n
              }
              a
            }
          }
        }
      `,
    });
  });

  test('intersecting fragments', () => {
    const schema = parseSchema(`
      type Query {
        t: T
      }

      type T {
        a: String
        b: B
        c: Int
        d: D
      }

      type B {
        x: String
        y: String
      }

      type D {
        m: String
        n: String
      }
    `);

    testFragmentsRoundtrip({
      schema,
      // Note: the code that reuse fragments iterates on fragments in the order they are defined in the document, but when it reuse
      // a fragment, it puts it at the beginning of the selection (somewhat random, it just feel often easier to read), so the net
      // effect on this example is that `Frag2`, which will be reused after `Frag1` will appear first in the re-optimized selection.
      // So we put it first in the input too so that input and output actually match (the `testFragmentsRoundtrip` compares strings,
      // so it is sensible to ordering; we could theoretically use `Operation.equals` instead of string equality, which wouldn't
      // really on ordering, but `Operation.equals` is not entirely trivial and comparing strings make problem a bit more obvious).
      query: `
        fragment Frag1 on T {
          b {
            x
          }
          c
          d {
            m
          }
        }

        fragment Frag2 on T {
          a
          b {
            __typename
            x
          }
          d {
            m
            n
          }
        }

        {
          t {
            ...Frag2
            ...Frag1
          }
        }
      `,
      expanded: `
        {
          t {
            a
            b {
              __typename
              x
            }
            d {
              m
              n
            }
            c
          }
        }
      `,
    });
  });

  test('fragments whose application makes a type condition trivial', () => {
    const schema = parseSchema(`
      type Query {
        t: T
      }

      interface I {
        x: String
      }

      type T implements I {
        x: String
        a: String
      }
    `);

    testFragmentsRoundtrip({
      schema,
      query: `
        fragment FragI on I {
          x
          ... on T {
            a
          }
        }

        {
          t {
            ...FragI
          }
        }
      `,
      expanded: `
        {
          t {
            x
            a
          }
        }
      `,
    });
  });

  test('handles fragment matching at the top level of another fragment', () => {
    const schema = parseSchema(`
      type Query {
        t: T
      }

      type T {
        a: String
        u: U
      }

      type U {
        x: String
        y: String
      }
    `);

    testFragmentsRoundtrip({
      schema,
      query: `
        fragment Frag1 on T {
          a
        }

        fragment Frag2 on T {
          u {
            x
            y
          }
          ...Frag1
        }

        fragment Frag3 on Query {
          t {
            ...Frag2
          }
        }

        {
          ...Frag3
        }
      `,
      expanded: `
        {
          t {
            u {
              x
              y
            }
            a
          }
        }
      `,
    });
  });

  test('handles fragments used in a context where they get trimmed', () => {
    const schema = parseSchema(`
      type Query {
        t1: T1
      }

      interface I {
        x: Int
      }

      type T1 implements I {
        x: Int
        y: Int
      }

      type T2 implements I {
        x: Int
        z: Int
      }
    `);

    testFragmentsRoundtrip({
      schema,
      query: `
        fragment FragOnI on I {
          ... on T1 {
            y
          }
          ... on T2 {
            z
          }
        }

        {
          t1 {
            ...FragOnI
          }
        }
      `,
      expanded: `
        {
          t1 {
            y
          }
        }
      `,
    });
  });

  describe('applied directives', () => {
    test('reuse fragments with directives on the fragment, but only when there is those directives', () => {
      const schema = parseSchema(`
        type Query {
          t1: T
          t2: T
          t3: T
        }

        type T {
          a: Int
          b: Int
          c: Int
          d: Int
        }
      `);

      testFragmentsRoundtrip({
        schema,
        query: `
          fragment DirectiveOnDef on T @include(if: $cond1) {
            a
          }

          query myQuery($cond1: Boolean!, $cond2: Boolean!) {
            t1 {
              ...DirectiveOnDef
            }
            t2 {
              ... on T @include(if: $cond2) {
                a
              }
            }
            t3 {
              ...DirectiveOnDef @include(if: $cond2)
            }
          }
        `,
        expanded: `
          query myQuery($cond1: Boolean!, $cond2: Boolean!) {
            t1 {
              ... on T @include(if: $cond1) {
                a
              }
            }
            t2 {
              ... on T @include(if: $cond2) {
                a
              }
            }
            t3 {
              ... on T @include(if: $cond1) @include(if: $cond2) {
                a
              }
            }
          }
        `,
      });
    });

    test('reuse fragments with directives in the fragment selection, but only when there is those directives', () => {
      const schema = parseSchema(`
        type Query {
          t1: T
          t2: T
          t3: T
        }

        type T {
          a: Int
          b: Int
          c: Int
          d: Int
        }
      `);

      testFragmentsRoundtrip({
        schema,
        query: `
          fragment DirectiveInDef on T {
            a @include(if: $cond1)
          }

          query myQuery($cond1: Boolean!, $cond2: Boolean!) {
            t1 {
              a
            }
            t2 {
              ...DirectiveInDef
            }
            t3 {
              a @include(if: $cond2)
            }
          }
        `,
        expanded: `
          query myQuery($cond1: Boolean!, $cond2: Boolean!) {
            t1 {
              a
            }
            t2 {
              a @include(if: $cond1)
            }
            t3 {
              a @include(if: $cond2)
            }
          }
        `,
      });
    });

    test('reuse fragments with directives on spread, but only when there is those directives', () => {
      const schema = parseSchema(`
        type Query {
          t1: T
          t2: T
          t3: T
        }

        type T {
          a: Int
          b: Int
          c: Int
          d: Int
        }
      `);

      testFragmentsRoundtrip({
        schema,
        query: `
          fragment NoDirectiveDef on T {
            a
          }

          query myQuery($cond1: Boolean!) {
            t1 {
              ...NoDirectiveDef
            }
            t2 {
              ...NoDirectiveDef @include(if: $cond1)
            }
          }
        `,
        expanded: `
          query myQuery($cond1: Boolean!) {
            t1 {
              a
            }
            t2 {
              ... on T @include(if: $cond1) {
                a
              }
            }
          }
        `,
      });
    });
  });
});

describe('validations', () => {
  test.each([
    { directive: '@defer', rootKind: 'mutation' },
    { directive: '@defer', rootKind: 'subscription' },
    { directive: '@stream', rootKind: 'mutation' },
    { directive: '@stream', rootKind: 'subscription' },
  ])('reject $directive on $rootKind type', ({ directive, rootKind }) => {
    const schema = parseSchema(`
      type Query {
        x: String
      }

      type Mutation {
        x: String
      }

      type Subscription {
        x: String
      }
    `);

    expect(() => {
      parseOperation(schema, `
        ${rootKind} {
          ... ${directive} {
            x
          }
        }
      `)
    }).toThrowError(new GraphQLError(`The @defer and @stream directives cannot be used on ${rootKind} root type "${defaultRootName(rootKind as SchemaRootKind)}"`));
  });

  test('allows nullable variable for non-nullable input field with default', () => {
    const schema = parseSchema(`
      input I {
        x: Int! = 42
      }

      type Query {
        f(i: I): Int
      }
    `);

    // Just testing that this parse correctly and does not throw an exception.
    parseOperation(schema, `
      query test($x: Int) {
        f(i: { x: $x })
      }
    `);
  });
});

describe('empty branches removal', () => {
  const schema = parseSchema(`
    type Query {
      t: T
      u: Int
    }

    type T {
      a: Int
      b: Int
      c: C
    }

    type C {
      x: String
      y: String
    }
  `);

  const withoutEmptyBranches = (op: string | SelectionSetNode) => {
    let operation: Operation;
    if (typeof op === 'string') {
      operation = parseOperation(schema, op);
    } else {
      // Note that testing the removal of empty branches requires to take inputs that are not valid operations in the first place,
      // so we can't build those from `parseOperation` (this call the graphQL-js `parse` under the hood, and there is no way to
      // disable validation for that method). So instead, we manually build the AST (using some helper methods defined above) and
      // build the operation from there, disabling validation.
      const opDef: OperationDefinitionNode = {
        kind: Kind.OPERATION_DEFINITION,
        operation: OperationTypeNode.QUERY,
        selectionSet: op,
      }
      const document: DocumentNode = {
        kind: Kind.DOCUMENT,
        definitions: [opDef],
      }
      operation = operationFromDocument(schema, document, { validate: false });
    }
    return operation.selectionSet.withoutEmptyBranches()?.toString()
  };


  it.each([
    '{ t { a } }',
    '{ t { a b } }',
    '{ t { a c { x y } } }',
  ])('is identity if there is no empty branch', (op) => {
    expect(withoutEmptyBranches(op)).toBe(op);
  });

  it('removes simple empty branches', () => {
    expect(withoutEmptyBranches(
      astSSet(
        astField('t', astSSet(
          astField('a'),
          astField('c', astSSet()),
        ))
      )
    )).toBe('{ t { a } }');

    expect(withoutEmptyBranches(
      astSSet(
        astField('t', astSSet(
          astField('c', astSSet()),
          astField('a'),
        ))
      )
    )).toBe('{ t { a } }');

    expect(withoutEmptyBranches(
      astSSet(
        astField('t', astSSet())
      )
    )).toBeUndefined();
  });

  it('removes cascading empty branches', () => {
    expect(withoutEmptyBranches(
      astSSet(
        astField('t', astSSet(
          astField('c', astSSet()),
        ))
      )
    )).toBeUndefined();

    expect(withoutEmptyBranches(
      astSSet(
        astField('u'),
        astField('t', astSSet(
          astField('c', astSSet()),
        ))
      )
    )).toBe('{ u }');

    expect(withoutEmptyBranches(
      astSSet(
        astField('t', astSSet(
          astField('c', astSSet()),
        )),
        astField('u'),
      )
    )).toBe('{ u }');
  });
});

describe('basic operations', () => {
  const schema = parseSchema(`
    type Query {
      t: T
      i: I
    }

    type T {
      v1: Int
      v2: String
      v3: I
    }

    interface I {
      x: Int
      y: Int
    }

    type A implements I {
      x: Int
      y: Int
      a1: String
      a2: String
    }

    type B implements I {
      x: Int
      y: Int
      b1: Int
      b2: T
    }
  `);

  const operation = parseOperation(schema, `
    {
      t {
        v1
        v3 {
          x
        }
      }
      i {
        ... on A {
          a1
          a2
        }
        ... on B {
          y
          b2 {
           v2
          }
        }
      }
    }
  `);

  test('forEachElement', () => {
    // We collect a pair of (parent type, field-or-fragment).
    const actual: [string, string][] = [];
    operation.selectionSet.forEachElement((elt) => actual.push([elt.parentType.name, elt.toString()]));
    expect(actual).toStrictEqual([
      ['Query', 't'],
      ['T', 'v1'],
      ['T', 'v3'],
      ['I', 'x'],
      ['Query', 'i'],
      ['I', '... on A'],
      ['A', 'a1'],
      ['A', 'a2'],
      ['I', '... on B'],
      ['B', 'y'],
      ['B', 'b2'],
      ['T', 'v2'],
    ]);
  })
});

describe('MutableSelectionSet', () => {
  test('memoizer', () => {
    const schema = parseSchema(`
      type Query {
        t: T
      }

      type T {
        v1: Int
        v2: String
        v3: Int
        v4: Int
      }
    `);

    type Value = {
      count: number
    };

    let calls = 0;
    const sets: string[] = [];

    const queryType = schema.schemaDefinition.rootType('query')!;
    const ss = MutableSelectionSet.emptyWithMemoized<Value>(
      queryType,
      (s) => {
        sets.push(s.toString());
        return { count: ++calls };
      }
    );

    expect(ss.memoized().count).toBe(1);
    // Calling a 2nd time with no change to make sure we're not re-generating the value.
    expect(ss.memoized().count).toBe(1);

    ss.updates().add(parseOperation(schema, `{ t { v1 } }`).selectionSet);

    expect(ss.memoized().count).toBe(2);
    expect(sets).toStrictEqual(['{}', '{ t { v1 } }']);

    ss.updates().add(parseOperation(schema, `{ t { v3 } }`).selectionSet);

    expect(ss.memoized().count).toBe(3);
    expect(sets).toStrictEqual(['{}', '{ t { v1 } }', '{ t { v1 v3 } }']);

    // Still making sure we don't re-compute without updates.
    expect(ss.memoized().count).toBe(3);

    const cloned = ss.clone();
    expect(cloned.memoized().count).toBe(3);

    cloned.updates().add(parseOperation(schema, `{ t { v2 } }`).selectionSet);

    // The value of `ss` should not have be recomputed, so it should still be 3.
    expect(ss.memoized().count).toBe(3);
    // But that of the clone should have changed.
    expect(cloned.memoized().count).toBe(4);
    expect(sets).toStrictEqual(['{}', '{ t { v1 } }', '{ t { v1 v3 } }', '{ t { v1 v3 v2 } }']);

    // And here we make sure that if we update the fist selection, we don't have v3 in the set received
    ss.updates().add(parseOperation(schema, `{ t { v4 } }`).selectionSet);
    // Here, only `ss` memoized value has been recomputed. But since both increment the same `calls` variable,
    // the total count should be 5 (even if the previous count for `ss` was only 3).
    expect(ss.memoized().count).toBe(5);
    expect(cloned.memoized().count).toBe(4);
    expect(sets).toStrictEqual(['{}', '{ t { v1 } }', '{ t { v1 v3 } }', '{ t { v1 v3 v2 } }', '{ t { v1 v3 v4 } }']);
  });
});

describe('unsatisfiable branches removal', () => {
  const schema = parseSchema(`
    type Query {
      i: I
      j: J
    }

    interface I {
      a: Int
      b: Int
    }

    interface J {
      b: Int
    }

    type T1 implements I & J {
      a: Int
      b: Int
      c: Int
    }

    type T2 implements I {
      a: Int
      b: Int
      d: Int
    }

    type T3 implements J {
      a: Int
      b: Int
      d: Int
    }
  `);

  const withoutUnsatisfiableBranches = (op: string) => {
    return parseOperation(schema, op).trimUnsatisfiableBranches().toString(false, false)
  };


  it.each([
    '{ i { a } }',
    '{ i { ... on T1 { a b c } } }',
  ])('is identity if there is no unsatisfiable branches', (op) => {
    expect(withoutUnsatisfiableBranches(op)).toBe(op);
  });

  it.each([
    { input: '{ i { ... on I { a } } }', output: '{ i { a } }' },
    { input: '{ i { ... on T1 { ... on I { a b } } } }', output: '{ i { ... on T1 { a b } } }' },
    { input: '{ i { ... on I { a ... on T2 { d } } } }', output: '{ i { a ... on T2 { d } } }' },
    { input: '{ i { ... on T2 { ... on I { a ... on J { b } } } } }', output: '{ i { ... on T2 { a } } }' },
  ])('removes unsatisfiable branches', ({input, output}) => {
    expect(withoutUnsatisfiableBranches(input)).toBe(output);
  });
});
