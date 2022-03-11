import { buildSupergraphSchema, extractSubgraphsFromSupergraph } from "..";


test('handles types having no fields referenced by other objects in a subgraph correctly', () => {
  /*
   * The following supergraph has been generated on version-0.x from:
   *  - ServiceA:
   *      type Query {
   *        q: A
   *      }
   *
   *      type A {
   *        a: B
   *      }
   *
   *      type B {
   *        b: C @provides(fields: "c")
   *      }
   *
   *      type C {
   *        c: String
   *      }
   *  - ServiceB:
   *      type C {
   *        c: String
   *      }
   *  - ServiceC:
   *      type D {
   *        d: String
   *      }
   *
   * The general idea being that all types are "value types" so ends with no 'join__type' in the supergraph (so
   * `extractSubgraphsFromSupergraph` will have to initially assume that all types are in all subgraphs), but
   * due to the `@provides`, `B.b` has a `join__field`, which makes it be only in "ServiceA". As as result,
   * type `B` will end up empty in both "ServiceB" and "ServiceC" and will need to be removed, which has to
   * trickle to removing type `A` too (since it's only field mentions `B`). This later part wasn't always done
   * correctly, resulting in errors being throws and it is what this test checks.
   */
  const supergraph = `
    schema
      @core(feature: "https://specs.apollo.dev/core/v0.2"),
      @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
    {
      query: Query
    }

    directive @core(as: String, feature: String!, for: core__Purpose) repeatable on SCHEMA

    directive @join__field(graph: join__Graph, provides: join__FieldSet, requires: join__FieldSet) on FIELD_DEFINITION

    directive @join__graph(name: String!, url: String!) on ENUM_VALUE

    directive @join__owner(graph: join__Graph!) on INTERFACE | OBJECT

    directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on INTERFACE | OBJECT

    type A {
      a: B
    }

    type B {
      b: C @join__field(graph: SERVICEA, provides: \"c\")
    }

    type C {
      c: String
    }

    type D {
      d: String
    }

    type Query {
      q: A
    }

    enum core__Purpose {
      """
      \`EXECUTION\` features provide metadata necessary to for operation execution.
      """
      EXECUTION

      """
      \`SECURITY\` features provide metadata necessary to securely resolve fields.
      """
      SECURITY
    }

    scalar join__FieldSet

    enum join__Graph {
      SERVICEA @join__graph(name: "serviceA" url: "")
      SERVICEB @join__graph(name: "serviceB" url: "")
      SERVICEC @join__graph(name: "serviceC" url: "")
    }
  `;

  const schema = buildSupergraphSchema(supergraph)[0];
  const subgraphs = extractSubgraphsFromSupergraph(schema);
  expect(subgraphs.size()).toBe(3);

  const [a, b, c] = subgraphs.values().map((s) => s.schema);
  expect(a.type('A')).toBeDefined();
  expect(a.type('B')).toBeDefined();

  expect(b.type('A')).toBeUndefined();
  expect(b.type('B')).toBeUndefined();

  expect(c.type('A')).toBeUndefined();
  expect(c.type('B')).toBeUndefined();
})

test('handles types having no fields referenced by other interfaces in a subgraph correctly', () => {
  /*
   *
   * The following supergraph has been generated on version-0.x from:
   *  - ServiceA:
   *      type Query {
   *        q: A
   *      }
   *
   *      interface A {
   *        a: B
   *      }
   *
   *      type B {
   *        b: C @provides(fields: "c")
   *      }
   *
   *      type C {
   *        c: String
   *      }
   *  - ServiceB:
   *      type C {
   *        c: String
   *      }
   *  - ServiceC:
   *      type D {
   *        d: String
   *      }
   *
   * This tests is almost identical to the 'handles types having no fields referenced by other objects in a subgraph correctly'
   * one, except that the reference to the type being removed is in an interface, to make double-sure this case is
   * handled as well.
   */
  const supergraph = `
    schema
      @core(feature: "https://specs.apollo.dev/core/v0.2"),
      @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
    {
      query: Query
    }

    directive @core(as: String, feature: String!, for: core__Purpose) repeatable on SCHEMA

    directive @join__field(graph: join__Graph, provides: join__FieldSet, requires: join__FieldSet) on FIELD_DEFINITION

    directive @join__graph(name: String!, url: String!) on ENUM_VALUE

    directive @join__owner(graph: join__Graph!) on INTERFACE | OBJECT

    directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on INTERFACE | OBJECT

    interface A {
      a: B
    }

    type B {
      b: C @join__field(graph: SERVICEA, provides: "c")
    }

    type C {
      c: String
    }

    type D {
      d: String
    }

    type Query {
      q: A
    }

    enum core__Purpose {
      """
      \`EXECUTION\` features provide metadata necessary to for operation execution.
      """
      EXECUTION

      """
      \`SECURITY\` features provide metadata necessary to securely resolve fields.
      """
      SECURITY
    }

    scalar join__FieldSet

    enum join__Graph {
      SERVICEA @join__graph(name: "serviceA" url: "")
      SERVICEB @join__graph(name: "serviceB" url: "")
      SERVICEC @join__graph(name: "serviceC" url: "")
    }
  `;

  const schema = buildSupergraphSchema(supergraph)[0];
  const subgraphs = extractSubgraphsFromSupergraph(schema);
  expect(subgraphs.size()).toBe(3);

  const [a, b, c] = subgraphs.values().map((s) => s.schema);
  expect(a.type('A')).toBeDefined();
  expect(a.type('B')).toBeDefined();

  expect(b.type('A')).toBeUndefined();
  expect(b.type('B')).toBeUndefined();

  expect(c.type('A')).toBeUndefined();
  expect(c.type('B')).toBeUndefined();
})

test('handles types having no fields referenced by other unions in a subgraph correctly', () => {
  /*
   *
   * The following supergraph has been generated on version-0.x from:
   *  - ServiceA:
   *      type Query {
   *        q: A
   *      }
   *
   *      union A = B | C
   *
   *      type B {
   *        b: D @provides(fields: "d")
   *      }
   *
   *      type C {
   *        c: D @provides(fields: "d")
   *      }
   *
   *      type D {
   *        d: String
   *      }
   *  - ServiceB:
   *      type D {
   *        d: String
   *      }
   *
   * This tests is similar identical to 'handles types having no fields referenced by other objects in a subgraph correctly'
   * but the reference to the type being removed is a union, one that should be fully removed.
   */
  const supergraph = `
    schema
      @core(feature: "https://specs.apollo.dev/core/v0.2"),
      @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
    {
      query: Query
    }

    directive @core(as: String, feature: String!, for: core__Purpose) repeatable on SCHEMA

    directive @join__field(graph: join__Graph, provides: join__FieldSet, requires: join__FieldSet) on FIELD_DEFINITION

    directive @join__graph(name: String!, url: String!) on ENUM_VALUE

    directive @join__owner(graph: join__Graph!) on INTERFACE | OBJECT

    directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on INTERFACE | OBJECT

    union A = B | C

    type B {
      b: D @join__field(graph: SERVICEA, provides: "d")
    }

    type C {
      c: D @join__field(graph: SERVICEA, provides: "d")
    }

    type D {
      d: String
    }

    type Query {
      q: A
    }

    enum core__Purpose {
      """
      \`EXECUTION\` features provide metadata necessary to for operation execution.
      """
      EXECUTION

      """
      \`SECURITY\` features provide metadata necessary to securely resolve fields.
      """
      SECURITY
    }

    scalar join__FieldSet

    enum join__Graph {
      SERVICEA @join__graph(name: "serviceA" url: "")
      SERVICEB @join__graph(name: "serviceB" url: "")
    }
  `;

  const schema = buildSupergraphSchema(supergraph)[0];
  const subgraphs = extractSubgraphsFromSupergraph(schema);
  expect(subgraphs.size()).toBe(2);

  const [a, b] = subgraphs.values().map((s) => s.schema);
  expect(a.type('A')).toBeDefined();
  expect(a.type('B')).toBeDefined();
  expect(a.type('C')).toBeDefined();
  expect(a.type('D')).toBeDefined();

  expect(b.type('A')).toBeUndefined();
  expect(b.type('B')).toBeUndefined();
  expect(b.type('C')).toBeUndefined();
  expect(a.type('D')).toBeDefined();
})

test('handles types having only some of their fields removed in a subgraph correctly', () => {
  /*
   * The following supergraph has been generated on version-0.x from:
   *  - ServiceA:
   *      type Query {
   *        q: A
   *      }
   *
   *      type A {
   *        a: B
   *      }
   *
   *      type B {
   *        b: C @provides(fields: "c")
   *        c: Int
   *      }
   *
   *      type C {
   *        c: String
   *      }
   *  - ServiceB:
   *      type C {
   *        c: String
   *      }
   *  - ServiceC:
   *      type D {
   *        d: String
   *      }
   *
   * This tests is similar identical to 'handles types having no fields referenced by other objects in a subgraph correctly'
   * but where no all of B type fields are "removed" and so the type should be preserved. So it's a "negative" version of
   * that prior test of sorts.
   */
  const supergraph = `
    schema
      @core(feature: "https://specs.apollo.dev/core/v0.2"),
      @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
    {
      query: Query
    }

    directive @core(as: String, feature: String!, for: core__Purpose) repeatable on SCHEMA

    directive @join__field(graph: join__Graph, provides: join__FieldSet, requires: join__FieldSet) on FIELD_DEFINITION

    directive @join__graph(name: String!, url: String!) on ENUM_VALUE

    directive @join__owner(graph: join__Graph!) on INTERFACE | OBJECT

    directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on INTERFACE | OBJECT

    type A {
      a: B
    }

    type B {
      b: C @join__field(graph: SERVICEA, provides: "c")
      c: Int
    }

    type C {
      c: String
    }

    type D {
      d: String
    }

    type Query {
      q: A
    }

    enum core__Purpose {
      """
      \`EXECUTION\` features provide metadata necessary to for operation execution.
      """
      EXECUTION

      """
      \`SECURITY\` features provide metadata necessary to securely resolve fields.
      """
      SECURITY
    }

    scalar join__FieldSet

    enum join__Graph {
      SERVICEA @join__graph(name: "serviceA" url: "")
      SERVICEB @join__graph(name: "serviceB" url: "")
      SERVICEC @join__graph(name: "serviceC" url: "")
    }
  `;

  const schema = buildSupergraphSchema(supergraph)[0];
  const subgraphs = extractSubgraphsFromSupergraph(schema);
  expect(subgraphs.size()).toBe(3);

  const [a, b, c] = subgraphs.values().map((s) => s.schema);
  expect(a.type('A')).toBeDefined();
  expect(a.type('B')).toBeDefined();

  // Do note that the fact that A and B are extracted in subgraph 'c' and 'd' is, in a way, "wrong" since
  // those subgraphs didn't had those type originally, but nothing in the supergraph allows to make that
  // decision so this simply assert the actuall code behaviour.

  expect(b.type('A')).toBeDefined();
  expect(b.type('B')).toBeDefined();

  expect(c.type('A')).toBeDefined();
  expect(c.type('B')).toBeDefined();
})

test('handles unions types having no members in a subgraph correctly', () => {
  /*
   * The following supergraph has been generated on version-0.x from:
   *  - ServiceA:
   *      type Query {
   *        q: A
   *      }
   *
   *      union A = B | C
   *
   *      type B @key(fields: "b") {
   *        b: D
   *      }
   *
   *      type C @key(fields: "c"){
   *        c: D
   *      }
   *
   *      type D {
   *        d: String
   *      }
   *  - ServiceB:
   *      type D {
   *        d: String
   *      }
   *
   * This tests is similar to the other test with unions, but because its members are enties, the
   * members themself with have a join__owner, and that means the removal will hit a different
   * code path (technically, the union A will be "removed" directly by `extractSubgraphsFromSupergraph`
   * instead of being removed indirectly through the removal of its members).
   */
  const supergraph = `
    schema
      @core(feature: "https://specs.apollo.dev/core/v0.2"),
      @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
    {
      query: Query
    }

    directive @core(as: String, feature: String!, for: core__Purpose) repeatable on SCHEMA

    directive @join__field(graph: join__Graph, provides: join__FieldSet, requires: join__FieldSet) on FIELD_DEFINITION

    directive @join__graph(name: String!, url: String!) on ENUM_VALUE

    directive @join__owner(graph: join__Graph!) on INTERFACE | OBJECT

    directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on INTERFACE | OBJECT

    union A = B | C

    type B @join__owner(graph: SERVICEA) @join__type(graph: SERVICEA, key: "b { d }") {
      b: D
    }

    type C @join__owner(graph: SERVICEA) @join__type(graph: SERVICEA, key: "c { d }") {
      c: D
    }

    type D {
      d: String
    }

    type Query {
      q: A
    }

    enum core__Purpose {
      """
      \`EXECUTION\` features provide metadata necessary to for operation execution.
      """
      EXECUTION

      """
      \`SECURITY\` features provide metadata necessary to securely resolve fields.
      """
      SECURITY
    }

    scalar join__FieldSet

    enum join__Graph {
      SERVICEA @join__graph(name: "serviceA" url: "")
      SERVICEB @join__graph(name: "serviceB" url: "")
    }
  `;

  const schema = buildSupergraphSchema(supergraph)[0];
  const subgraphs = extractSubgraphsFromSupergraph(schema);
  expect(subgraphs.size()).toBe(2);

  const [a, b] = subgraphs.values().map((s) => s.schema);
  expect(a.type('A')).toBeDefined();
  expect(a.type('B')).toBeDefined();
  expect(a.type('C')).toBeDefined();
  expect(a.type('D')).toBeDefined();

  expect(b.type('A')).toBeUndefined();
  expect(b.type('B')).toBeUndefined();
  expect(b.type('C')).toBeUndefined();
  expect(a.type('D')).toBeDefined();
})

test('throw meaningful error for invalid federation directive fieldSet', () => {
  const supergraph = `
    schema
      @core(feature: "https://specs.apollo.dev/core/v0.2"),
      @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
    {
      query: Query
    }

    directive @core(as: String, feature: String!, for: core__Purpose) repeatable on SCHEMA

    directive @join__field(graph: join__Graph, provides: join__FieldSet, requires: join__FieldSet) on FIELD_DEFINITION

    directive @join__graph(name: String!, url: String!) on ENUM_VALUE

    directive @join__owner(graph: join__Graph!) on INTERFACE | OBJECT

    directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on INTERFACE | OBJECT

    type A @join__owner(graph: SERVICEA) @join__type(graph: SERVICEA, key: "id") @join__type(graph: SERVICEB, key: "id") {
      id: ID
      a: Int @join__field(graph: SERVICEB, requires: "b { x }")
      b: B
    }

    type B @join__owner(graph: SERVICEA) @join__type(graph: SERVICEA, key: "id") {
      id: ID
      x: Int
    }

    type Query {
      q: A
    }

    enum core__Purpose {
      """
      \`EXECUTION\` features provide metadata necessary to for operation execution.
      """
      EXECUTION

      """
      \`SECURITY\` features provide metadata necessary to securely resolve fields.
      """
      SECURITY
    }

    scalar join__FieldSet

    enum join__Graph {
      SERVICEA @join__graph(name: "serviceA" url: "")
      SERVICEB @join__graph(name: "serviceB" url: "")
    }
  `;

  const schema = buildSupergraphSchema(supergraph)[0];
  expect(() => extractSubgraphsFromSupergraph(schema)).toThrow(
    'Error extracting subgraph "serviceB" from the supergraph: this might due to errors in subgraphs that were mistakenly ignored by federation 0.x versions but are rejected by federation 2.\n'
    + 'Please try composing your subgraphs with federation 2: this should help precisely pinpoint the problems and, once fixed, generate a correct federation 2 supergraph.\n'
    + '\n'
    + 'Details:\n'
    + '[serviceB] On field "A.a", for @requires(fields: "b { x }"): Cannot query field "b" on type "A" (if the field is defined in another subgraph, you need to add it to this subgraph with @external).'
  );
})
