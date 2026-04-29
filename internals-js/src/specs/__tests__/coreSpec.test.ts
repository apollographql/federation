import { DocumentNode, GraphQLError } from 'graphql';
import gql from 'graphql-tag';
import { buildSubgraph } from '../../federation';
import { assert } from '../../utils';
import { buildSchemaFromAST } from '../../buildSchema';
import {
  removeAllCoreFeatures,
  FeatureDefinitions,
  FeatureVersion,
  FeatureDefinition,
  FeatureUrl,
} from '../coreSpec';
import { errorCauses } from '../../error';

function expectErrors(
  subgraphDefs: DocumentNode,
  expectedErrorMessages: string[],
) {
  if (expectedErrorMessages.length === 0) {
    // Note: we use buildSubgraph because currently it's the only one that does
    // auto-magic import of directive definition, and we don't want to bother
    // with adding the @link definition to every example.
    buildSubgraph('S', '', subgraphDefs);
    return;
  }
  let thrownError: Error | undefined = undefined;
  expect(() => {
    try {
      // As noted above, we use buildSubgraph for automatic imports.
      buildSubgraph('S', '', subgraphDefs);
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
  expect(causes.map((e) => e.message.slice(4))).toStrictEqual(
    expectedErrorMessages,
  );
}

describe('@link(import:) argument', () => {
  test('errors on misformed values', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: [
            2
            { foo: "bar" }
            { name: "@key", badName: "foo" }
            { name: 42 }
            { name: "42" }
            { name: "" }
            { name: "@bar", as: "@" }
            { as: "bar" }
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
      'Invalid value for the "name" field for sub-value {name: "42"} of @link(import:) argument: must use a GraphQL name.',
      'Invalid value for the "name" field for sub-value {name: ""} of @link(import:) argument: must use a GraphQL name.',
      'Invalid value for the "as" field for sub-value {name: "@bar", as: "@"} of @link(import:) argument: must use a GraphQL name.',
      'Invalid sub-value {as: "bar"} for @link(import:) argument: missing mandatory "name" field.',
    ]);
  });

  test('errors on mismatch between name and alias', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: [
            { name: "@key", as: "myKey" }
            { name: "FieldSet", as: "@fieldSet" }
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
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: ["@foo", "key", { name: "@sharable" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot import unknown element "@foo".',
      'Cannot import unknown element "key". Did you mean directive "@key"?',
      'Cannot import unknown element "@sharable". Did you mean "@shareable"?',
    ]);
  });
});

describe('@link alias and import conflicts', () => {
  it('errors for same identity imported twice', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(url: "https://specs.apollo.dev/federation/v2.0")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot link feature "https://specs.apollo.dev/federation" since it has already been linked in the schema.',
    ]);
  });

  it('errors for spec alias containing "__"', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(url: "https://custom.dev/f__oo/v1.0")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot link feature "https://custom.dev/f__oo" as "f__oo" since it contains "__". Please rename to a compliant name via "as".',
    ]);
  });

  it('succeeds renaming spec name containing "__"', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(url: "https://custom.dev/f__oo/v1.0", as: "foo")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  // See the relevant code in CoreFeatures.add() for why we have this exception.
  // That exception and this test may be removed in the future once we have
  // dropped support for the bugged compositions that necessitate the exception.
  it('allows exception in "__" validation for "federation__tag" and "federation__inaccessible"', () => {
    const supergraphSchema = gql`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
        @link(
          url: "https://specs.apollo.dev/inaccessible/v0.2"
          as: "federation__inaccessible"
          for: SECURITY
        )
        @link(url: "https://specs.apollo.dev/tag/v0.3", as: "federation__tag") {
        query: Query
      }

      directive @federation__tag(
        name: String!
      ) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION | SCHEMA

      directive @federation__inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__field(
        graph: join__Graph
        requires: join__FieldSet
        provides: join__FieldSet
        type: String
        external: Boolean
        override: String
        usedOverridden: Boolean
      ) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(
        graph: join__Graph!
        interface: String!
      ) repeatable on OBJECT | INTERFACE

      directive @join__type(
        graph: join__Graph!
        key: join__FieldSet
        extension: Boolean! = false
        resolvable: Boolean! = true
        isInterfaceObject: Boolean! = false
      ) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @join__unionMember(
        graph: join__Graph!
        member: String!
      ) repeatable on UNION

      directive @link(
        url: String
        as: String
        for: link__Purpose
        import: [link__Import]
      ) repeatable on SCHEMA

      scalar join__FieldSet

      enum join__Graph {
        S @join__graph(name: "s", url: "")
      }

      scalar link__Import

      enum link__Purpose {
        SECURITY
        EXECUTION
      }

      type Query @join__type(graph: S) {
        q: Int
      }
    `;

    buildSchemaFromAST(supergraphSchema);
  });

  it('errors for spec alias ending in "_"', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(url: "https://custom.dev/foo_/v1.0")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot link feature "https://custom.dev/foo_" as "foo_" since it ends in "_". Please rename to a compliant name via "as".',
    ]);
  });

  it('succeeds renaming spec name ending in "_"', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(url: "https://custom.dev/foo_/v1.0", as: "foo")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for spec alias that is not a valid GraphQL name', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(url: "https://custom.dev/0foo/v1.0")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot link feature "https://custom.dev/0foo" as "0foo" since it is not a valid GraphQL name. Please rename to a compliant name via "as".',
    ]);
  });

  it('succeeds renaming spec name that is not a valid GraphQL name', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(url: "https://custom.dev/0foo/v1.0", as: "foo")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for spec alias that conflicts with past namespaced directive', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: [{ name: "@key", as: "@foo__key" }]
        )
        @link(url: "https://custom.dev/foo/v1.0")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot import "@key" as "@foo__key" from feature "https://specs.apollo.dev/federation" since it can be confused with a namespaced name from another linked feature "https://custom.dev/foo". Please rename the import or feature to avoid conflicts via "as".',
    ]);
  });

  it('succeeds renaming spec name that conflicts with past namespaced directive', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: [{ name: "@key", as: "@foo__key" }]
        )
        @link(url: "https://custom.dev/foo/v1.0", as: "bar")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for spec alias that conflicts with future namespaced directive', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(
          url: "https://custom.dev/foo/v1.0"
          import: [{ name: "Foo", as: "federation__Foo" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot import "Foo" as "federation__Foo" from feature "https://custom.dev/foo" since it can be confused with a namespaced name from another linked feature "https://specs.apollo.dev/federation". Please rename the import or feature to avoid conflicts via "as".',
    ]);
  });

  it('succeeds renaming spec name that conflicts with future namespaced directive', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", as: "bar")
        @link(
          url: "https://custom.dev/foo/v1.0"
          import: [{ name: "Foo", as: "federation__Foo" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for spec alias that conflicts with past default directive', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])
        @link(url: "https://custom.dev/key/v1.0")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot import "@key" from feature "https://specs.apollo.dev/federation" since it can be confused with a namespaced name from another linked feature "https://custom.dev/key". Please rename the import or feature to avoid conflicts via "as".',
    ]);
  });

  it('succeeds renaming spec name that conflicts with past default directive', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])
        @link(url: "https://custom.dev/key/v1.0", as: "foo")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for spec alias that conflicts with future default directive', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(
          url: "https://custom.dev/foo/v1.0"
          import: [{ name: "@foo", as: "@federation" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot import "@foo" as "@federation" from feature "https://custom.dev/foo" since it can be confused with a namespaced name from another linked feature "https://specs.apollo.dev/federation". Please rename the import or feature to avoid conflicts via "as".',
    ]);
  });

  it('succeeds renaming spec name that conflicts with future namespaced directive', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", as: "bar")
        @link(
          url: "https://custom.dev/foo/v1.0"
          import: [{ name: "@foo", as: "@federation" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for spec alias that conflicts with another spec alias', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(url: "https://custom.dev/federation/v1.0")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot link feature https://custom.dev/federation as "federation" since another feature "https://specs.apollo.dev/federation" already uses that alias. Please rename the feature to avoid conflicts via "as".',
    ]);
  });

  it('succeeds renaming spec name that conflicts with another spec alias', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(url: "https://custom.dev/federation/v1.0", as: "foo")

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for namespaced import that is not a no-op import', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: [{ name: "@key", as: "@federation__requires" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot import "@key" as "@federation__requires" from feature "https://specs.apollo.dev/federation" since it can be confused with the namespaced name for "@requires". Please rename the import to avoid conflicts via "as".',
    ]);
  });

  it('succeeds for namespaced import that is a no-op import', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: [{ name: "@key", as: "@federation__key" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for default directive import that is not a no-op import', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(
          url: "https://custom.dev/foo/v1.0"
          as: "bar"
          import: [{ name: "@baz", as: "@bar" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot import "@baz" as "@bar" from feature "https://custom.dev/foo" since it can be confused with the namespaced name for "@foo". Please rename the import to avoid conflicts via "as".',
    ]);
  });

  it('succeeds for default directive import that is a no-op import', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0")
        @link(
          url: "https://custom.dev/foo/v1.0"
          as: "bar"
          import: [{ name: "@foo", as: "@bar" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for imports of one element to different names', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: ["@key", { name: "@key", as: "@foo" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot import "@key" as "@foo" from feature "https://specs.apollo.dev/federation" since it was previously imported as "@key". Please remove one of these imports.',
    ]);
  });

  it('succeeds for imports of one element to same name', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: [
            { name: "@key", as: "@foo" }
            "@requires"
            { name: "@key", as: "@foo" }
          ]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for import name that already exists in different spec', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])
        @link(
          url: "https://custom.dev/foo/v1.0"
          import: [{ name: "@foo", as: "@key" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot import "@foo" as "@key" from feature "https://custom.dev/foo" since it was previously imported from feature "https://specs.apollo.dev/federation". Please rename the import to avoid conflicts via "as".',
    ]);
  });

  it('succeeds renaming import name that already exists in different spec', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: [{ name: "@key", as: "@bar" }]
        )
        @link(
          url: "https://custom.dev/foo/v1.0"
          import: [{ name: "@foo", as: "@key" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for import name that already exists in same spec', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: ["@key", { name: "@requires", as: "@key" }]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, [
      'Cannot import "@requires" as "@key" from feature "https://specs.apollo.dev/federation" since it was previously imported for "@key". Please rename the import to avoid conflicts via "as".',
    ]);
  });

  it('succeeds renaming import name that already exists in same spec', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: [
            { name: "@key", as: "@requires" }
            { name: "@requires", as: "@key" }
          ]
        )

      type Query {
        q: Int
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for used shadowed directive import', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      directive @federation__key(
        fields: federation__FieldSet!
        resolvable: Boolean = true
      ) repeatable on OBJECT | INTERFACE

      scalar federation__FieldSet

      type Query {
        users: [User!]!
      }

      type User @federation__key(fields: "id") {
        id: ID!
        name: String!
      }
    `;

    expectErrors(schema, [
      'Cannot import "@key" from feature "https://specs.apollo.dev/federation" since there\'s a used definition for the namespaced name "@federation__key". Please switch usages of the namespaced name to the import name and remove the definition.',
    ]);
  });

  it('succeeds for unused shadowed directive import', () => {
    const schema = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      directive @federation__key(
        fields: federation__FieldSet!
        resolvable: Boolean = true
      ) repeatable on OBJECT | INTERFACE

      scalar federation__FieldSet

      type Query {
        users: [User!]!
      }

      type User @key(fields: "id") {
        id: ID!
        name: String!
      }
    `;

    expectErrors(schema, []);
  });

  it('errors for used shadowed type import', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: ["FieldSet"]
        )

      scalar federation__FieldSet

      type Query {
        users: [User!]!
      }

      type User {
        id: ID!
        fieldSet: federation__FieldSet!
      }
    `;

    expectErrors(schema, [
      'Cannot import "FieldSet" from feature "https://specs.apollo.dev/federation" since there\'s a used definition for the namespaced name "federation__FieldSet". Please switch usages of the namespaced name to the import name and remove the definition.',
    ]);
  });

  it('succeeds for unused shadowed type import', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: ["FieldSet"]
        )

      scalar federation__FieldSet

      type Query {
        users: [User!]!
      }

      type User {
        id: ID!
        fieldSet: String!
      }
    `;

    expectErrors(schema, []);
  });

  it('succeeds for shadowed type import used in shadowed import', () => {
    const schema = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: ["@key", "FieldSet"]
        )

      directive @federation__key(
        fields: federation__FieldSet!
        resolvable: Boolean = true
      ) repeatable on OBJECT | INTERFACE

      scalar federation__FieldSet

      type Query {
        users: [User!]!
      }

      type User {
        id: ID!
        fieldSet: String!
      }
    `;

    expectErrors(schema, []);
  });
});

describe('removeAllCoreFeatures', () => {
  it('removes core (and only core) feature definitions, accounting for aliasing', () => {
    const schema = buildSchemaFromAST(gql`
      directive @lonk(
        url: String
        as: String
        for: Porpoise
        import: [lonk__Import]
      ) repeatable on SCHEMA

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
          url: "https://specs.apollo.dev/link/v1.0"
          as: "lonk"
          import: [{ name: "Purpose", as: "Porpoise" }]
        )
        @lonk(
          url: "https://localhost/foobar/v1.0"
          as: "foo"
          import: [
            "bar"
            "@baz"
            { name: "qux", as: "qax" }
            { name: "@quz", as: "@qaz" }
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
      type bar {
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

    removeAllCoreFeatures(schema);
    schema.validate();

    expect(schema.elementByCoordinate('@lonk')).toBeUndefined();
    expect(schema.elementByCoordinate('lonk__Import')).toBeUndefined();
    expect(schema.elementByCoordinate('Porpoise')).toBeUndefined();
    expect(schema.elementByCoordinate('foobar')).toBeDefined();
    expect(schema.elementByCoordinate('foobar__Scalar')).toBeDefined();
    expect(schema.elementByCoordinate('@foobar')).toBeDefined();
    expect(schema.elementByCoordinate('@foobar__directive')).toBeDefined();
    expect(schema.elementByCoordinate('foo')).toBeDefined();
    expect(schema.elementByCoordinate('foo__Scalar')).toBeUndefined();
    expect(schema.elementByCoordinate('@foo')).toBeUndefined();
    expect(schema.elementByCoordinate('@foo__directive')).toBeUndefined();
    expect(schema.elementByCoordinate('bar')).toBeUndefined();
    expect(schema.elementByCoordinate('foo__bar')).toBeUndefined();
    expect(schema.elementByCoordinate('@baz')).toBeUndefined();
    expect(schema.elementByCoordinate('@foo__baz')).toBeUndefined();
    expect(schema.elementByCoordinate('qux')).toBeDefined();
    expect(schema.elementByCoordinate('@quz')).toBeDefined();
    expect(schema.elementByCoordinate('qax')).toBeUndefined();
    expect(schema.elementByCoordinate('foo__qax')).toBeUndefined();
    expect(schema.elementByCoordinate('foo__qux')).toBeUndefined();
    expect(schema.elementByCoordinate('@qaz')).toBeUndefined();
    expect(schema.elementByCoordinate('@foo__qaz')).toBeUndefined();
    expect(schema.elementByCoordinate('@foo__quz')).toBeUndefined();
  });
});

class TestFeatureDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion, fedVersion?: FeatureVersion) {
    super(new FeatureUrl('test', 'test', version), fedVersion);
  }
}

describe('FeatureVersion', () => {
  it('toString-based comparisons', () => {
    const v2_3 = new FeatureVersion(2, 3);
    const v10_0 = new FeatureVersion(10, 0);

    expect(v2_3.toString()).toBe('v2.3');
    expect(v10_0.toString()).toBe('v10.0');

    // Operators like <, <=, >, and >= use lexicographic comparison on
    // version.toString() strings, but do not perform numeric lexicographic
    // comparison of the major and minor numbers, so 'v10...' < 'v2...' and the
    // following comparisons produce unintuitive results.
    expect([v2_3 < v10_0, v2_3 <= v10_0, v2_3 > v10_0, v2_3 >= v10_0]).toEqual(
      // This should really be [true, true, false, false], if JavaScript
      // supported more flexible/general operator overloading.
      [false, false, true, true],
    );

    expect(v2_3.compareTo(v10_0)).toBe(-1);
    expect(v10_0.compareTo(v2_3)).toBe(1);

    expect(v2_3.strictlyGreaterThan(v10_0)).toBe(false);
    expect(v10_0.strictlyGreaterThan(v2_3)).toBe(true);

    expect(v2_3.lt(v10_0)).toBe(true);
    expect(v2_3.lte(v10_0)).toBe(true);
    expect(v2_3.gt(v10_0)).toBe(false);
    expect(v2_3.gte(v10_0)).toBe(false);
    expect(v10_0.lt(v2_3)).toBe(false);
    expect(v10_0.lte(v2_3)).toBe(false);
    expect(v10_0.gt(v2_3)).toBe(true);
    expect(v10_0.gte(v2_3)).toBe(true);

    expect(v2_3.equals(v10_0)).toBe(false);
    expect(v10_0.equals(v2_3)).toBe(false);
    expect(v2_3.equals(v2_3)).toBe(true);
    expect(v10_0.equals(v10_0)).toBe(true);
  });
});

describe('getMinimumRequiredVersion tests', () => {
  it('various combinations', () => {
    const versions = new FeatureDefinitions<TestFeatureDefinition>('test')
      .add(new TestFeatureDefinition(new FeatureVersion(0, 1)))
      .add(
        new TestFeatureDefinition(
          new FeatureVersion(0, 2),
          new FeatureVersion(1, 0),
        ),
      )
      .add(
        new TestFeatureDefinition(
          new FeatureVersion(0, 3),
          new FeatureVersion(2, 0),
        ),
      )
      .add(
        new TestFeatureDefinition(
          new FeatureVersion(0, 4),
          new FeatureVersion(2, 1),
        ),
      )
      .add(
        new TestFeatureDefinition(
          new FeatureVersion(0, 5),
          new FeatureVersion(2, 2),
        ),
      );

    expect(
      versions.getMinimumRequiredVersion(new FeatureVersion(0, 1)).version,
    ).toEqual(new FeatureVersion(0, 1));
    expect(
      versions.getMinimumRequiredVersion(new FeatureVersion(1, 0)).version,
    ).toEqual(new FeatureVersion(0, 2));
    expect(
      versions.getMinimumRequiredVersion(new FeatureVersion(1, 1)).version,
    ).toEqual(new FeatureVersion(0, 2));
    expect(
      versions.getMinimumRequiredVersion(new FeatureVersion(2, 0)).version,
    ).toEqual(new FeatureVersion(0, 3));
    expect(
      versions.getMinimumRequiredVersion(new FeatureVersion(2, 1)).version,
    ).toEqual(new FeatureVersion(0, 4));
    expect(
      versions.getMinimumRequiredVersion(new FeatureVersion(2, 2)).version,
    ).toEqual(new FeatureVersion(0, 5));
    expect(
      versions.getMinimumRequiredVersion(new FeatureVersion(2, 3)).version,
    ).toEqual(new FeatureVersion(0, 5));

    // now add a new major version and test again. All previous version should be forced to the new major
    versions.add(
      new TestFeatureDefinition(
        new FeatureVersion(1, 0),
        new FeatureVersion(2, 4),
      ),
    );
    versions.add(
      new TestFeatureDefinition(
        new FeatureVersion(1, 1),
        new FeatureVersion(2, 5),
      ),
    );

    expect(
      versions.getMinimumRequiredVersion(new FeatureVersion(2, 3)).version,
    ).toEqual(new FeatureVersion(1, 0));
    expect(
      versions.getMinimumRequiredVersion(new FeatureVersion(2, 4)).version,
    ).toEqual(new FeatureVersion(1, 0));
    expect(
      versions.getMinimumRequiredVersion(new FeatureVersion(2, 5)).version,
    ).toEqual(new FeatureVersion(1, 1));
  });
});
