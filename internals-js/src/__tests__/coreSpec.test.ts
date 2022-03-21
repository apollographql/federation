import { DocumentNode, GraphQLError } from "graphql";
import gql from "graphql-tag";
import { buildSubgraph } from "../federation";
import { errorCauses } from "../definitions";
import { assert } from "../utils";

function expectErrors(
  subgraphDefs: DocumentNode,
  expectedErrorMessages: string[],
) {
  let thrownError: Error | undefined = undefined;
  expect(() => {
    try {
      // Note: we use buildSubgraph because currently it's the only one that does auto-magic import of
      // directive definition, and we don't want to bother with adding the @link definition to every
      // example.
      buildSubgraph('S', '', subgraphDefs)
    } catch (e) {
      // Kind-of ugly, but if Jest has a better option, I haven't found it.
      thrownError = e;
      throw e;
    }
  }).toThrow(GraphQLError);

  assert(thrownError, 'Should have thrown');
  const causes = errorCauses(thrownError);
  assert(causes, 'Should have some causes');
  // Note: all the received message with start with "[S] <rest of message>", so the `slice` below
  // strips the extra prefix. This avoid leaking the subgraph name to leak to the tests themselves.
  expect(causes.map((e) => e.message.slice(4))).toStrictEqual(expectedErrorMessages);
}

describe('@link(import:) argument', () => {
  test('errors on misformed values', () => {
    const schema = gql`
      extend schema @link(
        url: "https://specs.apollo.dev/federation/v2.0",
        import: [
          2,
          { foo: "bar" },
          { name: "@key", badName: "foo"},
          { name: 42 },
          { as: "bar" },
         ]
      )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Invalid sub-value 2 for @link(import:) argument: values should be either strings or input object values of the form { name: "<importedElement>", as: "<alias>" }.',
      'Unknown field "foo" for sub-value {foo: "bar"} of @link(import:) argument.',
      'Unknown field "badName" for sub-value {name: "@key", badName: "foo"} of @link(import:) argument.',
      'Invalid value for the "name" field for sub-value {name: 42} of @link(import:) argument: must be a string.',
      'Invalid sub-value {as: "bar"} for @link(import:) argument: missing mandatory "name" field.',
    ]);
  });

  test('errors on mismatch between name and alias', () => {
    const schema = gql`
      extend schema @link(
        url: "https://specs.apollo.dev/federation/v2.0",
        import: [
          { name: "@key", as: "myKey" },
          { name: "FieldSet", as: "@fieldSet" },
        ]
      )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Invalid @link import renaming: directive "@key" imported name should start with a \'@\' character, but got "myKey".',
      'Invalid @link import renaming: type "FieldSet" imported name should not start with a \'@\' character, but got "@fieldSet" (or, if @FieldSet is a directive, then it should be referred to with a \'@\').',
    ]);
  });

  test('errors on importing unknown elements for known features', () => {
    const schema = gql`
      extend schema @link(
        url: "https://specs.apollo.dev/federation/v2.0",
        import: [ "@foo", "key", { name: "@sharable" } ]
      )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot import unknown element "@foo".',
      'Cannot import unknown element "key". Did you mean directive "@key"?',
      'Cannot import unknown element "@sharable\". Did you mean "@shareable"?',
    ]);
  });
});
