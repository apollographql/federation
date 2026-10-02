import { composeServices } from '@apollo/composition';
import { MapWithCachedArrays, MultiMap, SchemaRootKind, Supergraph } from '@apollo/federation-internals';
import { buildFederatedQueryGraph, Edge, QueryGraph, RootVertex } from '@apollo/query-graphs';
import { parse } from 'graphql';
import { testGraphFromSchemaString } from './testUtils';

test('field lookup preserves distinct candidates and their edge order', () => {
  const original = testGraphFromSchemaString('type Query { value: String }');
  const root = original.root('query')!;
  const edges = [...original.outEdges(root, true)];
  const value = edges.find(edge => edge.isEdgeForField('value'))!;
  const duplicate = new Edge(edges.length, root, value.tail, value.transition, undefined, { label: 'enabled', condition: true });
  edges.push(duplicate);
  const roots = new MapWithCachedArrays<SchemaRootKind, RootVertex>();
  roots.set('query', root);
  const graph = new QueryGraph(
    'candidates',
    original.vertices,
    original.vertices.map(vertex => vertex === root ? edges : [...original.outEdges(vertex, true)]),
    new MultiMap(),
    roots,
    original.sources,
    new Map(),
    new Map(),
    original.schema,
  );
  const candidates = graph.outEdgesForField(root, 'value');
  expect(candidates).toHaveLength(2);
  expect(candidates[0]).toBe(value);
  expect(candidates[1]).toBe(duplicate);
  expect(graph.outEdgesForField(root, 'value')).toBe(candidates);
  expect(graph.outEdgesForField(root, 'absent')).toEqual([]);
  expect(graph.outEdgesForField(value.tail, 'value')).toEqual([]);
});

test('field lookup keeps provided fields local to their copied vertex', () => {
  const result = composeServices([
    {
      name: 'a',
      typeDefs: parse(`
        type Query { ordinary: Item provided: Item @provides(fields: "name") }
        type Item @key(fields: "id") { id: ID! name: String @external }
      `),
    },
    {
      name: 'b',
      typeDefs: parse('type Item @key(fields: "id") { id: ID! name: String }'),
    },
  ]);
  if (result.errors) throw result.errors[0];
  const graph = buildFederatedQueryGraph(Supergraph.build(result.supergraphSdl), true);
  const copies = graph.vertices.filter(vertex => vertex.source === 'a' && vertex.type.name === 'Item');
  expect(copies.length).toBeGreaterThan(1);
  expect(copies.some(vertex => graph.outEdgesForField(vertex, 'name').length === 0)).toBe(true);
  expect(copies.some(vertex => graph.outEdgesForField(vertex, 'name').length === 1)).toBe(true);
  for (const vertex of graph.vertices) {
    for (const name of ['ordinary', 'provided', 'id', 'name', '__typename', 'absent']) {
      const expected = graph.outEdges(vertex).filter(edge => edge.isEdgeForField(name));
      const actual = graph.outEdgesForField(vertex, name);
      expect(actual).toHaveLength(expected.length);
      actual.forEach((edge, index) => expect(edge).toBe(expected[index]));
    }
  }
});
