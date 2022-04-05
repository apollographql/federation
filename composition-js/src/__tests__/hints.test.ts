import { asFed2SubgraphDocument, buildSubgraph, Subgraphs } from '@apollo/federation-internals';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import {
  HintCodeDefinition,
  HINTS,
} from '../hints';
import { MergeResult, mergeSubgraphs } from '../merging';

function mergeDocuments(...documents: DocumentNode[]): MergeResult {
  const subgraphs = new Subgraphs();
  let i = 1;
  for (const doc of documents) {
    const name = `Subgraph${i++}`;
    try {
      subgraphs.add(buildSubgraph(name, `https://${name}`, asFed2SubgraphDocument(doc)));
    } catch (e) {
      throw new Error(e.toString());
    }
  }
  return mergeSubgraphs(subgraphs);
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toRaiseHint(id: HintCodeDefinition, message: string): R;
    }
  }
}

expect.extend({
  toRaiseHint(mergeResult: MergeResult, expectedDefinition: HintCodeDefinition, message: string) {
    if (mergeResult.errors) {
      return {
        message: () => `Expected subgraphs to merge but got errors: [${mergeResult.errors.map(e => e.message).join(', ')}]`,
        pass: false
      };
    }

    const hints = mergeResult.hints;
    const expectedCode = expectedDefinition.code;
    const matchingHints = hints.filter(h => h.definition.code === expectedCode);
    if (matchingHints.length === 0) {
      const details = hints.length === 0
        ? 'no hint was raised'
        : `hints were raised with code(s): ${hints.map(h => h.definition.code).join(', ')}`;
      return {
        message: () => `Expected subgraphs merging to raise a ${expectedCode} hint, but ${details}`,
        pass: false
      };
    }
    for (const hint of matchingHints) {
      if (hint.message === message) {
        return {
          message: () => `Expected subgraphs merging to not raise hint ${expectedCode} with message '${message}', but it did`,
          pass: true
        }
      }
    }
    return {
      message: () => `Subgraphs merging did raise ${matchingHints.length} hint(s) with code ${expectedCode}, but none had the expected message:\n  ${message}\n`
         + `Instead, received messages:\n  ${matchingHints.map(h => h.message).join('\n  ')}`,
      pass: false
    }
  },
});

test('hints on merging field with nullable and non-nullable types', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    type T @shareable {
      f: String
    }
  `;

  const subgraph2 = gql`
    type T @shareable {
      f: String!
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_FIELD_TYPE,
    'Field "T.f" has mismatched, but compatible, types across subgraphs: '
    + 'will use type "String" (from subgraph "Subgraph1") in supergraph but "T.f" has subtype "String!" in subgraph "Subgraph2".'
  );
})

test('hints on merging field with subtype types', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    interface I {
      v: Int
    }

    type T @shareable {
      f: I
    }
  `;

  const subgraph2 = gql`
    interface I {
      v: Int
    }

    type Impl implements I {
      v: Int
    }

    type T @shareable {
      f: Impl
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_FIELD_TYPE,
    'Field "T.f" has mismatched, but compatible, types across subgraphs: '
    + 'will use type "I" (from subgraph "Subgraph1") in supergraph but "T.f" has subtype "Impl" in subgraph "Subgraph2".'
  );
})

test('hints on merging argument with nullable and non-nullable types', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    type T @shareable {
      f(a: String!): String
    }
  `;

  const subgraph2 = gql`
    type T @shareable {
      f(a: String): String
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_ARGUMENT_TYPE,
    'Argument "T.f(a:)" has mismatched, but compatible, types across subgraphs: '
    + 'will use type "String!" (from subgraph "Subgraph1") in supergraph but "T.f(a:)" has supertype "String" in subgraph "Subgraph2".'
  );
})

test('hints on merging argument with default value in only some subgraph', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    type T @shareable {
      f(a: String = "foo"): String
    }
  `;

  const subgraph2 = gql`
    type T @shareable {
      f(a: String): String
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_DEFAULT_VALUE,
    'Argument "T.f(a:)" has a default value in only some subgraphs: '
    + 'will not use a default in the supergraph (there is no default in subgraph "Subgraph2") but "T.f(a:)" has default value "foo" in subgraph "Subgraph1".'
  );
})

test('hints on object being an entity in only some subgraph', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    type T @key(fields: "k") {
      k: Int
      v1: String
    }
  `;

  const subgraph2 = gql`
    type T @shareable {
      k: Int
      v2: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_ENTITY,
    'Type "T" is declared as an entity (has a @key applied) in only some subgraphs: '
    + 'it has no key in subgraph "Subgraph2" but has one in subgraph "Subgraph1".'
  );
})

test('hints on field of object value type not being in all subgraphs', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    type T @shareable {
      a: Int
      b: Int
    }
  `;

  const subgraph2 = gql`
    type T @shareable {
      a: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_OBJECT_VALUE_TYPE_FIELD,
    'Field "T.b" of non-entity object type "T" is not defined in all the subgraphs defining "T" (but can always be resolved from these subgraphs): '
    + '"T.b" is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".'
  );
})

test('hints on field of interface value type not being in all subgraphs', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    interface T {
      a: Int
      b: Int
    }
  `;

  const subgraph2 = gql`
    interface T {
      a: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_INTERFACE_VALUE_TYPE_FIELD,
    'Field "T.b" of interface type "T" is not defined in all the subgraphs defining "T" (but can always be resolved from these subgraphs): '
    + '"T.b" is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".'
  );
})

test('hints on field of input object value type not being in all subgraphs', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    input T {
      a: Int
      b: Int
    }
  `;

  const subgraph2 = gql`
    input T {
      a: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_INPUT_OBJECT_FIELD,
    'Input object field "b" will not be added to "T" in the supergraph as it does not appear in all subgraphs: it is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".'
  );
})

test('hints on union member not being in all subgraphs', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    union T = A | B | C

    type A @shareable {
      a: Int
    }

    type B {
      b: Int
    }

    type C @shareable {
      b: Int
    }
  `;

  const subgraph2 = gql`
    union T = A | C

    type A @shareable {
      a: Int
    }

    type C @shareable {
      b: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_UNION_MEMBER,
    'Member type "B" in union type "T" is only defined in a subset of subgraphs defining "T" (but can always be resolved from these subgraphs): '
    + '"B" is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".'
  );
})

test('hints on enum type not being used', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    enum T {
      V1
      V2
    }
  `;

  const subgraph2 = gql`
    enum T {
      V1
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.UNUSED_ENUM_TYPE,
    'Enum type "T" is defined but unused. It will be included in the supergraph with all the values appearing in any subgraph ("as if" it was only used as an output type).'
  );
})

test('hints on enum value of input enum type not being in all subgraphs', () => {
  const subgraph1 = gql`
    type Query {
      a(t: T): Int
    }

    enum T {
      V1
      V2
    }
  `;

  const subgraph2 = gql`
    enum T {
      V1
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_ENUM_VALUE_FOR_INPUT_ENUM,
    'Value "V2" of enum type "T" will not be part of the supergraph as it is not defined in all the subgraphs defining "T": '
    + '"V2" is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".'
  );
})

test('hints on enum value of output enum type not being in all subgraphs', () => {
  const subgraph1 = gql`
    type Query {
      t: T
    }

    enum T {
      V1
      V2
    }
  `;

  const subgraph2 = gql`
    enum T {
      V1
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_ENUM_VALUE_FOR_OUTPUT_ENUM,
    'Value "V2" of enum type "T" has been added to the supergraph but is only defined in a subset of the subgraphs defining "T": '
    + '"V2" is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".'
  );
})

// Skipped for now because we don't merge any type system directives and so
// this cannot be properly tested.
test.skip('hints on type system directives having inconsistent repeatable', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    directive @tag(name: String!) repeatable on FIELD_DEFINITION
  `;

  const subgraph2 = gql`
    directive @tag(name: String!) on FIELD_DEFINITION
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE,
    'Type system directive "@tag" is marked repeatable in the supergraph but it is inconsistently marked repeatable in subgraphs: '
    + 'it is repeatable in subgraph "Subgraph1" but not in subgraph "Subgraph2".'
  );
})

// Skipped for now because we don't merge any type system directives and so
// this cannot be properly tested.
test.skip('hints on type system directives having inconsistent locations', () => {
  // Same as above, we kind of have to use tag.
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    directive @tag(name: String!) on FIELD_DEFINITION
  `;

  const subgraph2 = gql`
    directive @tag(name: String!) on INTERFACE
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_LOCATIONS,
    'Type system directive "@tag" has inconsistent locations across subgraphs '
    + 'and will use locations "FIELD_DEFINITION, INTERFACE" (union of all subgraphs) in the supergraph, but has: '
    + 'location "FIELD_DEFINITION" in subgraph "Subgraph1" and location "INTERFACE" in subgraph "Subgraph2".'
  );
})

test('hints on execution directives not being in all subgraphs', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    directive @t repeatable on QUERY
  `;

  const subgraph2 = gql`
    scalar s
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_EXECUTION_DIRECTIVE_PRESENCE,
    'Execution directive "@t" will not be part of the supergraph as it does not appear in all subgraphs: '
    + 'it is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".'
  );
})

test('hints on execution directives having no locations intersection', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    directive @t on QUERY
  `;

  const subgraph2 = gql`
    directive @t on FIELD
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.NO_EXECUTION_DIRECTIVE_LOCATIONS_INTERSECTION,
    'Execution directive "@t" has no location that is common to all subgraphs: '
    + 'it will not appear in the subgraph as there no intersection between location "QUERY" in subgraph "Subgraph1" and location "FIELD" in subgraph "Subgraph2".'
  );
})

test('hints on execution directives having inconsistent repeatable', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    directive @t repeatable on QUERY
  `;

  const subgraph2 = gql`
    directive @t on QUERY
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_EXECUTION_DIRECTIVE_REPEATABLE,
    'Execution directive "@t" will not be marked repeatable in the supergraph as it is inconsistently marked repeatable in subgraphs: '
    + 'it is not repeatable in subgraph "Subgraph2" but is repeatable in subgraph "Subgraph1".'
  );
})

test('hints on execution directives having inconsistent locations', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    directive @t on QUERY | FIELD
  `;

  const subgraph2 = gql`
    directive @t on FIELD
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_EXECUTION_DIRECTIVE_LOCATIONS,
    'Execution directive "@t" has inconsistent locations across subgraphs '
    + 'and will use location "FIELD" (intersection of all subgraphs) in the supergraph, but has: '
    + 'location "FIELD" in subgraph "Subgraph2" and locations "FIELD, QUERY" in subgraph "Subgraph1".'
  );
})

test('hints on execution directives argument not being in all subgraphs', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    directive @t(a: Int) on FIELD
  `;

  const subgraph2 = gql`
    directive @t on FIELD
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_ARGUMENT_PRESENCE,
    'Argument "@t(a:)" will not be added to "@t" in the supergraph as it does not appear in all subgraphs: '
    + 'it is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".'
  );
})

test('hints on field argument not being in all subgraphs', () => {
  const subgraph1 = gql`
    type Query {
      f(a: Int): Int @shareable
    }
  `;

  const subgraph2 = gql`
    type Query {
      f: Int @shareable
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_ARGUMENT_PRESENCE,
    'Argument "Query.f(a:)" will not be added to "Query.f" in the supergraph as it does not appear in all subgraphs: '
    + 'it is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".'
  );
})

test('hints on inconsistent description for schema definition', () => {
  const subgraph1 = gql`
    """
    Queries to the API
      - a: gives you a int
    """
    schema {
      query: Query
    }

    type Query {
      a: Int
    }
  `;

  const subgraph2 = gql`
    """
    Entry point for the API
    """
    schema {
      query: Query
    }

    type Query {
      b: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_DESCRIPTION,
    'The schema definition has inconsistent descriptions across subgraphs. The supergraph will use description (from subgraph "Subgraph1"):\n'
    + '  """\n'
    + '  Queries to the API\n'
    + '    - a: gives you a int\n'
    + '  """\n'
    + 'In subgraph "Subgraph2", the description is:\n'
    + '  """\n'
    + '  Entry point for the API\n'
    + '  """'
  );
})

test('hints on inconsistent description for field', () => {
  // We make sure the 2nd and 3rd subgraphs have the same description to
  // ensure it's the one that gets picked.
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    type T @shareable {
      "I don't know what I'm doing"
      f: Int
    }
  `;

  const subgraph2 = gql`
    type T @shareable {
      "Return a super secret integer"
      f: Int
    }
  `;

  const subgraph3 = gql`
    type T @shareable {
      """
      Return a super secret integer
      """
      f: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2, subgraph3);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_DESCRIPTION,
    'Element "T.f" has inconsistent descriptions across subgraphs. The supergraph will use description (from subgraphs "Subgraph2" and "Subgraph3"):\n'
    + '  """\n'
    + '  Return a super secret integer\n'
    + '  """\n'
    + 'In subgraph "Subgraph1", the description is:\n'
    + '  """\n'
    + '  I don\'t know what I\'m doing\n'
    + '  """'
  );
});

describe('hint tests related to the @override directive', () => {
  it('hint when from subgraph does not exist', () => {
    const subgraph1 = gql`
      type Query {
        a: Int
      }

      type T @key(fields: "id"){
        id: Int
        f: Int @override(from: "Subgraph3")
      }
    `;

    const subgraph2 = gql`
    type T @key(fields: "id"){
      id: Int
    }
    `;
    const result = mergeDocuments(subgraph1, subgraph2);
    expect(result).toRaiseHint(
      HINTS.FROM_SUBGRAPH_DOES_NOT_EXIST,
      `Source subgraph "Subgraph3" for field "T.f" on subgraph "Subgraph1" does not exist. Did you mean "Subgraph1" or "Subgraph2"?`,
    );
  });

  it('hint when @override directive can be removed', () => {
    const subgraph1 = gql`
      type Query {
        a: Int
      }

      type T @key(fields: "id"){
        id: Int
        f: Int @override(from: "Subgraph2")
      }
    `;

    const subgraph2 = gql`
    type T @key(fields: "id"){
      id: Int
    }
    `;
    const result = mergeDocuments(subgraph1, subgraph2);
    expect(result).toRaiseHint(
      HINTS.OVERRIDE_DIRECTIVE_CAN_BE_REMOVED,
      `Field "T.f" on subgraph "Subgraph1" no longer exists in the from subgraph. The @override directive can be removed.`,
    );
  });

  it('hint overridden field can be removed', () => {
    const subgraph1 = gql`
      type Query {
        a: Int
      }

      type T @key(fields: "id"){
        id: Int
        f: Int @override(from: "Subgraph2")
      }
    `;

    const subgraph2 = gql`
    type T @key(fields: "id"){
      id: Int
      f: Int
    }
    `;
    const result = mergeDocuments(subgraph1, subgraph2);
    expect(result).toRaiseHint(
      HINTS.OVERRIDDEN_FIELD_CAN_BE_REMOVED,
      `Field "T.f" on subgraph "Subgraph2" is overridden. Consider removing it.`,
    );
  });

  it('hint overridden field can be made external', () => {
    const subgraph1 = gql`
      type Query {
        a: Int
      }

      type T @key(fields: "id"){
        id: Int @override(from: "Subgraph2")
      }
    `;

    const subgraph2 = gql`
      type T @key(fields: "id"){
        id: Int
      }
    `;
    const result = mergeDocuments(subgraph1, subgraph2);
    expect(result).toRaiseHint(
      HINTS.OVERRIDDEN_FIELD_CAN_BE_REMOVED,
      `Field "T.id" on subgraph "Subgraph2" is overridden. It is still used in some federation directive(s) (@key, @requires, and/or @provides) and/or to satisfy interface constraint(s), but consider marking it @external explicitly or removing it along with its references.`,
    );
  });

  it('hint when @override directive can be removed because overridden field has been marked external', () => {
    const subgraph1 = gql`
      type Query {
        a: Int
      }

      type T @key(fields: "id"){
        id: Int @override(from: "Subgraph2")
        f: Int
      }
    `;

    const subgraph2 = gql`
    type T @key(fields: "id"){
      id: Int @external
    }
    `;
    const result = mergeDocuments(subgraph1, subgraph2);
    expect(result).toRaiseHint(
      HINTS.OVERRIDE_DIRECTIVE_CAN_BE_REMOVED,
      `Field "T.id" on subgraph "Subgraph1" is not resolved anymore by the from subgraph (it is marked "@external" in "Subgraph2"). The @override directive can be removed.`,
    );
  });
});
