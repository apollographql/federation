import { asFed2SubgraphDocument, buildSubgraph, Subgraphs } from '@apollo/federation-internals';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import {
  HintCodeDefinition,
  HINTS,
} from '../hints';
import { MergeResult, mergeSubgraphs } from '../merging';
import { assertCompositionSuccess, composeAsFed2Subgraphs } from './testHelper';
import { formatExpectedToMatchReceived } from 'apollo-federation-integration-testsuite/src/matchers/toMatchString';
import { composeServices } from '../compose';

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
      toRaiseHint(id: HintCodeDefinition, message: string, coordinate: string | undefined): R;
      toNotRaiseHints(): R;
    }
  }
}

expect.extend({
  toRaiseHint(mergeResult: MergeResult, expectedDefinition: HintCodeDefinition, expectedMessage: string, expectedCoordinate: string | undefined) {
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
      const received = hint.message;
      const receivedCoordinate = hint.coordinate
      const expected = formatExpectedToMatchReceived(expectedMessage, received);
      if (this.equals(expected, received) && this.equals(expectedCoordinate, receivedCoordinate)) {
        return {
          message: () => `Expected subgraphs merging to not raise hint ${expectedCode} with message '${expected}', but it did`,
          pass: true,
        }
      }
    }

    if (matchingHints.length === 1) {
      const receivedMessage = matchingHints[0].message;
      const receivedCoordinate = matchingHints[0].coordinate;
      const message = formatExpectedToMatchReceived(expectedMessage, receivedMessage);
      const coordinate = formatExpectedToMatchReceived(expectedCoordinate || '', receivedCoordinate || '');
      return {
        message: () => (
          this.utils.matcherHint('toRaiseHint', undefined, undefined,)
          + '\n\n'
          + `Found hint matching code ${expectedCode}, but messages or coordinates don't match:\n`
          + this.utils.printDiffOrStringify(message, receivedMessage, 'Expected', 'Received', true)
          + "\n\n"
          + this.utils.printDiffOrStringify(coordinate, receivedCoordinate, 'Expected', 'Received', true)
        ),
        pass: false,
      };
    }

    return {
      message: () => (
        this.utils.matcherHint('toRaiseHint', undefined, undefined,)
        + '\n\n'
        + `Found ${matchingHints.length} hint(s) matching code ${expectedCode}, but none had the expected message or coordinate:\n`
        + matchingHints.map((h, i) => {
          const received = h.message;
          const expected = formatExpectedToMatchReceived(expectedMessage, received);
          return `Hint ${i}:\n`
            + this.utils.printDiffOrStringify(expected, received, 'Expected', 'Received', true)
        }).join('\n\n')
        + matchingHints.map((h, i) => {
          const received = h.coordinate;
          const expected = formatExpectedToMatchReceived(expectedMessage, received || '');
          return `Hint ${i}:\n`
            + this.utils.printDiffOrStringify(expected, received, 'Expected', 'Received', true)
        }).join('\n\n')
      ),
      pass: false,
    }
  },

  toNotRaiseHints(mergeResult: MergeResult) {
    if (mergeResult.errors) {
      return {
        message: () => `Expected subgraphs to merge but got errors: [${mergeResult.errors.map(e => e.message).join(', ')}]`,
        pass: false
      };
    }

    const hints = mergeResult.hints;
    if (hints.length > 0) {
      return {
        message: () => `Expected subgraphs merging to NOT raise any hints, but got:\n - ${hints.map((h) => h.toString()).join('\n - ')}`,
        pass: false
      };
    }

    return {
      message: () => "You're negating a negative method? Instead of using `toRaiseHint`? Do you want to talk about it?",
      pass: true
    };
  }
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
    HINTS.INCONSISTENT_BUT_COMPATIBLE_FIELD_TYPE,
    'Type of field "T.f" is inconsistent but compatible across subgraphs: '
    + 'will use type "String" (from subgraph "Subgraph1") in supergraph but "T.f" has subtype "String!" in subgraph "Subgraph2".',
    'T.f'
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

    type Impl implements I @shareable {
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

    type Impl implements I @shareable {
      v: Int
    }

    type T @shareable {
      f: Impl
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    HINTS.INCONSISTENT_BUT_COMPATIBLE_FIELD_TYPE,
    'Type of field "T.f" is inconsistent but compatible across subgraphs: '
    + 'will use type "I" (from subgraph "Subgraph1") in supergraph but "T.f" has subtype "Impl" in subgraph "Subgraph2".',
    'T.f'
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
    HINTS.INCONSISTENT_BUT_COMPATIBLE_ARGUMENT_TYPE,
    'Type of argument "T.f(a:)" is inconsistent but compatible across subgraphs: '
    + 'will use type "String!" (from subgraph "Subgraph1") in supergraph but "T.f(a:)" has supertype "String" in subgraph "Subgraph2".',
    'T.f(a:)'
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
    HINTS.INCONSISTENT_DEFAULT_VALUE_PRESENCE,
    'Argument "T.f(a:)" has a default value in only some subgraphs: '
    + 'will not use a default in the supergraph (there is no default in subgraph "Subgraph2") but "T.f(a:)" has default value "foo" in subgraph "Subgraph1".',
    'T.f(a:)'
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
    'Type "T" is declared as an entity (has a @key applied) in some but not all defining subgraphs: '
    + 'it has no @key in subgraph "Subgraph2" but has some @key in subgraph "Subgraph1".',
    'T'
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
    'Field "T.b" of non-entity object type "T" is defined in some but not all subgraphs that define "T": '
    + '"T.b" is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".',
    'T'
  );
});

test('use of federation__key does not raise hint', () => {
  const subgraph1 = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.7")

    type Query {
      a: Int
    }

    union U = T
    
    type T @federation__key(fields:"id") {
      id: ID!
      b: Int
    }
  `;
  
  const subgraph2 = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.7")

    type Query {
      b: Int
    }
    
    type T @federation__key(fields:"id") {
      id: ID!
      c: Int
    }
  `;
  const result = composeServices([
      {
        name: 'subgraph1',
        typeDefs: subgraph1,
      },
      {
        name: 'subgraph2',
        typeDefs: subgraph2,
      },
    ]);
  assertCompositionSuccess(result);
  expect(result).toNotRaiseHints();
});

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
    'Field "T.b" of interface type "T" is defined in some but not all subgraphs that define "T": '
    + '"T.b" is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".',
    'T'
  );
})

test('*No* hint on field of interface _with @key_ not being in all subgraphs', () => {
  const subgraph1 = gql`
    type Query {
      a: Int
    }

    interface T @key(fields: "id") {
      id: ID!
      a: Int
      b: Int
    }
  `;

  const subgraph2 = gql`
    type T @interfaceObject @key(fields: "id") {
      id: ID!
      a: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toNotRaiseHints();
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
    'Input object field "b" will not be added to "T" in the supergraph as it does not appear in all subgraphs: it is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".',
    'T.b'
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
    'Union type "T" includes member type "B" in some but not all defining subgraphs: '
    + '"B" is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".',
    'T'
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
    'Enum type "T" is defined but unused. It will be included in the supergraph with all the values appearing in any subgraph ("as if" it was only used as an output type).',
    'T'
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
    + '"V2" is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".',
    'T.V2'
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
    + '"V2" is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".',
    'T.V2'
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
    + 'it is repeatable in subgraph "Subgraph1" but not in subgraph "Subgraph2".',
    '@tag'
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
    + 'location "FIELD_DEFINITION" in subgraph "Subgraph1" and location "INTERFACE" in subgraph "Subgraph2".',
    '@tag'
  );
})

test('hints on executable directives not being in all subgraphs', () => {
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
    HINTS.INCONSISTENT_EXECUTABLE_DIRECTIVE_PRESENCE,
    'Executable directive "@t" will not be part of the supergraph as it does not appear in all subgraphs: '
    + 'it is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".',
    '@t'
  );
})

test('hints on executable directives having no locations intersection', () => {
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
    HINTS.NO_EXECUTABLE_DIRECTIVE_LOCATIONS_INTERSECTION,
    'Executable directive "@t" has no location that is common to all subgraphs: '
    + 'it will not appear in the supergraph as there no intersection between location "QUERY" in subgraph "Subgraph1" and location "FIELD" in subgraph "Subgraph2".',
    '@t'
  );
})

test('hints on executable directives having inconsistent repeatable', () => {
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
    HINTS.INCONSISTENT_EXECUTABLE_DIRECTIVE_REPEATABLE,
    'Executable directive "@t" will not be marked repeatable in the supergraph as it is inconsistently marked repeatable in subgraphs: '
    + 'it is not repeatable in subgraph "Subgraph2" but is repeatable in subgraph "Subgraph1".',
    '@t'
  );
})

test('hints on executable directives having inconsistent locations', () => {
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
    HINTS.INCONSISTENT_EXECUTABLE_DIRECTIVE_LOCATIONS,
    'Executable directive "@t" has inconsistent locations across subgraphs '
    + 'and will use location "FIELD" (intersection of all subgraphs) in the supergraph, but has: '
    + 'location "FIELD" in subgraph "Subgraph2" and locations "FIELD, QUERY" in subgraph "Subgraph1".',
    '@t'
  );
})

test('hints on executable directives argument not being in all subgraphs', () => {
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
    'Optional argument "@t(a:)" will not be included in the supergraph as it does not appear in all subgraphs: '
    + 'it is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".',
    '@t(a:)'
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
    'Optional argument "Query.f(a:)" will not be included in the supergraph as it does not appear in all subgraphs: '
    + 'it is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2".',
    'Query.f(a:)'
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
    + '  """',
    undefined
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
    + '  """',
    'T.f'
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
      'T.f'
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
      'T.f'
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
      'T.f'
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
      'T.id'
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
      'T.id'
    );
  });

  it('hint when progressive @override migration is in progress', () => {
    const subgraph1 = gql`
      type Query {
        a: Int
      }

      type T @key(fields: "id"){
        id: Int
        f: Int @override(from: "Subgraph2", label: "percent(1)")
      }
    `;

    const subgraph2 = gql`
    type T @key(fields: "id"){
      id: Int
      f: Int
    }
    `;
    const result = mergeDocuments(subgraph1, subgraph2);

    // We don't want to see the related hint for non-progressive overrides that
    // suggest removing the original field.
    expect(result.hints).toHaveLength(1);
    expect(result).toRaiseHint(
      HINTS.OVERRIDE_MIGRATION_IN_PROGRESS,
      `Field "T.f" is currently being migrated with progressive @override. Once the migration is complete, remove the field from subgraph "Subgraph2".`,
      'T.f',
    );
  });

  it('hint when progressive @override migration is in progress (for a referenced field)', () => {
    const subgraph1 = gql`
      type Query {
        a: Int
      }

      type T @key(fields: "id"){
        id: Int @override(from: "Subgraph2", label: "percent(1)")
      }
    `;

    const subgraph2 = gql`
      type T @key(fields: "id"){
        id: Int
      }
    `;
    const result = mergeDocuments(subgraph1, subgraph2);

    // We don't want to see the related hint for non-progressive overrides that
    // suggest removing the original field.
    expect(result.hints).toHaveLength(1);
    expect(result).toRaiseHint(
      HINTS.OVERRIDE_MIGRATION_IN_PROGRESS,
      `Field "T.id" on subgraph "Subgraph2" is currently being migrated via progressive @override. It is still used in some federation directive(s) (@key, @requires, and/or @provides) and/or to satisfy interface constraint(s). Once the migration is complete, consider marking it @external explicitly or removing it along with its references.`,
      'T.id'
    );
  });
});

describe('on non-repeatable directives used with incompatible arguments', () => {
  it('does _not_ warn when subgraphs have the same arguments', () => {
    const subgraph1 = gql`
      type Query {
        a: String @shareable @deprecated(reason: "because")
      }
    `;

    const subgraph2 = gql`
      type Query {
        a: String @shareable @deprecated(reason: "because")
      }
    `;

    const result = mergeDocuments(subgraph1, subgraph2);
    expect(result).toNotRaiseHints();
  });

  it('does _not_ warn when subgraphs all use the same arguments defaults', () => {
    const subgraph1 = gql`
      type Query {
        a: String @shareable @deprecated
      }
    `;

    const subgraph2 = gql`
      type Query {
        a: String @shareable @deprecated
      }
    `;

    const result = mergeDocuments(subgraph1, subgraph2);
    expect(result).toNotRaiseHints();
  });

  it('does _not_ warn if a subgraph uses the argument default and othe pass an argument, but it is the default', () => {
    const subgraph1 = gql`
      type Query {
        a: String @shareable @deprecated(reason: "No longer supported")
      }
    `;

    const subgraph2 = gql`
      type Query {
        a: String @shareable @deprecated
      }
    `;

    const result = mergeDocuments(subgraph1, subgraph2);
    expect(result).toNotRaiseHints();
  });

  it('warns if a subgraph use a default argument but the other use the (different) default ', () => {
    const subgraph1 = gql`
      type Query {
        a: String @shareable @deprecated(reason: "bad")
      }
    `;

    const subgraph2 = gql`
      type Query {
        a: String @shareable @deprecated
      }
    `;

    const result = mergeDocuments(subgraph1, subgraph2);
    expect(result).toRaiseHint(
      HINTS.INCONSISTENT_NON_REPEATABLE_DIRECTIVE_ARGUMENTS,
      'Non-repeatable directive @deprecated is applied to "Query.a" in multiple subgraphs but with incompatible arguments. '
      + 'The supergraph will use arguments {reason: "bad"} (from subgraph "Subgraph1"), but found no arguments in subgraph "Subgraph2".',
      'Query.a'
    );
  });

  it('warns if subgraphs use a different argument', () => {
    // Note: using @specifiedBy for variety and to illustrate that nothing we test here is specific to @deprecated.
    const subgraph1 = gql`
      type Query {
        f: Foo
      }

      scalar Foo @specifiedBy(url: "http://FooSpec.com")
    `;

    const subgraph2 = gql`
      scalar Foo @specifiedBy(url: "http://BarSpec.com")
    `;

    const result = mergeDocuments(subgraph1, subgraph2);
    expect(result).toRaiseHint(
      HINTS.INCONSISTENT_NON_REPEATABLE_DIRECTIVE_ARGUMENTS,
      'Non-repeatable directive @specifiedBy is applied to "Foo" in multiple subgraphs but with incompatible arguments. '
      + 'The supergraph will use arguments {url: "http://FooSpec.com"} (from subgraph "Subgraph1"), but found arguments {url: "http://BarSpec.com"} in subgraph "Subgraph2".',
      'Foo'
    );
  });

  it('warns when subgraphs use a different arguments but pick the "most popular" option', () => {
    // Note: using @specifiedBy for variety and to illustrate that nothing we test here is specific to @deprecated.
    const subgraph1 = gql`
      type Query {
        a: String @shareable @deprecated(reason: "because")
      }
    `;

    const subgraph2 = gql`
      type Query {
        a: String @shareable @deprecated(reason: "Replaced by field 'b'")
      }
    `;

    const subgraph3 = gql`
      type Query {
        a: String @shareable @deprecated
      }
    `;

    const subgraph4 = gql`
      type Query {
        a: String @shareable @deprecated(reason: "Replaced by field 'b'")
      }
    `;

    const result = mergeDocuments(subgraph1, subgraph2, subgraph3, subgraph4);
    expect(result).toRaiseHint(
      HINTS.INCONSISTENT_NON_REPEATABLE_DIRECTIVE_ARGUMENTS,
      'Non-repeatable directive @deprecated is applied to "Query.a" in multiple subgraphs but with incompatible arguments. '
      + 'The supergraph will use arguments {reason: "Replaced by field \'b\'"} (from subgraphs "Subgraph2" and "Subgraph4"), '
      + 'but found arguments {reason: "because"} in subgraph "Subgraph1" and no arguments in subgraph "Subgraph3".',
      'Query.a'
    );
  });
});

describe('when shared field has intersecting but non equal runtime types in different subgraphs', () => {
  it('hints for interfaces', () => {
    const subgraphA = {
      name: 'A',
      typeDefs: gql`
        type Query {
          a: A @shareable
        }

        interface A {
          x: Int
        }

        type I1 implements A {
          x: Int
          i1: Int
        }

        type I2 implements A @shareable {
          x: Int
          i1: Int
        }
      `
    };

    const subgraphB = {
      name: 'B',
      typeDefs: gql`
        type Query {
          a: A @shareable
        }

        interface A {
          x: Int
        }

        type I2 implements A @shareable {
          x: Int
          i2: Int
        }

        type I3 implements A @shareable {
          x: Int
          i3: Int
        }
      `
    };

    // Note that hints in this case are generate by the post-merge validation, so we need to full-compose, not just merge.
    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    expect(result.errors).toBeUndefined();
    expect(result).toRaiseHint(
      HINTS.INCONSISTENT_RUNTIME_TYPES_FOR_SHAREABLE_RETURN,
      `
      For the following supergraph API query:
      {
        a {
          ...
        }
      }
      Shared field "Query.a" return type "A" has different sets of possible runtime types across subgraphs.
      Since a shared field must be resolved the same way in all subgraphs, make sure that subgraphs "A" and "B" only resolve "Query.a" to objects of type "I2". In particular:
       - subgraph "A" should never resolve "Query.a" to an object of type "I1";
       - subgraph "B" should never resolve "Query.a" to an object of type "I3".
      Otherwise the @shareable contract will be broken.
      `,
      'Query.a'
    );
  });

  it('hints for unions', () => {
    const subgraphA = {
      name: 'A',
      typeDefs: gql`
        type Query {
          e: E! @shareable
        }

        type E @key(fields: "id") {
          id: ID!
          s: U! @shareable
        }

        union U = A | B

        type A @shareable {
          a: Int
        }

        type B @shareable {
          b: Int
        }
      `
    };

    const subgraphB = {
      name: 'B',
      typeDefs: gql`
        type E @key(fields: "id") {
          id: ID!
          s: U! @shareable
        }

        union U = A | B | C

        type A @shareable {
          a: Int
        }

        type B @shareable {
          b: Int
        }

        type C {
          c: Int
        }
      `
    };

    // Note that hints in this case are generate by the post-merge validation, so we need to full-compose, not just merge.
    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    expect(result.errors).toBeUndefined();
    expect(result).toRaiseHint(
      HINTS.INCONSISTENT_RUNTIME_TYPES_FOR_SHAREABLE_RETURN,
      `
      For the following supergraph API query:
      {
        e {
          s {
            ...
          }
        }
      }
      Shared field "E.s" return type "U!" has different sets of possible runtime types across subgraphs.
      Since a shared field must be resolved the same way in all subgraphs, make sure that subgraphs "A" and "B" only resolve "E.s" to objects of types "A" and "B". In particular:
       - subgraph "B" should never resolve "E.s" to an object of type "C".
      Otherwise the @shareable contract will be broken.
      `,
      'E.s',
    );
  });
});

describe('when a directive causes an implicit federation version upgrade', () => {
  const olderFederationSchema = gql`
    extend schema
      @link(url: "https://specs.apollo.dev/federation/v2.5", import: ["@key"])

    type Query {
      a: String!
    }
  `;

  const newerFederationSchema = gql`
    extend schema
      @link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key"])

    type Query {
      b: String!
    }
  `;

  const autoUpgradedSchema = gql`
    extend schema
      @link(url: "https://specs.apollo.dev/federation/v2.5", import: ["@key", "@shareable"])
      @link(url: "https://specs.apollo.dev/source/v0.1", import: [
        "@sourceAPI"
        "@sourceType"
        "@sourceField"
      ])
      @sourceAPI(
        name: "A"
        http: { baseURL: "https://api.a.com/v1" }
      )
      {
        query: Query
      }

    type Query @shareable {
      resources: [Resource!]! @sourceField(
        api: "A"
        http: { GET: "/resources" }
      )
    }

    type Resource @shareable @key(fields: "id") @sourceType(
      api: "A"
      http: { GET: "/resources/{id}" }
      selection: "id description"
    ) {
      id: ID!
      description: String!
    }
  `;

  it('should hint that the version was upgraded to satisfy directive requirements', () => {
    const result = composeServices([
      {
        name: 'already-newest',
        typeDefs: newerFederationSchema,
      },
      {
        name: 'old-but-not-upgraded',
        typeDefs: olderFederationSchema,
      },
      {
        name: 'upgraded',
        typeDefs: autoUpgradedSchema,
      }
    ]);

    assertCompositionSuccess(result);
    expect(result).toRaiseHint(
      HINTS.IMPLICITLY_UPGRADED_FEDERATION_VERSION,
      'Subgraph upgraded has been implicitly upgraded from federation v2.5 to v2.7',
      '@link'
    );
  });

  it('should show separate hints for each upgraded subgraph', () => {
    const result = composeServices([
      {
        name: 'upgraded-1',
        typeDefs: autoUpgradedSchema,
      },
      {
        name: 'upgraded-2',
        typeDefs: autoUpgradedSchema
      },
    ]);

    assertCompositionSuccess(result);
    expect(result).toRaiseHint(
      HINTS.IMPLICITLY_UPGRADED_FEDERATION_VERSION,
      'Subgraph upgraded-1 has been implicitly upgraded from federation v2.5 to v2.7',
      '@link'
    );
    expect(result).toRaiseHint(
      HINTS.IMPLICITLY_UPGRADED_FEDERATION_VERSION,
      'Subgraph upgraded-2 has been implicitly upgraded from federation v2.5 to v2.7',
      '@link'
    );
  });

  it('should not raise hints if the only upgrade is caused by a link directly to the federation spec', () => {
    const result = composeServices([
      {
        name: 'already-newest',
        typeDefs: newerFederationSchema,
      },
      {
        name: 'old-but-not-upgraded',
        typeDefs: olderFederationSchema,
      },
    ]);

    assertCompositionSuccess(result);
    expect(result).toNotRaiseHints();
  });
});

describe('when a partially-defined type is marked @external or all fields are marked @external', () => {
  describe('value types', () => {
    it('with type marked @external', () => {
      const meSubgraph = gql`
        type Query {
          me: Account
        }

        type Account @key(fields: "id") {
          id: ID!
          name: String
          permissions: Permissions
        }

        type Permissions {
          canView: Boolean
          canEdit: Boolean
        }
      `;

      const accountSubgraph = gql`
        type Query {
          account: Account
        }

        type Account @key(fields: "id") {
          id: ID!
          permissions: Permissions @external
          isViewer: Boolean @requires(fields: "permissions { canView }")
        }

        type Permissions @external {
          canView: Boolean
        }
      `;

      const result = mergeDocuments(meSubgraph, accountSubgraph);
      expect(result).toNotRaiseHints();
    });
  
    it('with all fields marked @external', () => {
      const meSubgraph = gql`
        type Query {
          me: Account
        }

        type Account @key(fields: "id") {
          id: ID!
          name: String
          permissions: Permissions
        }

        type Permissions {
          canView: Boolean
          canEdit: Boolean
          canDelete: Boolean
        }
      `;

      const accountSubgraph = gql`
        type Query {
          account: Account
        }

        type Account @key(fields: "id") {
          id: ID!
          permissions: Permissions @external
          isViewer: Boolean @requires(fields: "permissions { canView canEdit }")
        }

        type Permissions {
          canView: Boolean @external
          canEdit: Boolean @external
        }
      `;

      const result = mergeDocuments(meSubgraph, accountSubgraph);
      expect(result).toNotRaiseHints();
    });
  });
});
