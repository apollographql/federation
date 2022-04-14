import { DocumentNode, GraphQLError } from "graphql";
import gql from "graphql-tag";
import { buildSubgraph } from "../federation";
import { errorCauses } from "../definitions";
import { assert } from "../utils";
import { buildSchemaFromAST } from "../buildSchema";
import { removeAllCoreFeatures } from "../coreSpec";
import { printSubgraphSchema } from "@apollo/subgraph";

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

describe('removeAllCoreFeatures', () => {
  it('removes core (and only core) feature definitions, accounting for aliasing', () => {
    const schema = buildSchemaFromAST(gql`
      directive @lonk(url: String, as: String, for: Porpoise, import: [lonk__Import]) repeatable on SCHEMA

      scalar lonk__Import

      enum Porpoise {
        """
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        """
        SECURITY

        """
        \`EXECUTION\` features provide metadata necessary for operation execution.
        """
        EXECUTION
      }

      extend schema
        @lonk(
          url: "https://specs.apollo.dev/link/v1.0",
          as: "lonk",
          import: [
            { name: "Purpose", as: "Porpoise" }
          ]
        )
        @lonk(
          url: "https://localhost/foobar/v1.0",
          as: "foo"
          import: [
            "bar",
            "@baz",
            { name: "qux", as: "qax" },
            { name: "@quz", as: "@qaz" },
          ]
        )

      type Query {
        q: Int
      }

      # Shouldn't remove original spec name
      scalar foobar
      scalar foobar__Scalar
      directive @foobar on FIELD
      directive @foobar__directive on FIELD

      # Should remove aliased spec name (other than type "foo")
      scalar foo
      scalar foo__Scalar
      directive @foo on FIELD
      directive @foo__directive on FIELD

      # Should remove imports (prefixed or not)
      type bar implements foo__bar {
        someField: foo!
      }
      interface foo__bar {
        someField: foo!
      }
      directive @baz on FIELD
      directive @foo__baz on FIELD

      # Shouldn't remove original import names
      input qux {
        someField: ID!
      }
      directive @quz on FIELD

      # Should remove aliased import names (and prefixed original)
      union qax = bar
      enum foo__qax {
        SOME_VALUE
      }
      scalar foo__qux
      directive @qaz on FIELD
      directive @foo__qaz on FIELD
      directive @foo__quz on FIELD
    `);

    removeAllCoreFeatures(schema,);
    schema.validate();

    expect(schema.elementByCoordinate("@lonk")).toBeUndefined();
    expect(schema.elementByCoordinate("lonk__Import")).toBeUndefined();
    expect(schema.elementByCoordinate("Porpoise")).toBeUndefined();
    expect(schema.elementByCoordinate("foobar")).toBeDefined();
    expect(schema.elementByCoordinate("foobar__Scalar")).toBeDefined();
    expect(schema.elementByCoordinate("@foobar")).toBeDefined();
    expect(schema.elementByCoordinate("@foobar__directive")).toBeDefined();
    expect(schema.elementByCoordinate("foo")).toBeDefined();
    expect(schema.elementByCoordinate("foo__Scalar")).toBeUndefined();
    expect(schema.elementByCoordinate("@foo")).toBeUndefined();
    expect(schema.elementByCoordinate("@foo__directive")).toBeUndefined();
    expect(schema.elementByCoordinate("bar")).toBeUndefined();
    expect(schema.elementByCoordinate("foo__bar")).toBeUndefined();
    expect(schema.elementByCoordinate("@baz")).toBeUndefined();
    expect(schema.elementByCoordinate("@foo__baz")).toBeUndefined();
    expect(schema.elementByCoordinate("qux")).toBeDefined();
    expect(schema.elementByCoordinate("@quz")).toBeDefined();
    expect(schema.elementByCoordinate("qax")).toBeUndefined();
    expect(schema.elementByCoordinate("foo__qax")).toBeUndefined();
    expect(schema.elementByCoordinate("foo__qux")).toBeUndefined();
    expect(schema.elementByCoordinate("@qaz")).toBeUndefined();
    expect(schema.elementByCoordinate("@foo__qaz")).toBeUndefined();
    expect(schema.elementByCoordinate("@foo__quz")).toBeUndefined();
  });

  it('does not remove tags', () => {
    const subgraph = buildSubgraph('S', '', gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@tag"])
        @link(url: "https://specs.apollo.dev/tag/v1.0", as: "cooltag")
        @link(url: "https://specs.apollo.dev/cool/v1.0", import: [{name: "@tag", as: "@cooltag"}])

      type Query {
        q: Int
      }

      type User {
        k: ID
        a: Int @tag(name: "foo")
        b: Int @cool__cooltag(name: "bar")
      }
    `);
    const { schema } = subgraph;
    console.log(printSubgraphSchema(schema.toGraphQLJSSchema()));
    removeAllCoreFeatures(schema, { promoteDirectives: ["cooltag"] });
    schema.validate();

    expect(schema.elementByCoordinate("@cooltag")).toBeDefined();
  });
});
