import { DocumentNode, GraphQLError } from "graphql";
import gql from "graphql-tag";
import { buildSubgraph } from "../../federation";
import { assert } from "../../utils";
import { buildSchemaFromAST } from "../../buildSchema";
import { removeAllCoreFeatures, FeatureDefinitions, FeatureVersion, FeatureDefinition, FeatureUrl } from "../coreSpec";
import { errorCauses } from "../../error";

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

    removeAllCoreFeatures(schema);
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
    // following comparisons fail to produce intuitive results.
    expect(() => {
      expect(v2_3 < v10_0).toBe(true);
      expect(v2_3 <= v10_0).toBe(true);
      expect(v2_3 > v10_0).toBe(false);
      expect(v2_3 >= v10_0).toBe(false);
    }).toThrow();

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
      .add(new TestFeatureDefinition(new FeatureVersion(0, 2), new FeatureVersion(1, 0)))
      .add(new TestFeatureDefinition(new FeatureVersion(0, 3), new FeatureVersion(2,0)))
      .add(new TestFeatureDefinition(new FeatureVersion(0, 4), new FeatureVersion(2,1)))
      .add(new TestFeatureDefinition(new FeatureVersion(0, 5), new FeatureVersion(2,2)));

    expect(versions.getMinimumRequiredVersion(new FeatureVersion(0, 1)).version).toEqual(new FeatureVersion(0, 1));
    expect(versions.getMinimumRequiredVersion(new FeatureVersion(1, 0)).version).toEqual(new FeatureVersion(0, 2));
    expect(versions.getMinimumRequiredVersion(new FeatureVersion(1, 1)).version).toEqual(new FeatureVersion(0, 2));
    expect(versions.getMinimumRequiredVersion(new FeatureVersion(2, 0)).version).toEqual(new FeatureVersion(0, 3));
    expect(versions.getMinimumRequiredVersion(new FeatureVersion(2, 1)).version).toEqual(new FeatureVersion(0, 4));
    expect(versions.getMinimumRequiredVersion(new FeatureVersion(2, 2)).version).toEqual(new FeatureVersion(0, 5));
    expect(versions.getMinimumRequiredVersion(new FeatureVersion(2, 3)).version).toEqual(new FeatureVersion(0, 5));

    // now add a new major version and test again. All previous version should be forced to the new major
    versions.add(new TestFeatureDefinition(new FeatureVersion(1, 0), new FeatureVersion(2, 4)));
    versions.add(new TestFeatureDefinition(new FeatureVersion(1, 1), new FeatureVersion(2, 5)));

    expect(versions.getMinimumRequiredVersion(new FeatureVersion(2, 3)).version).toEqual(new FeatureVersion(1, 0));
    expect(versions.getMinimumRequiredVersion(new FeatureVersion(2, 4)).version).toEqual(new FeatureVersion(1, 0));
    expect(versions.getMinimumRequiredVersion(new FeatureVersion(2, 5)).version).toEqual(new FeatureVersion(1, 1));
  })
})
