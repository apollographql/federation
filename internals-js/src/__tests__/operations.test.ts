import {
  defaultRootName,
  isCompositeType,
  Schema,
  SchemaRootKind,
} from '../../dist/definitions';
import { buildSchema } from '../../dist/buildSchema';
import { FederationBlueprint } from '../../dist/federation';
import { fragmentify, FragmentRestrictionAtType, MutableSelectionSet, NamedFragmentDefinition, Operation, operationFromDocument, operationToDocument, parseOperation } from '../../dist/operations';
import './matchers';
import { DocumentNode, FieldNode, GraphQLError, Kind, OperationDefinitionNode, OperationTypeNode, parse, print, SelectionNode, SelectionSetNode, validate } from 'graphql';
import { assert } from '../utils';
import gql from 'graphql-tag';

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
    const withoutFragments = operation.expandAllFragments();

    expect(withoutFragments.toString()).toMatchString(expanded);

    // We force keeping all reused fragments, even if they are used only once, because the tests using
    // this are just about testing the reuse of fragments and this make things shorter/easier to write.
    // There is tests in `buildPlan.test.ts` that double-check that we don't reuse fragments used only
    // once in actual query plans.
    const optimized = withoutFragments.optimize(operation.fragments!, 1);
    expect(optimized.toString()).toMatchString(operation.toString());
  }

  test('optimize fragments using other fragments when possible', () => {
    const schema = parseSchema(`
      type Query {
        t: I
      }

      interface I {
        b: Int
        u: U
      }

      type T1 implements I {
        a: Int
        b: Int
        u: U
      }

      type T2 implements I {
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

    const withoutFragments = operation.expandAllFragments();
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
          b
          u {
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
    `);

    const optimized = withoutFragments.optimize(operation.fragments!);
    expect(optimized.toString()).toMatchString(`
      fragment OnU on U {
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

      {
        t {
          ...OnU
          u {
            ...OnU
          }
        }
      }
    `);
  });

  test('handles fragments using other fragments', () => {
    const schema = parseSchema(`
      type Query {
        t: I
      }

      interface I {
        b: Int
        c: Int
        u1: U
        u2: U
      }

      type T1 implements I {
        a: Int
        b: Int
        c: Int
        me: T1
        u1: U
        u2: U
      }

      type T2 implements I {
        x: String
        y: String
        b: Int
        c: Int
        u1: U
        u2: U
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
        c
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
          u1 {
            ...OnU
          }
          u2 {
            ...OnU
          }
          ... on T1 {
            me {
              ...OnI
            }
          }
        }
      }
    `);

    const withoutFragments = operation.expandAllFragments();
    expect(withoutFragments.toString()).toMatchString(`
      {
        t {
          ... on T1 {
            a
            b
            me {
              b
              c
            }
          }
          ... on T2 {
            x
            y
          }
          u1 {
            ... on I {
              b
              c
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
          u2 {
            ... on I {
              b
              c
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
    `);

    const optimized = withoutFragments.optimize(operation.fragments!);
    // We should reuse and keep all fragments, because 1) onU is used twice and 2)
    // all the other ones are used once in the query, and once in onU definition.
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
        c
      }

      fragment OnU on U {
        ...OnI
        ...OnT1
        ...OnT2
      }

      {
        t {
          ... on T1 {
            ...OnT1
            me {
              ...OnI
            }
          }
          ...OnT2
          u1 {
            ...OnU
          }
          u2 {
            ...OnU
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
            ...Frag1
            ...Frag2
          }
        }
      `,
      expanded: `
        {
          t {
            b {
              x
              __typename
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

  test('handles fragments used in the context of non-intersecting abstract types', () => {
    const schema = parseSchema(`
      type Query {
        i2: I2
      }

      interface I1 {
        x: Int
      }

      interface I2 {
        y: Int
      }

      interface I3 {
        z: Int
      }

      type T1 implements I1 & I2 {
        x: Int
        y: Int
      }

      type T2 implements I1 & I3 {
        x: Int
        z: Int
      }
    `);

    testFragmentsRoundtrip({
      schema,
      query: `
        fragment FragOnI1 on I1 {
          ... on I2 {
            y
          }
          ... on I3 {
            z
          }
        }

        {
          i2 {
            ...FragOnI1
          }
        }
      `,
      expanded: `
        {
          i2 {
            ... on I1 {
              ... on I2 {
                y
              }
              ... on I3 {
                z
              }
            }
          }
        }
      `,
    });
  });

  test('handles fragments on union in context with limited intersection', () => {
    const schema = parseSchema(`
      type Query {
        t1: T1
      }

      union U = T1 | T2

      type T1 {
        x: Int
      }

      type T2 {
        y: Int
      }
    `);

    testFragmentsRoundtrip({
      schema,
      query: `
        fragment OnU on U {
          ... on T1 {
            x
          }
          ... on T2 {
            y
          }
        }

        {
          t1 {
            ...OnU
          }
        }
      `,
      expanded: `
        {
          t1 {
            x
          }
        }
      `,
    });
  });

  test('off by 1 error', () => {
    const schema = buildSchema(`#graphql
      type Query {
        t: T
      }
      type T {
        id: String!
        a: A
        v: V
      }
      type A {
        id: String!
      }
      type V {
        t: T!
      }
    `);

    const operation = parseOperation(schema, `
      {
        t {
          ...TFrag
          v {
            t {
              id
              a {
                __typename
                id
              }
            }
          }
        }
      }

      fragment TFrag on T {
        __typename
        id
      }
    `);

    const withoutFragments = operation.expandAllFragments();
    expect(withoutFragments.toString()).toMatchString(`
      {
        t {
          __typename
          id
          v {
            t {
              id
              a {
                __typename
                id
              }
            }
          }
        }
      }
    `);

    const optimized = withoutFragments.optimize(operation.fragments!);
    expect(optimized.toString()).toMatchString(`
      fragment TFrag on T {
        __typename
        id
      }

      {
        t {
          ...TFrag
          v {
            t {
              ...TFrag
              a {
                __typename
                id
              }
            }
          }
        }
      }
    `);
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

  describe('does not generate invalid operations', () => {
    test('due to conflict between selection and reused fragment', () => {
      const schema = parseSchema(`
        type Query {
          t1: T1
          i: I
        }

        interface I {
          id: ID!
        }

        interface WithF {
          f(arg: Int): Int
        }

        type T1 implements I {
          id: ID!
          f(arg: Int): Int
        }

        type T2 implements I & WithF {
          id: ID!
          f(arg: Int): Int
        }
      `);
      const gqlSchema = schema.toGraphQLJSSchema();

      const operation = parseOperation(schema, `
        query {
          t1 {
            id
            f(arg: 0)
          }
          i {
            ...F1
          }
        }

        fragment F1 on I {
          id
          ... on WithF {
            f(arg: 1)
          }
        }
      `);
      expect(validate(gqlSchema, parse(operation.toString()))).toStrictEqual([]);

      const withoutFragments = operation.expandAllFragments();
      expect(withoutFragments.toString()).toMatchString(`
        {
          t1 {
            id
            f(arg: 0)
          }
          i {
            id
            ... on WithF {
              f(arg: 1)
            }
          }
        }
      `);

      // Note that technically, `t1` has return type `T1` which is a `I`, so `F1` can be spread
      // within `t1`, and `t1 { ...F1 }` is just `t1 { id }` (because `T!` does not implement `WithF`),
      // so that it would appear that it could be valid to optimize this query into:
      //   {
      //     t1 {
      //       ...F1       // Notice the use of F1 here, which does expand to `id` in this context
      //       f(arg: 0)
      //     }
      //     i {
      //       ...F1
      //     }
      //   }
      // And while doing this may look "dumb" in that toy example (we're replacing `id` with `...F1`
      // which is longer so less optimal really), it's easy to expand this to example where re-using
      // `F1` this way _does_ make things smaller.
      //
      // But the query above is actually invalid. And it is invalid because the validation of graphQL
      // does not take into account the fact that the `... on WithF` part of `F1` is basically dead
      // code within `t1`. And so it finds a conflict between `f(arg: 0)` and the `f(arg: 1)` in `F1`
      // (even though, again, the later is statically known to never apply, but graphQL does not
      // include such static analysis in its validation).
      //
      // And so this test does make sure we do not generate the query above (do not use `F1` in `t1`).
      const optimized = withoutFragments.optimize(operation.fragments!, 1);
      expect(validate(gqlSchema, parse(optimized.toString()))).toStrictEqual([]);

      expect(optimized.toString()).toMatchString(`
        fragment F1 on I {
          id
          ... on WithF {
            f(arg: 1)
          }
        }

        {
          t1 {
            id
            f(arg: 0)
          }
          i {
            ...F1
          }
        }
      `);
    });

    test('due to conflict between the active selection of a reused fragment and the trimmed part of another fragments', () => {
      const schema = parseSchema(`
        type Query {
          t1: T1
          i: I
        }

        interface I {
          id: ID!
        }

        interface WithF {
          f(arg: Int): Int
        }

        type T1 implements I {
          id: ID!
          f(arg: Int): Int
        }

        type T2 implements I & WithF {
          id: ID!
          f(arg: Int): Int
        }
      `);
      const gqlSchema = schema.toGraphQLJSSchema();

      const operation = parseOperation(schema, `
        query {
          t1 {
            id
            ...F1
          }
          i {
            ...F2
          }
        }

        fragment F1 on T1 {
          f(arg: 0)
        }

        fragment F2 on I {
          id
          ... on WithF {
            f(arg: 1)
          }
        }

      `);
      expect(validate(gqlSchema, parse(operation.toString()))).toStrictEqual([]);

      const withoutFragments = operation.expandAllFragments();
      expect(withoutFragments.toString()).toMatchString(`
        {
          t1 {
            id
            f(arg: 0)
          }
          i {
            id
            ... on WithF {
              f(arg: 1)
            }
          }
        }
      `);

      // See the comments on the previous test. The only different here is that `F1` is applied
      // first, and then we need to make sure we do not apply `F2` even though it's restriction
      // inside `t1` matches its selection set.
      const optimized = withoutFragments.optimize(operation.fragments!, 1);
      expect(validate(gqlSchema, parse(optimized.toString()))).toStrictEqual([]);

      expect(optimized.toString()).toMatchString(`
        fragment F1 on T1 {
          f(arg: 0)
        }

        fragment F2 on I {
          id
          ... on WithF {
            f(arg: 1)
          }
        }

        {
          t1 {
            ...F1
            id
          }
          i {
            ...F2
          }
        }
      `);
    });

    test('due to conflict between the trimmed parts of 2 fragments', () => {
      const schema = parseSchema(`
        type Query {
          t1: T1
          i1: I
          i2: I
        }

        interface I {
          id: ID!
          a: Int
          b: Int
        }

        interface WithF {
          f(arg: Int): Int
        }

        type T1 implements I {
          id: ID!
          a: Int
          b: Int
          f(arg: Int): Int
        }

        type T2 implements I & WithF {
          id: ID!
          a: Int
          b: Int
          f(arg: Int): Int
        }
      `);
      const gqlSchema = schema.toGraphQLJSSchema();

      const operation = parseOperation(schema, `
        query {
          t1 {
            id
            a
            b
          }
          i1 {
            ...F1
          }
          i2 {
            ...F2
          }
        }

        fragment F1 on I {
          id
          a
          ... on WithF {
            f(arg: 0)
          }
        }

        fragment F2 on I {
          id
          b
          ... on WithF {
            f(arg: 1)
          }
        }

      `);
      expect(validate(gqlSchema, parse(operation.toString()))).toStrictEqual([]);

      const withoutFragments = operation.expandAllFragments();
      expect(withoutFragments.toString()).toMatchString(`
        {
          t1 {
            id
            a
            b
          }
          i1 {
            id
            a
            ... on WithF {
              f(arg: 0)
            }
          }
          i2 {
            id
            b
            ... on WithF {
              f(arg: 1)
            }
          }
        }
      `);

      // Here, `F1` in `T1` reduces to `{ id a }` and F2 reduces to `{ id b }`, so theoretically both could be used
      // within the first `T1` branch. But they can't both be used because their `... on WithF` part conflict,
      // and even though that part is dead in `T1`, this would still be illegal graphQL.
      const optimized = withoutFragments.optimize(operation.fragments!, 1);
      expect(validate(gqlSchema, parse(optimized.toString()))).toStrictEqual([]);

      expect(optimized.toString()).toMatchString(`
        fragment F1 on I {
          id
          a
          ... on WithF {
            f(arg: 0)
          }
        }

        fragment F2 on I {
          id
          b
          ... on WithF {
            f(arg: 1)
          }
        }

        {
          t1 {
            ...F1
            b
          }
          i1 {
            ...F1
          }
          i2 {
            ...F2
          }
        }
      `);
    });

    test('due to conflict between selection and reused fragment at different levels', () => {
      const schema = parseSchema(`
        type Query {
          t1: SomeV
          t2: SomeV
        }

        union SomeV = V1 | V2 | V3

        type V1 {
          x: String
        }

        type V2 {
          y: String!
        }

        type V3 {
          x: Int
        }
      `);
      const gqlSchema = schema.toGraphQLJSSchema();

      const operation = parseOperation(schema, `
        fragment onV1V2 on SomeV {
          ... on V1 {
            x
          }
          ... on V2 {
            y
          }
        }

        query {
          t1 {
            ...onV1V2
          }
          t2 {
            ... on V2 {
              y
            }
            ... on V3 {
              x
            }
          }
        }
      `);
      expect(validate(gqlSchema, parse(operation.toString()))).toStrictEqual([]);

      const withoutFragments = operation.expandAllFragments();
      expect(withoutFragments.toString()).toMatchString(`
        {
          t1 {
            ... on V1 {
              x
            }
            ... on V2 {
              y
            }
          }
          t2 {
            ... on V2 {
              y
            }
            ... on V3 {
              x
            }
          }
        }
      `);

      const optimized = withoutFragments.optimize(operation.fragments!, 1);
      expect(validate(gqlSchema, parse(optimized.toString()))).toStrictEqual([]);

      expect(optimized.toString()).toMatchString(`
        fragment onV1V2 on SomeV {
          ... on V1 {
            x
          }
          ... on V2 {
            y
          }
        }

        {
          t1 {
            ...onV1V2
          }
          t2 {
            ... on V2 {
              y
            }
            ... on V3 {
              x
            }
          }
        }
      `);
    });

    test('due to conflict between the trimmed parts of 2 fragments at different levels', () => {
      const schema = parseSchema(`
        type Query {
          t1: SomeV
          t2: SomeV
          t3: OtherV
        }

        union SomeV = V1 | V2 | V3
        union OtherV = V3

        type V1 {
          x: String
        }

        type V2 {
          x: Int
        }

        type V3 {
          y: String!
          z: String!
        }
      `);
      const gqlSchema = schema.toGraphQLJSSchema();

      const operation = parseOperation(schema, `
        fragment onV1V3 on SomeV {
          ... on V1 {
            x
          }
          ... on V3 {
            y
          }
        }

        fragment onV2V3 on SomeV {
          ... on V2 {
            x
          }
          ... on V3 {
            z
          }
        }

        query {
          t1 {
            ...onV1V3
          }
          t2 {
            ...onV2V3
          }
          t3 {
            ... on V3 {
              y
              z
            }
          }
        }
      `);
      expect(validate(gqlSchema, parse(operation.toString()))).toStrictEqual([]);

      const withoutFragments = operation.expandAllFragments();
      expect(withoutFragments.toString()).toMatchString(`
        {
          t1 {
            ... on V1 {
              x
            }
            ... on V3 {
              y
            }
          }
          t2 {
            ... on V2 {
              x
            }
            ... on V3 {
              z
            }
          }
          t3 {
            ... on V3 {
              y
              z
            }
          }
        }
      `);

      const optimized = withoutFragments.optimize(operation.fragments!, 1);
      expect(validate(gqlSchema, parse(optimized.toString()))).toStrictEqual([]);

      expect(optimized.toString()).toMatchString(`
        fragment onV1V3 on SomeV {
          ... on V1 {
            x
          }
          ... on V3 {
            y
          }
        }

        fragment onV2V3 on SomeV {
          ... on V2 {
            x
          }
          ... on V3 {
            z
          }
        }

        {
          t1 {
            ...onV1V3
          }
          t2 {
            ...onV2V3
          }
          t3 {
            ...onV1V3
            ... on V3 {
              z
            }
          }
        }
      `);
    });

    test('due to conflict between 2 sibling branches', () => {
      const schema = parseSchema(`
        type Query {
          t1: SomeV
          i: I
        }

        interface I {
          id: ID!
        }

        type T1 implements I {
          id: ID!
          t2: SomeV
        }

        type T2 implements I {
          id: ID!
          t2: SomeV
        }

        union SomeV = V1 | V2 | V3

        type V1 {
          x: String
        }

        type V2 {
          y: String!
        }

        type V3 {
          x: Int
        }
      `);
      const gqlSchema = schema.toGraphQLJSSchema();

      const operation = parseOperation(schema, `
        fragment onV1V2 on SomeV {
          ... on V1 {
            x
          }
          ... on V2 {
            y
          }
        }

        query {
          t1 {
            ...onV1V2
          }
          i {
            ... on T1 {
              t2 {
                ... on V2 {
                  y
                }
              }
            }
            ... on T2 {
              t2 {
                ... on V3 {
                  x
                }
              }
            }
          }
        }
      `);
      expect(validate(gqlSchema, parse(operation.toString()))).toStrictEqual([]);

      const withoutFragments = operation.expandAllFragments();
      expect(withoutFragments.toString()).toMatchString(`
        {
          t1 {
            ... on V1 {
              x
            }
            ... on V2 {
              y
            }
          }
          i {
            ... on T1 {
              t2 {
                ... on V2 {
                  y
                }
              }
            }
            ... on T2 {
              t2 {
                ... on V3 {
                  x
                }
              }
            }
          }
        }
      `);

      const optimized = withoutFragments.optimize(operation.fragments!, 1);
      expect(validate(gqlSchema, parse(optimized.toString()))).toStrictEqual([]);

      expect(optimized.toString()).toMatchString(`
        fragment onV1V2 on SomeV {
          ... on V1 {
            x
          }
          ... on V2 {
            y
          }
        }

        {
          t1 {
            ...onV1V2
          }
          i {
            ... on T1 {
              t2 {
                ... on V2 {
                  y
                }
              }
            }
            ... on T2 {
              t2 {
                ... on V3 {
                  x
                }
              }
            }
          }
        }
      `);
    });

    test('when a spread inside an expanded fragment should be "normalized away"', () => {
      const schema = parseSchema(`
        type Query {
          t1: T1
          i: I
        }

        interface I {
          id: ID!
        }

        type T1 implements I {
          id: ID!
          a: Int
        }

        type T2 implements I {
          id: ID!
          b: Int
          c: Int
        }
      `);
      const gqlSchema = schema.toGraphQLJSSchema();

      const operation = parseOperation(schema, `
        {
          t1 {
            ...GetAll
          }
          i {
            ...GetT2
          }
        }

        fragment GetAll on I {
           ... on T1 {
             a
           }
           ...GetT2
           ... on T2 {
             c
           }
        }

        fragment GetT2 on T2 {
           b
        }
      `);
      expect(validate(gqlSchema, parse(operation.toString()))).toStrictEqual([]);

      const withoutFragments = operation.expandAllFragments();
      expect(withoutFragments.toString()).toMatchString(`
        {
          t1 {
            a
          }
          i {
            ... on T2 {
              b
            }
          }
        }
      `);

      // As we re-optimize, we will initially generated the initial query. But
      // as we ask to only optimize fragments used more than once, the `GetAll`
      // fragment will be re-expanded (`GetT2` will not because the code will say
      // that it is used both in the expanded `GetAll` but also inside `i`).
      // But because `GetAll` is within `t1: T1`, that expansion should actually
      // get rid of anything `T2`-related.
      // This test exists because a previous version of the code was not correctly
      // "getting rid" of the `...GetT2` spread, keeping in the query, which is
      // invalid (we cannot have `...GetT2` inside `t1`).
      const optimized = withoutFragments.optimize(operation.fragments!, 2);
      expect(validate(gqlSchema, parse(optimized.toString()))).toStrictEqual([]);

      expect(optimized.toString()).toMatchString(`
        fragment GetT2 on T2 {
          b
        }

        {
          t1 {
            a
          }
          i {
            ...GetT2
          }
        }
      `);
    });

    test('due to the trimmed selection of nested fragments', () => {
      const schema = parseSchema(`
        type Query {
          u1: U
          u2: U
          u3: U
        }

        union U = S | T

        type T  {
          id: ID!
          vt: Int
        }

        interface I {
          vs: Int
        }

        type S implements I {
          vs: Int!
        }
      `);
      const gqlSchema = schema.toGraphQLJSSchema();

      const operation = parseOperation(schema, `
        {
          u1 {
            ...F1
          }
          u2 {
            ...F3
          }
          u3 {
            ...F3
          }
        }

        fragment F1 on U {
           ... on S {
             __typename
             vs
           }
           ... on T {
             __typename
             vt
           }
        }

        fragment F2 on T {
           __typename
           vt
        }

        fragment F3 on U {
           ... on I {
             vs
           }
           ...F2
        }
      `);
      expect(validate(gqlSchema, parse(operation.toString()))).toStrictEqual([]);

      const withoutFragments = operation.expandAllFragments();
      expect(withoutFragments.toString()).toMatchString(`
        {
          u1 {
            ... on S {
              __typename
              vs
            }
            ... on T {
              __typename
              vt
            }
          }
          u2 {
            ... on I {
              vs
            }
            ... on T {
              __typename
              vt
            }
          }
          u3 {
            ... on I {
              vs
            }
            ... on T {
              __typename
              vt
            }
          }
        }
      `);

      // We use `mapToExpandedSelectionSets` with a no-op mapper because this will still expand the selections
      // and re-optimize them, which 1) happens to match what happens in the query planner and 2) is necessary
      // for reproducing a bug that this test was initially added to cover.
      const newFragments = operation.fragments!.mapToExpandedSelectionSets((s) => s);
      const optimized = withoutFragments.optimize(newFragments, 2);
      expect(validate(gqlSchema, parse(optimized.toString()))).toStrictEqual([]);

      expect(optimized.toString()).toMatchString(`
        fragment F3 on U {
          ... on I {
            vs
          }
          ... on T {
            __typename
            vt
          }
        }

        {
          u1 {
            ... on S {
              __typename
              vs
            }
            ... on T {
              __typename
              vt
            }
          }
          u2 {
            ...F3
          }
          u3 {
            ...F3
          }
        }
      `);
    });
  });

  test('does not leave unused fragments', () => {
    const schema = parseSchema(`
      type Query {
        t1: T1
      }

      union U1 = T1 | T2 | T3
      union U2 =      T2 | T3

      type T1 {
        x: Int
      }

      type T2 {
        y: Int
      }

      type T3 {
        z: Int
      }
    `);
    const gqlSchema = schema.toGraphQLJSSchema();

    const operation = parseOperation(schema, `
      query {
        t1 {
          ...Outer
        }
      }

      fragment Outer on U1 {
        ... on T1 {
          x
        }
        ... on T2 {
          ... Inner
        }
        ... on T3 {
          ... Inner
        }
      }

      fragment Inner on U2 {
        ... on T2 {
          y
        }
      }
    `);
    expect(validate(gqlSchema, parse(operation.toString()))).toStrictEqual([]);

    const withoutFragments = operation.expandAllFragments();
    expect(withoutFragments.toString()).toMatchString(`
      {
        t1 {
          x
        }
      }
    `);

    // This is a bit of contrived example, but the reusing code will be able
    // to figure out that the `Outer` fragment can be reused and will initially
    // do so, but it's only use once, so it will expand it, which yields:
    // {
    //   t1 {
    //     ... on T1 {
    //       x
    //     }
    //     ... on T2 {
    //       ... Inner
    //     }
    //     ... on T3 {
    //       ... Inner
    //     }
    //   }
    // }
    // and so `Inner` will not be expanded (it's used twice). Except that
    // the `normalize` code is apply then and will _remove_ both instances
    // of `.... Inner`. Which is ok, but we must make sure the fragment
    // itself is removed since it is not used now, which this test ensures.
    const optimized = withoutFragments.optimize(operation.fragments!, 2);
    expect(validate(gqlSchema, parse(optimized.toString()))).toStrictEqual([]);

    expect(optimized.toString()).toMatchString(`
      {
        t1 {
          x
        }
      }
    `);
  });

  test('does not leave fragments only used by unused fragments', () => {
    // Similar to the previous test, but we artificially add a
    // fragment that is only used by the fragment that is finally
    // unused.

    const schema = parseSchema(`
      type Query {
        t1: T1
      }

      union U1 = T1 | T2 | T3
      union U2 =      T2 | T3

      type T1 {
        x: Int
      }

      type T2 {
        y1: Y
        y2: Y
      }

      type T3 {
        z: Int
      }

      type Y {
        v: Int
      }
    `);
    const gqlSchema = schema.toGraphQLJSSchema();

    const operation = parseOperation(schema, `
      query {
        t1 {
          ...Outer
        }
      }

      fragment Outer on U1 {
        ... on T1 {
          x
        }
        ... on T2 {
          ... Inner
        }
        ... on T3 {
          ... Inner
        }
      }

      fragment Inner on U2 {
        ... on T2 {
          y1 {
            ...WillBeUnused
          }
          y2 {
            ...WillBeUnused
          }
        }
      }

      fragment WillBeUnused on Y {
        v
      }
    `);
    expect(validate(gqlSchema, parse(operation.toString()))).toStrictEqual([]);

    const withoutFragments = operation.expandAllFragments();
    expect(withoutFragments.toString()).toMatchString(`
      {
        t1 {
          x
        }
      }
    `);

    const optimized = withoutFragments.optimize(operation.fragments!, 2);
    expect(validate(gqlSchema, parse(optimized.toString()))).toStrictEqual([]);

    expect(optimized.toString()).toMatchString(`
      {
        t1 {
          x
        }
      }
    `);
  });

  test('keeps fragments only used by other fragments (if they are used enough times)', () => {
    const schema = parseSchema(`
      type Query {
        t1: T
        t2: T
      }

      type T {
        a1: Int
        a2: Int
        b1: B
        b2: B
      }

      type B {
        x: Int
        y: Int
      }
    `);
    const gqlSchema = schema.toGraphQLJSSchema();

    const operation = parseOperation(schema, `
      query {
        t1 {
          ...TFields
        }
        t2 {
          ...TFields
        }
      }

      fragment TFields on T {
        ...DirectFieldsOfT
        b1 {
          ...BFields
        }
        b2 {
          ...BFields
        }
      }

      fragment DirectFieldsOfT on T {
        a1
        a2
      }

      fragment BFields on B {
        x
        y
      }
    `);
    expect(validate(gqlSchema, parse(operation.toString()))).toStrictEqual([]);

    const withoutFragments = operation.expandAllFragments();
    expect(withoutFragments.toString()).toMatchString(`
      {
        t1 {
          a1
          a2
          b1 {
            x
            y
          }
          b2 {
            x
            y
          }
        }
        t2 {
          a1
          a2
          b1 {
            x
            y
          }
          b2 {
            x
            y
          }
        }
      }
    `);

    const optimized = withoutFragments.optimize(operation.fragments!, 2);
    expect(validate(gqlSchema, parse(optimized.toString()))).toStrictEqual([]);

    // The `DirectFieldsOfT` fragments should not be kept as it is used only once within `TFields`,
    // but the `BFields` one should be kept.
    expect(optimized.toString()).toMatchString(`
      fragment BFields on B {
        x
        y
      }

      fragment TFields on T {
        a1
        a2
        b1 {
          ...BFields
        }
        b2 {
          ...BFields
        }
      }

      {
        t1 {
          ...TFields
        }
        t2 {
          ...TFields
        }
      }
    `);
  });

  describe('fragmentify', () => {
    test('inline fragments to fragment definitions', () => {
      const schema = parseSchema(`
        type Query {
          t: I
        }

        interface I {
          b: Int
          u: U
        }

        type T1 implements I {
          a: Int
          b: Int
          u: U
        }

        type T2 implements I {
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

      const withoutFragments = operation.expandAllFragments();
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
            b
            u {
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
      `);
      const fragmentifiedDocument = fragmentify(operationToDocument(withoutFragments), 1);
      const fragmentified = print(fragmentifiedDocument);
      expect(fragmentified).toMatchString(`
        {
          t {
            ...T1FragmentV1
            ...T2FragmentV1
            b
            u {
              ...IFragmentV1
              ...T1FragmentV1
              ...T2FragmentV1
            }
          }
        }

        fragment T1FragmentV1 on T1 {
          a
          b
        }

        fragment T2FragmentV1 on T2 {
          x
          y
        }

        fragment IFragmentV1 on I {
          b
        }
      `);
    });

    test.only(`wont create fragment definition for less than 2 selections`, () => {
      const schema = parseSchema(`
        type Query {
          t: I
        }

        interface I {
          b: Int
          u: U
        }

        type T1 implements I {
          a: Int
          b: Int
          u: U
        }

        type T2 implements I {
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

      const withoutFragments = operation.expandAllFragments();
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
            b
            u {
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
      `);
      const fragmentifiedDocument = fragmentify(operationToDocument(withoutFragments), 2);
      const fragmentified = print(fragmentifiedDocument);
      expect(fragmentified).toMatchString(`
        {
          t {
            ...T1FragmentV1
            ...T2FragmentV1
            b
            u {
              ... on I {
                b
              }
              ...T1FragmentV1
              ...T2FragmentV1
            }
          }
        }

        fragment T1FragmentV1 on T1 {
          a
          b
        }

        fragment T2FragmentV1 on T2 {
          x
          y
        }
      `);
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

    directive @customSkip(if: Boolean!, label: String!) on FIELD | INLINE_FRAGMENT
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

  describe('same field merging', () => {
    test('do merge when same field and no directive', () => {
      const operation = operationFromDocument(schema, gql`
        query Test {
          t {
            v1
          }
          t {
            v2
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test {
          t {
            v1
            v2
          }
        }
      `);
    });

    test('do merge when both have the _same_ directive', () => {
      const operation = operationFromDocument(schema, gql`
        query Test($skipIf: Boolean!) {
          t @skip(if: $skipIf) {
            v1
          }
          t @skip(if: $skipIf) {
            v2
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test($skipIf: Boolean!) {
          t @skip(if: $skipIf) {
            v1
            v2
          }
        }
      `);
    });

    test('do merge when both have the _same_ directive, even if argument order differs', () => {
      const operation = operationFromDocument(schema, gql`
        query Test($skipIf: Boolean!) {
          t @customSkip(if: $skipIf, label: "foo") {
            v1
          }
          t @customSkip(label: "foo", if: $skipIf) {
            v2
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test($skipIf: Boolean!) {
          t @customSkip(if: $skipIf, label: "foo") {
            v1
            v2
          }
        }
      `);
    });

    test('do not merge when one has a directive and the other do not', () => {
      const operation = operationFromDocument(schema, gql`
        query Test($skipIf: Boolean!) {
          t {
            v1
          }
          t @skip(if: $skipIf) {
            v2
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test($skipIf: Boolean!) {
          t {
            v1
          }
          t @skip(if: $skipIf) {
            v2
          }
        }
      `);
    });

    test('do not merge when both have _differing_ directives', () => {
      const operation = operationFromDocument(schema, gql`
        query Test($skip1: Boolean!, $skip2: Boolean!) {
          t @skip(if: $skip1) {
            v1
          }
          t @skip(if: $skip2) {
            v2
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test($skip1: Boolean!, $skip2: Boolean!) {
          t @skip(if: $skip1) {
            v1
          }
          t @skip(if: $skip2) {
            v2
          }
        }
      `);
    });

    test('do not merge @defer directive, even if applied the same way', () => {
      const operation = operationFromDocument(schema, gql`
        query Test {
          t @defer {
            v1
          }
          t @defer {
            v2
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test {
          t @defer {
            v1
          }
          t @defer {
            v2
          }
        }
      `);
    });
  });

  describe('same fragment merging', () => {
    test('do merge when same fragment and no directive', () => {
      const operation = operationFromDocument(schema, gql`
        query Test {
          t {
            ... on T {
              v1
            }
            ... on T {
              v2
            }
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test {
          t {
            ... on T {
              v1
              v2
            }
          }
        }
      `);
    });

    test('do merge when both have the _same_ directive', () => {
      const operation = operationFromDocument(schema, gql`
        query Test($skipIf: Boolean!) {
          t {
            ... on T @skip(if: $skipIf) {
              v1
            }
            ... on T @skip(if: $skipIf) {
              v2
            }
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test($skipIf: Boolean!) {
          t {
            ... on T @skip(if: $skipIf) {
              v1
              v2
            }
          }
        }
      `);
    });

    test('do merge when both have the _same_ directive, even if argument order differs', () => {
      const operation = operationFromDocument(schema, gql`
        query Test($skipIf: Boolean!) {
          t {
            ... on T @customSkip(if: $skipIf, label: "foo") {
              v1
            }
            ... on T @customSkip(label: "foo", if: $skipIf) {
              v2
            }
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test($skipIf: Boolean!) {
          t {
            ... on T @customSkip(if: $skipIf, label: "foo") {
              v1
              v2
            }
          }
        }
      `);
    });

    test('do not merge when one has a directive and the other do not', () => {
      const operation = operationFromDocument(schema, gql`
        query Test($skipIf: Boolean!) {
          t {
            ... on T {
              v1
            }
            ... on T @skip(if: $skipIf) {
              v2
            }
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test($skipIf: Boolean!) {
          t {
            ... on T {
              v1
            }
            ... on T @skip(if: $skipIf) {
              v2
            }
          }
        }
      `);
    });

    test('do not merge when both have _differing_ directives', () => {
      const operation = operationFromDocument(schema, gql`
        query Test($skip1: Boolean!, $skip2: Boolean!) {
          t {
            ... on T @skip(if: $skip1) {
              v1
            }
            ... on T @skip(if: $skip2) {
              v2
            }
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test($skip1: Boolean!, $skip2: Boolean!) {
          t {
            ... on T @skip(if: $skip1) {
              v1
            }
            ... on T @skip(if: $skip2) {
              v2
            }
          }
        }
      `);
    });

    test('do not merge @defer directive, even if applied the same way', () => {
      const operation = operationFromDocument(schema, gql`
        query Test {
          t {
            ... on T @defer {
              v1
            }
            ... on T @defer {
              v2
            }
          }
        }
      `);

      expect(operation.toString()).toMatchString(`
        query Test {
          t {
            ... on T @defer {
              v1
            }
            ... on T @defer {
              v2
            }
          }
        }
      `);
    });
  });
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

  const normalized = (op: string) => {
    return parseOperation(schema, op).normalize().toString(false, false)
  };


  it.each([
    '{ i { a } }',
    '{ i { ... on T1 { a b c } } }',
  ])('is identity if there is no unsatisfiable branches', (op) => {
    expect(normalized(op)).toBe(op);
  });

  it.each([
    { input: '{ i { ... on I { a } } }', output: '{ i { a } }' },
    { input: '{ i { ... on T1 { ... on I { a b } } } }', output: '{ i { ... on T1 { a b } } }' },
    { input: '{ i { ... on I { a ... on T2 { d } } } }', output: '{ i { a ... on T2 { d } } }' },
    { input: '{ i { ... on T2 { ... on I { a ... on J { b } } } } }', output: '{ i { ... on T2 { a } } }' },
  ])('removes unsatisfiable branches', ({input, output}) => {
    expect(normalized(input)).toBe(output);
  });
});

describe('named fragment selection set restrictions at type', () => {
  const expandAtType = (frag: NamedFragmentDefinition, schema: Schema, typeName: string): FragmentRestrictionAtType => {
    const type = schema.type(typeName);
    assert(type && isCompositeType(type), `Invalid type ${typeName}`)
    // `expandedSelectionSetAtType` assumes it's argument passes `canApplyAtType`, so let's make sure we're
    // not typo-ing something in our tests.
    assert(frag.canApplyDirectlyAtType(type), `${frag.name} cannot be applied at type ${typeName}`);
    return frag.expandedSelectionSetAtType(type);
  }

  test('for fragment on interfaces', () => {
    const schema = parseSchema(`
      type Query {
        t1: I1
      }

      interface I1 {
        x: Int
      }

      interface I2 {
        x: Int
      }

      interface I3 {
        x: Int
      }

      interface I4 {
        x: Int
      }

      type T1 implements I1 & I2 & I4 {
        x: Int
      }

      type T2 implements I1 & I3 & I4 {
        x: Int
      }
    `);

    const operation = parseOperation(schema, `
      {
        t1 {
          ...FonI1
        }
      }

      fragment FonI1 on I1 {
        x
        ... on T1 {
          x
        }
        ... on T2 {
          x
        }
        ... on I2 {
          x
        }
        ... on I3 {
          x
        }
      }
    `);

    const frag = operation.fragments?.get('FonI1')!;

    let { selectionSet, validator } = expandAtType(frag, schema, 'I1');
    expect(selectionSet.toString()).toBe('{ x ... on T1 { x } ... on T2 { x } ... on I2 { x } ... on I3 { x } }');
    expect(validator?.toString()).toBeUndefined();

    ({ selectionSet, validator } = expandAtType(frag, schema, 'T1'));
    expect(selectionSet.toString()).toBe('{ x }');
    // Note: one could remark that having `T1.x` in the `validator` below is a tad weird: this is
    // because in this case `normalized` removed that fragment and so when we do `normalized.minus(original)`,
    // then it shows up. It a tad difficult to avoid this however and it's ok for what we do (`validator`
    // is used to check for field conflict and save for efficiency, we could use the `original` instead).
    expect(validator?.toString()).toMatchString(`
      {
        x: [
          T1.x
          T2.x
          I2.x
          I3.x
        ]
      }
    `);
  });

  test('for fragment on unions', () => {
    const schema = parseSchema(`
      type Query {
        t1: U1
      }

      union U1 = T1 | T2
      union U2 = T1
      union U3 = T2
      union U4 = T1 | T2

      type T1 {
        x: Int
        y: Int
      }

      type T2 {
        z: Int
        w: Int
      }
    `);

    const operation = parseOperation(schema, `
      {
        t1 {
          ...FonU1
        }
      }

      fragment FonU1 on U1 {
        ... on T1 {
          x
        }
        ... on T2 {
          z
        }
        ... on U2 {
          ... on T1 {
            y
          }
        }
        ... on U3 {
          ... on T2 {
            w
          }
        }
      }
    `);

    const frag = operation.fragments?.get('FonU1')!;

    // Note that with unions, the fragments inside the unions can be "lifted" and so that everything normalizes to just the
    // possible runtimes.

    let { selectionSet, validator } = expandAtType(frag, schema, 'U1');
    expect(selectionSet.toString()).toBe('{ ... on T1 { x y } ... on T2 { z w } }');
    // Similar remarks than on interfaces (the validator is strictly speaking not necessary, but
    // this happens due to the "lifting" of selection mentioned above, is a bit hard to avoid,
    // and is essentially harmess (it may result in a bit more cpu cycles in some cases but
    // that is likely negligible).
    expect(validator?.toString()).toMatchString(`
      {
        y: [
          T1.y
        ]
        w: [
          T2.w
        ]
      }
    `);

    ({ selectionSet, validator } = expandAtType(frag, schema, 'U2'));
    expect(selectionSet.toString()).toBe('{ ... on T1 { x y } }');
    expect(validator?.toString()).toMatchString(`
      {
        z: [
          T2.z
        ]
        y: [
          T1.y
        ]
        w: [
          T2.w
        ]
      }
    `);

    ({ selectionSet, validator } = expandAtType(frag, schema, 'U3'));
    expect(selectionSet.toString()).toBe('{ ... on T2 { z w } }');
    expect(validator?.toString()).toMatchString(`
      {
        x: [
          T1.x
        ]
        y: [
          T1.y
        ]
        w: [
          T2.w
        ]
      }
    `);

    ({ selectionSet, validator } = expandAtType(frag, schema, 'T1'));
    expect(selectionSet.toString()).toBe('{ x y }');
    // Similar remarks that on interfaces
    expect(validator?.toString()).toMatchString(`
      {
        x: [
          T1.x
        ]
        z: [
          T2.z
        ]
        y: [
          T1.y
        ]
        w: [
          T2.w
        ]
      }
    `);
  });
});

describe('named fragment rebasing on subgraphs', () => {
  test('it skips unknown fields', () => {
    const schema = parseSchema(`
      type Query {
        t: T
      }

      type T {
        v0: Int
        v1: Int
        v2: Int
        u1: U
        u2: U
      }

      type U {
        v3: Int
        v4: Int
        v5: Int
      }
    `);

    const operation = parseOperation(schema, `
      query {
        t {
          ...FragOnT
        }
      }

      fragment FragOnT on T {
        v0
        v1
        v2
        u1 {
          v3
          v4
          v5
        }
        u2 {
          v4
          v5
        }
      }
    `);

    const fragments = operation.fragments;
    assert(fragments, 'Should have some fragments');

    const subgraph = parseSchema(`
      type Query {
        _: Int
      }

      type T {
        v1: Int
        u1: U
      }

      type U {
        v3: Int
        v5: Int
      }
    `);

    const rebased = fragments.rebaseOn(subgraph);
    expect(rebased?.toString('')).toMatchString(`
      fragment FragOnT on T {
        v1
        u1 {
          v3
          v5
        }
      }
    `);
  });

  test('it skips unknown type (on condition)', () => {
    const schema = parseSchema(`
      type Query {
        t: T
        u: U
      }

      type T {
        x: Int
        y: Int
      }

      type U {
        x: Int
        y: Int
      }
    `);

    const operation = parseOperation(schema, `
      query {
        t {
          ...FragOnT
        }
        u {
          ...FragOnU
        }
      }

      fragment FragOnT on T {
        x
        y
      }

      fragment FragOnU on U {
        x
        y
      }
    `);

    const fragments = operation.fragments;
    assert(fragments, 'Should have some fragments');

    const subgraph = parseSchema(`
      type Query {
        t: T
      }

      type T {
        x: Int
        y: Int
      }
    `);

    const rebased = fragments.rebaseOn(subgraph);
    expect(rebased?.toString('')).toMatchString(`
      fragment FragOnT on T {
        x
        y
      }
    `);
  });

  test('it skips unknown type (used inside fragment)', () => {
    const schema = parseSchema(`
      type Query {
        i: I
      }

      interface I {
        id: ID!
        otherId: ID!
      }

      type T1 implements I {
        id: ID!
        otherId: ID!
        x: Int
      }

      type T2 implements I {
        id: ID!
        otherId: ID!
        y: Int
      }
    `);

    const operation = parseOperation(schema, `
      query {
        i {
          ...FragOnI
        }
      }

      fragment FragOnI on I {
         id
         otherId
         ... on T1 {
           x
         }
         ... on T2 {
           y
         }
      }
    `);

    const fragments = operation.fragments;
    assert(fragments, 'Should have some fragments');

    const subgraph = parseSchema(`
      type Query {
        i: I
      }

      interface I {
        id: ID!
      }

      type T2 implements I {
        id: ID!
        y: Int
      }
    `);

    const rebased = fragments.rebaseOn(subgraph);
    expect(rebased?.toString('')).toMatchString(`
      fragment FragOnI on I {
        id
        ... on T2 {
          y
        }
      }
    `);
  });

  test('it skips __typename field for types that are potentially interface objects at runtime', () => {
    const schema = parseSchema(`
      type Query {
        i: I
      }

      interface I {
        id: ID!
        x: String!
      }
    `);

    const operation = parseOperation(schema, `
      query {
        i {
          ...FragOnI
        }
      }

      fragment FragOnI on I {
        __typename
        id
        x
      }
    `);

    const fragments = operation.fragments;
    assert(fragments, 'Should have some fragments');

    const subgraph = buildSchema(`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.5",
          import: [{ name: "@interfaceObject" }, { name: "@key" }]
        )

      type Query {
        i: I
      }

      type I @interfaceObject @key(fields: "id") {
        id: ID!
        x: String!
      }
      `,
      { blueprint: new FederationBlueprint(true) },
    );

    const rebased = fragments.rebaseOn(subgraph);
    expect(rebased?.toString('')).toMatchString(`
      fragment FragOnI on I {
        id
        x
      }
    `);
  });

  test('it skips fragments with no selection or trivial ones applying', () => {
    const schema = parseSchema(`
      type Query {
        t: T
      }

      type T {
        a: Int
        b: Int
        c: Int
        d: Int
      }
    `);

    const operation = parseOperation(schema, `
      query {
        t {
          ...F1
          ...F2
          ...F3
        }
      }

      fragment F1 on T {
         a
         b
      }

      fragment F2 on T {
         __typename
         a
         b
      }

      fragment F3 on T {
         __typename
         a
         b
         c
         d
      }
    `);

    const fragments = operation.fragments;
    assert(fragments, 'Should have some fragments');

    const subgraph = parseSchema(`
      type Query {
        t: T
      }

      type T {
        c: Int
        d: Int
      }
    `);

    // F1 reduces to nothing, and F2 reduces to just __typename so we shouldn't keep them.
    const rebased = fragments.rebaseOn(subgraph);
    expect(rebased?.toString('')).toMatchString(`
      fragment F3 on T {
        __typename
        c
        d
      }
    `);
  });

  test('it handles skipped fragments used by other fragments', () => {
    const schema = parseSchema(`
      type Query {
        t: T
      }

      type T {
        x: Int
        u: U
      }

      type U {
        y: Int
        z: Int
      }
    `);

    const operation = parseOperation(schema, `
      query {
        ...TheQuery
      }

      fragment TheQuery on Query {
        t {
          x
          ...GetU
        }
      }

      fragment GetU on T {
         u {
           y
           z
         }
      }
    `);

    const fragments = operation.fragments;
    assert(fragments, 'Should have some fragments');

    const subgraph = parseSchema(`
      type Query {
        t: T
      }

      type T {
        x: Int
      }
    `);

    const rebased = fragments.rebaseOn(subgraph);
    expect(rebased?.toString('')).toMatchString(`
      fragment TheQuery on Query {
        t {
          x
        }
      }
    `);
  });

  test('it handles fields whose type is a subtype in the subgarph', () => {
    const schema = parseSchema(`
      type Query {
        t: I
      }

      interface I {
         x: Int
         y: Int
      }

      type T implements I {
         x: Int
         y: Int
         z: Int
      }
    `);

    const operation = parseOperation(schema, `
      query {
        ...TQuery
      }

      fragment TQuery on Query {
        t {
          x
          y
          ... on T {
            z
          }
        }
      }
    `);

    const fragments = operation.fragments;
    assert(fragments, 'Should have some fragments');

    const subgraph = parseSchema(`
      type Query {
        t: T
      }

      type T {
         x: Int
         y: Int
         z: Int
      }
    `);

    const rebased = fragments.rebaseOn(subgraph);
    expect(rebased?.toString('')).toMatchString(`
      fragment TQuery on Query {
        t {
          x
          y
          z
        }
      }
    `);
  });
});
