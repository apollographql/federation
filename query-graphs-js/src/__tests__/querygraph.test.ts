import { FieldSpec, freeTransition } from "@apollo/query-graphs";
import { namedEdges, testGraphFromSchemaString } from './testUtils';

test('building query graphs from schema handles object types', () => {
  const graph = testGraphFromSchemaString(`
    type Query {
      t1: T1
    }

    type T1 {
      f1: Int
      f2: String
      f3: T2
    }

    type T2 {
      t: T1
    }
  `);

  // We have 3 object types and 2 scalars (Int and String)
  expect(graph.verticesCount()).toBe(5);
  expect(graph.rootKinds()).toStrictEqual(['query']);

  const root = graph.roots()[0];
  expect(root.type.name).toBe('Query');
  expect(graph.isTerminal(root)).toBe(false);

  const rootEdges = graph.outEdges(root);
  expect(rootEdges.length).toBe(1);
  const rootEdge = rootEdges[0];
  expect(rootEdge.index).toBe(0);
  expect(rootEdge.head).toStrictEqual(root);
  expect(graph.outEdge(root, rootEdge.index)).toStrictEqual(rootEdge);
  expect(graph.outEdges(root, freeTransition)).toStrictEqual([]);
  expect(graph.outEdges(root, new FieldSpec('t1'))).toStrictEqual(rootEdges);
  expect(graph.outEdges(root, new FieldSpec('t'))).toStrictEqual([]);

  expect(rootEdge.label()).toBe('t1');
  expect(rootEdge.matches(new FieldSpec('t1'))).toBe(true);
  expect(rootEdge.matches(freeTransition)).toBe(false);

  const t1 = rootEdge.tail;
  expect(t1.type.name).toBe('T1');

  const t1Edges = graph.outEdges(t1);
  expect(t1Edges.length).toBe(3);

  const [f1, f2, f3] = namedEdges(graph, t1, 'f1', 'f2', 'f3');

  const intVertex = f1.tail;
  expect(graph.isTerminal(intVertex)).toBe(true);
  expect(intVertex.type.name).toBe('Int');

  const stringVertex = f2.tail;
  expect(graph.isTerminal(stringVertex)).toBe(true);
  expect(stringVertex.type.name).toBe('String');

  const t2 = f3.tail;
  expect(t2.type.name).toBe('T2');

  const t2Edges = graph.outEdges(t2);
  expect(t2Edges.length).toBe(1);

  const [t] = namedEdges(graph, t2, 't');
  expect(t.tail).toBe(t1);
});
