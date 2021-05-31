import { buildSchema } from '@apollo/core';
import { buildGraph, Edge, FieldSpec, Graph, Vertex } from '@apollo/query-graphs';

export function testGraphFromSchemaString(schemaSDL: string): Graph {
  return buildGraph("test", buildSchema(schemaSDL));
}

function singleEdge(graph: Graph, vertex: Vertex, fieldName: string): Edge {
  const edges = graph.outEdges(vertex, new FieldSpec(fieldName));
  expect(edges.length).toBe(1);
  return edges[0];
}

export function namedEdges(graph: Graph, vertex: Vertex, ...fieldNames: string[]): Edge[] {
  const edges = graph.outEdges(vertex);
  return fieldNames.map(name => {
    const edge = singleEdge(graph, vertex, name);
    expect(edges[edge.index]).toBe(edge);
    expect(edge.head).toBe(vertex);
    expect(edge.transition).toStrictEqual(new FieldSpec(name));
    return edge;
  });
}
