/* Functions used to output query graphs as [graphviz dot](https://graphviz.org/doc/info/lang.html) outputs.  */

import { simpleTraversal, Edge, QueryGraph, QueryGraphState, Vertex } from "./querygraph";
import { attribute, digraph, RootGraphModel, GraphBaseModel, EdgeModel, NodeModel, toDot as graphvizToDot } from 'ts-graphviz';
import { RootPath, traversePath } from "./graphPath";

function setDefaultGraphAttributes(_: RootGraphModel) {
  //vizGraph.attributes.edge.set(attribute.labelfloat, true);
}

export function toDot(graph: QueryGraph, config?: DotGraphConfig): string {
  const vizGraph = digraph(graph.name);
  setDefaultGraphAttributes(vizGraph);
  addToVizGraphAndHighlight(graph, vizGraph, config);
  return graphvizToDot(vizGraph);
}

export function groupToDot(
  name: string,
  graphs: Map<string, QueryGraph>,
  configs: Map<string, DotGraphConfig> = new Map(),
): string {
  const vizGraph = digraph(name);
  setDefaultGraphAttributes(vizGraph);
  for (const [group, graph] of graphs.entries()) {
    const cluster = vizGraph.createSubgraph(`cluster_${group}`, {
      [attribute.label]: `${group}`,
      [attribute.style]: "filled",
      [attribute.color]: "grey95"
    });
    addToVizGraphAndHighlight(graph, cluster, configs.get(group));
  }
  return graphvizToDot(vizGraph);
}

function addToVizGraphAndHighlight(graph: QueryGraph, vizGraph: GraphBaseModel, config?: DotGraphConfig) {
  const state = addToVizGraph(graph, vizGraph, config?.noTerminal);
  highlightPaths(state, config?.highlightedPaths);
}

export type DotGraphConfig = {
  highlightedPaths?: HighlitedPath[],
  noTerminal?: boolean
}

// Colors chosen from https://graphviz.org/doc/info/colors.html, picked so that
// they are not too close to each other.
const colors = [
  'blue',
  'darkgreen',
  'red',
  'yellow',
  'orange',
  'lightseagreen'
];

export function pickHighlights(paths: RootPath<any>[], excluded: string[] = []): HighlitedPath[] {
  const usableColors = colors.filter(c => !excluded.includes(c));
  return paths.map((path, i) => { return { path, color: usableColors[i % usableColors.length]}});
}

type HighlitedPath = {
  path: RootPath<any>,
  color: string
}

function addToVizGraph(graph: QueryGraph, vizGraph: GraphBaseModel, noTerminal: boolean = false): QueryGraphState<NodeModel, EdgeModel> {
  const vizSubGraphs = new Map();
  for (const source of graph.sources.keys()) {
    if (source != graph.name) {
      // Note: the fact the subgraph name is prefixed by "cluster" is a graphviz thing (https://graphviz.org/Gallery/directed/cluster.html)
      vizSubGraphs.set(source, vizGraph.createSubgraph(`cluster_${source}`, {
        [attribute.label]: `Subgraph "${source}"`,
        [attribute.color]: "black",
        [attribute.style]: "" // Reset to non-filled
      }));
    }
  }
  const getNode = function (vertex: Vertex): NodeModel {
    const existingNode = state.getVertexState(vertex);
    if (existingNode) {
      return existingNode;
    }
    let newNode: NodeModel;
    if (vertex.source == graph.name) {
      newNode = vizGraph.createNode(vertex.type.name);
    } else {
      const vizSubGraph = vizSubGraphs.get(vertex.source);
      // Do note that we graphviz identify nodes by their name, so we can't just use the type name as
      // this would collapse the vertices from different subgraphs. So we include the source in the
      // name, even if it's not that useful graphically since we already group vertices by subgraphs.
      newNode = vizSubGraph.createNode(`${vertex.type.name}@${vertex.source}`);
    }
    state.setVertexState(vertex, newNode);
    return newNode;
  }
  const pickGraphForEdge = function (head: Vertex, tail: Vertex): GraphBaseModel {
    if (head.source == tail.source && head.source != graph.name) {
      return vizSubGraphs.get(head.source);
    }
    return vizGraph;
  }
  const state = new QueryGraphState<NodeModel, EdgeModel>(graph);
  const onEdge = function (edge: Edge): boolean {
    const head = edge.head;
    const tail = edge.tail;
    if (noTerminal && graph.isTerminal(tail)) {
      return false;
    }
    const headNode = getNode(head);
    const tailNode = getNode(tail);
    const attributes = {
      [attribute.label]: edge.label(),
    };
    state.setEdgeState(edge, pickGraphForEdge(head, tail).createEdge([headNode, tailNode], attributes));
    return true;
  }
  simpleTraversal(graph, _ => undefined, onEdge);
  return state;
}

function highlightPaths(state: QueryGraphState<NodeModel, EdgeModel>, toHighlights?: HighlitedPath[]) {
  toHighlights?.forEach(h => highlightPath(state, h));
}

function highlightPath(state: QueryGraphState<NodeModel, EdgeModel>, toHighlight: HighlitedPath) {
  traversePath(toHighlight.path, e => {
    for (const vAttrs of [state.getVertexState(e.head)?.attributes, state.getVertexState(e.tail)?.attributes ]) {
      vAttrs?.set(attribute.color, toHighlight.color);
      vAttrs?.set(attribute.fontcolor, toHighlight.color);
    }
    const eAttrs = state.getEdgeState(e)?.attributes;
    eAttrs?.set(attribute.color, toHighlight.color);
    eAttrs?.set(attribute.fontcolor, toHighlight.color);
  });
}
