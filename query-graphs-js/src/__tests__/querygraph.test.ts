import { ObjectType } from "@apollo/federation-internals";
import { FieldCollection } from "@apollo/query-graphs";
import { DownCast } from "../transition";
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
  expect(rootEdges.length).toBe(2);
  const typenameEdge = rootEdges[0];
  expect(typenameEdge.index).toBe(0);
  expect(typenameEdge.transition.kind).toBe('FieldCollection');
  expect((typenameEdge.transition as FieldCollection).definition.name).toBe('__typename');

  const rootEdge = rootEdges[1];
  expect(rootEdge.index).toBe(1);
  expect(rootEdge.head).toStrictEqual(root);
  expect(graph.outEdge(root, rootEdge.index)).toStrictEqual(rootEdge);

  expect(rootEdge.label()).toBe('t1');
  const schema = [...graph.sources.values()][0];
  const t1Field = (schema.type('Query')! as ObjectType).field('t1')!;
  expect(rootEdge.matchesSupergraphTransition(new FieldCollection(t1Field))).toBe(true);
  expect(rootEdge.matchesSupergraphTransition(new DownCast(t1Field.parent, t1Field.parent))).toBe(false);

  const t1 = rootEdge.tail;
  expect(t1.type.name).toBe('T1');

  const t1Edges = graph.outEdges(t1);
  expect(t1Edges.length).toBe(4);

  const [_typename1, f1, f2, f3] = namedEdges(graph, t1, '__typename', 'f1', 'f2', 'f3');

  const intVertex = f1.tail;
  expect(graph.isTerminal(intVertex)).toBe(true);
  expect(intVertex.type.name).toBe('Int');

  const stringVertex = f2.tail;
  expect(graph.isTerminal(stringVertex)).toBe(true);
  expect(stringVertex.type.name).toBe('String');

  const t2 = f3.tail;
  expect(t2.type.name).toBe('T2');

  const t2Edges = graph.outEdges(t2);
  expect(t2Edges.length).toBe(2);

  const [_typename2, t] = namedEdges(graph, t2, '__typename', 't');
  expect(t.tail).toBe(t1);
});
