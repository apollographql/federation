import { CompositionOptions, composeServices } from '@apollo/composition';
import { Supergraph } from '@apollo/federation-internals';
import { buildFederatedQueryGraph } from '@apollo/query-graphs';
import { parse } from 'graphql';

function compose(first: string, second = 'type Query { b: String }', options: CompositionOptions = {}) {
  const result = composeServices([
    { name: 'a', typeDefs: parse(first) },
    { name: 'b', typeDefs: parse(second) },
  ], options);
  if (result.errors) throw result.errors[0];
  return Supergraph.build(result.supergraphSdl, { supportedFeatures: null });
}

function rootEdges(supergraph: Supergraph, forQueryPlanning: boolean) {
  return [...buildFederatedQueryGraph(supergraph, forQueryPlanning).allEdges()]
    .filter(e => e.transition.kind === 'RootTypeResolution');
}

test('validation omits unused root transitions while planning retains self and cross-root edges', () => {
  const supergraph = compose('type Query { a: String } type Mutation { m: String } type Subscription { s: String }');
  expect(rootEdges(supergraph, false)).toHaveLength(0);
  const planning = rootEdges(supergraph, true);
  expect(planning.some(e => e.isKeyOrRootTypeEdgeToSelf())).toBe(true);
  expect(planning.some(e => e.head.source !== e.tail.source)).toBe(true);
});

test.each([
  ['field', 'type Query { a: String nested: Query }'],
  ['list field', 'type Query { a: String nested: [Query!]! }'],
  ['union', 'type Query { a: String nested: RootValue } union RootValue = Query'],
  ['interface', 'interface RootValue { a: String } type Query implements RootValue { a: String nested: RootValue }'],
  ['entity key', 'type Query @key(fields: "a") { a: String }'],
])('validation retains transitions when a root is reachable through a %s', (_, sdl) => {
  const supergraph = compose(sdl);
  expect(rootEdges(supergraph, false).length).toBeGreaterThan(0);
});

test('a reference in another operation root keeps the referenced root transitions', () => {
  const supergraph = compose('type Query { a: String } type Mutation { nested: Query }');
  const edges = rootEdges(supergraph, false);
  expect(edges.length).toBeGreaterThan(0);
  expect(edges.every(e => e.transition.kind === 'RootTypeResolution' && e.transition.rootKind === 'query')).toBe(true);
});

test('a reference in a later subgraph keeps transitions from every source root', () => {
  const supergraph = compose('type Query { a: String }', 'type Query { b: String nested: Query }');
  const edges = rootEdges(supergraph, false);
  expect(new Set(edges.map(e => e.head.source)).size).toBe(2);
});

test('@requires on a root field keeps the transitions of that root kind', () => {
  const supergraph = compose(
    `
      extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@requires", "@external"])
      type Query { a: String foo: String @requires(fields: "bar") bar: String @external }
      type Mutation { m: String }
    `,
    'type Query { b: String bar: String } type Mutation { n: String }',
    { runSatisfiability: false },
  );
  const edges = rootEdges(supergraph, false);
  expect(edges.length).toBeGreaterThan(0);
  expect(edges.every(e => e.transition.kind === 'RootTypeResolution' && e.transition.rootKind === 'query')).toBe(true);
});

test('@context on a root type keeps the transitions of that root kind', () => {
  const supergraph = compose(`
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@context", "@fromContext"])
    type Query @context(name: "ctx") { x: Int t: T }
    type T @key(fields: "id") { id: ID! f(a: Int @fromContext(field: "$ctx { x }")): Int }
    type Mutation { m: String }
  `);
  const edges = rootEdges(supergraph, false);
  expect(edges.length).toBeGreaterThan(0);
  expect(edges.every(e => e.transition.kind === 'RootTypeResolution' && e.transition.rootKind === 'query')).toBe(true);
});
