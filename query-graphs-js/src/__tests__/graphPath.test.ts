import {
  Field,
  FieldDefinition,
  Schema,
  Supergraph,
  assert,
} from "@apollo/federation-internals";
import {
  GraphPath,
  OpGraphPath,
  SimultaneousPathsWithLazyIndirectPaths,
  advanceSimultaneousPathsWithOperation,
  createInitialOptions
} from "../graphPath";
import { QueryGraph, Vertex, buildFederatedQueryGraph } from "../querygraph";
import { emptyContext } from "../pathContext";
import { simpleValidationConditionResolver } from "../conditionsValidation";

function parseSupergraph(subgraphs: number, schema: string): { supergraph: Schema, api: Schema, queryGraph: QueryGraph } {
  assert(subgraphs >= 1, 'Should have at least 1 subgraph');
  const header = `
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
      {
        query: Query
      }

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE
      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
      directive @join__graph(name: String!, url: String!) on ENUM_VALUE
      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE
      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR
      directive @join__unionMember(graph: join__Graph!, member: String!) repeatable on UNION
      directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

      scalar join__FieldSet

      scalar link__Import

      enum link__Purpose {
        SECURITY
        EXECUTION
      }

      enum join__Graph {
        ${[...Array(subgraphs).keys()].map((n) => `S${n+1} @join__graph(name: "S${n+1}", url: "https://S${n+1}")`).join('\n')}
      }

  `;

  try {
    const supergraph = Supergraph.build(header + schema);
    return {
      supergraph: supergraph.schema,
      api: supergraph.apiSchema(),
      queryGraph: buildFederatedQueryGraph(supergraph, true),
    };
  } catch (e) {
    throw new Error('Error parsing supergraph schema:\n' + e.toString());
  }
}

function createOptions(supergraph: Schema, queryGraph: QueryGraph): SimultaneousPathsWithLazyIndirectPaths<Vertex>[] {
  // We know we only use `Query` in the supergraph, so there is only that as root.
  const root = queryGraph.roots()[0];
  const initialPath: OpGraphPath<Vertex> = GraphPath.create(queryGraph, root);
  return createInitialOptions(
    initialPath,
    emptyContext,
    simpleValidationConditionResolver({ supergraph, queryGraph, overrideConditions: new Map() }),
    [],
    [],
    new Map(),
  );
}

function field(schema: Schema, coordinate: string): Field {
  const def = schema.elementByCoordinate(coordinate) as FieldDefinition<any>;
  return new Field(def);
}

describe("advanceSimultaneousPathsWithOperation", () => {
  test("do not use key `x` to fetch `x`", () => {
    const { supergraph, api, queryGraph } = parseSupergraph(3, `
       type Query
         @join__type(graph: S1)
       {
          t: T @join__field(graph: S1)
       }

       type T
         @join__type(graph: S1)
         @join__type(graph: S2, key: "otherId")
         @join__type(graph: S2, key: "id")
         @join__type(graph: S3, key: "id")
       {
          otherId: ID! @join__field(graph: S1) @join__field(graph: S2)
          id: ID!      @join__field(graph: S2) @join__field(graph: S3)
       }
    `);

    // Picking the first initial, the one going to S1
    const initial = createOptions(supergraph, queryGraph)[0];

    // Then picking `t`, which should be just the one option of picking it in S1 at this point.
    const allAfterT = advanceSimultaneousPathsWithOperation(supergraph, initial, field(api, "Query.t"), new Map());
    assert(allAfterT, 'Should have advanced correctly');
    expect(allAfterT).toHaveLength(1);
    const afterT = allAfterT[0];
    expect(afterT.toString()).toBe(`Query(S1) --[t]--> T(S1) (types: [T])`);

    // Checking that, at this point, we technically have 2 options:
    // 1. we can go to S2 using `otherId`.
    // 2. we can go to S3 using `id`, assuming we first get `id` from S2 (using `otherId`).
    const indirect = afterT.indirectOptions(afterT.context, 0);
    expect(indirect.paths).toHaveLength(2);
    expect(indirect.paths[0].toString()).toBe(`Query(S1) --[t]--> T(S1) --[{ otherId } ⊢ key()]--> T(S2) (types: [T])`);
    expect(indirect.paths[1].toString()).toBe(`Query(S1) --[t]--> T(S1) --[{ id } ⊢ key()]--> T(S3) (types: [T])`);

    const allForId = advanceSimultaneousPathsWithOperation(supergraph, afterT, field(api, "T.id"), new Map());
    assert(allForId, 'Should have advanced correctly');

    // Here, `id` is a direct path from both of our indirect paths. However, it makes no sense to use the 2nd
    // indirect path above, since the condition to get to `S3` was `id`, and this means another indirect path
    // is able to get to `id` more directly (the first one in this case).
    // So ultimately, we should only keep the 1st option.
    expect(allForId).toHaveLength(1);
    const forId = allForId[0];
    expect(forId.toString()).toBe(`Query(S1) --[t]--> T(S1) --[{ otherId } ⊢ key()]--> T(S2) --[id]--> ID(S2)`);
  });

  test("do not use key containing `x` to fetch `x`", () => {
    // Similar to the previous test, but the key used is not exactly the fetch field, it only contains
    // it (but the optimisation should still work).
    const { supergraph, api, queryGraph } = parseSupergraph(3, `
       type Query
         @join__type(graph: S1)
       {
          t: T @join__field(graph: S1)
       }

       type T
         @join__type(graph: S1)
         @join__type(graph: S2, key: "otherId")
         @join__type(graph: S2, key: "id1 id2")
         @join__type(graph: S3, key: "id1 id2")
       {
          otherId: ID! @join__field(graph: S1) @join__field(graph: S2)
          id1: ID!      @join__field(graph: S2) @join__field(graph: S3)
          id2: ID!      @join__field(graph: S2) @join__field(graph: S3)
       }
    `);

    // Picking the first initial, the one going to S1
    const initial = createOptions(supergraph, queryGraph)[0];

    // Then picking `t`, which should be just the one option of picking it in S1 at this point.
    const allAfterT = advanceSimultaneousPathsWithOperation(supergraph, initial, field(api, "Query.t"), new Map());
    assert(allAfterT, 'Should have advanced correctly');
    expect(allAfterT).toHaveLength(1);
    const afterT = allAfterT[0];
    expect(afterT.toString()).toBe(`Query(S1) --[t]--> T(S1) (types: [T])`);

    // Checking that, at this point, we technically have 2 options:
    // 1. we can go to S2 using `otherId`.
    // 2. we can go to S3 using `id1 id2`, assuming we first get `id1 id2` from S2 (using `otherId`).
    const indirect = afterT.indirectOptions(afterT.context, 0);
    expect(indirect.paths).toHaveLength(2);
    expect(indirect.paths[0].toString()).toBe(`Query(S1) --[t]--> T(S1) --[{ otherId } ⊢ key()]--> T(S2) (types: [T])`);
    expect(indirect.paths[1].toString()).toBe(`Query(S1) --[t]--> T(S1) --[{ id1 id2 } ⊢ key()]--> T(S3) (types: [T])`);

    const allForId = advanceSimultaneousPathsWithOperation(supergraph, afterT, field(api, "T.id1"), new Map());
    assert(allForId, 'Should have advanced correctly');

    // Here, `id1` is a direct path from both of our indirect paths. However, it makes no sense to use the 2nd
    // indirect path above, since the condition to get to `S3` was `id1 id2`, which includes `id1`.
    expect(allForId).toHaveLength(1);
    const forId = allForId[0];
    expect(forId.toString()).toBe(`Query(S1) --[t]--> T(S1) --[{ otherId } ⊢ key()]--> T(S2) --[id1]--> ID(S2)`);
  });

  test("avoids indirect path that needs a key to the same subgraph to validate its condition", () => {
    const { supergraph, api, queryGraph } = parseSupergraph(2, `
       type Query
         @join__type(graph: S1)
       {
          t: T @join__field(graph: S1)
       }

       type T
         @join__type(graph: S1)
         @join__type(graph: S2, key: "id1")
         @join__type(graph: S2, key: "id2")
       {
          id1: ID! @join__field(graph: S2)
          id2: ID! @join__field(graph: S1) @join__field(graph: S2)
       }
    `);

    // Picking the first initial, the one going to S1
    const initial = createOptions(supergraph, queryGraph)[0];

    // Then picking `t`, which should be just the one option of picking it in S1 at this point.
    const allAfterT = advanceSimultaneousPathsWithOperation(supergraph, initial, field(api, "Query.t"), new Map());
    assert(allAfterT, 'Should have advanced correctly');
    expect(allAfterT).toHaveLength(1);
    const afterT = allAfterT[0];
    expect(afterT.toString()).toBe(`Query(S1) --[t]--> T(S1) (types: [T])`);

    // Technically, the `id1` key could be used to go to S2 by first getting `id1` from S2 using `id2`, but
    // that's obviously unecessary to consider since we can just use `id2` to go to S2 in the first place.
    const indirect = afterT.indirectOptions(afterT.context, 0);
    expect(indirect.paths).toHaveLength(1);
    expect(indirect.paths[0].toString()).toBe(`Query(S1) --[t]--> T(S1) --[{ id2 } ⊢ key()]--> T(S2) (types: [T])`);
  });
});
