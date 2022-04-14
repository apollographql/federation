import { buildSchema, InterfaceType, ObjectType } from '@apollo/federation-internals';
import { buildQueryGraph, Edge, FieldCollection, QueryGraph, Vertex } from '@apollo/query-graphs';

export function testGraphFromSchemaString(schemaSDL: string): QueryGraph {
  return buildQueryGraph("test", buildSchema(schemaSDL));
}

function singleEdge(graph: QueryGraph, vertex: Vertex, fieldName: string): Edge {
  const type = vertex.type as (ObjectType | InterfaceType)
  const f = type.field(fieldName);
  expect(f).toBeDefined();
  const edges = graph.outEdges(vertex).filter(e => e.matchesSupergraphTransition(new FieldCollection(f!)));
  expect(edges.length).toBe(1);
  return edges[0];
}

export function namedEdges(graph: QueryGraph, vertex: Vertex, ...fieldNames: string[]): Edge[] {
  const edges = graph.outEdges(vertex);
  return fieldNames.map(name => {
    const edge = singleEdge(graph, vertex, name);
    expect(edges[edge.index]).toBe(edge);
    expect(edge.head).toBe(vertex);
    const type = vertex.type as (ObjectType | InterfaceType)
    const f = type.field(name);
    expect(f).toBeDefined();
    expect(edge.transition).toStrictEqual(new FieldCollection(f!));
    return edge;
  });
}
