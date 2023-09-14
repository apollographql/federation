/* Functions used to output query graphs as [mermaid graphs](https://mermaid.js.org/syntax/flowchart.html). */

import { ObjectType } from "@apollo/federation-internals";
import { Edge, FEDERATED_GRAPH_ROOT_SOURCE, QueryGraph, Vertex, isFederatedGraphRootType, simpleTraversal } from "./querygraph";

export type MermaidOptions = {
  includeRootTypeLinks?: boolean,
}

export class MermaidGraph {
  private readonly before: string[] = [];
  private readonly after: string[] = [];
  private readonly subgraphs = new Map<string, string[]>();

  private isBuilt = false;

  constructor(
    private readonly graph: QueryGraph,
    private readonly options: MermaidOptions = {},
  ) {
    for (const name of graph.sources.keys()) {
      if (name === this.graph.name || name === FEDERATED_GRAPH_ROOT_SOURCE) {
        continue;
      }
      this.subgraphs.set(name, []);
    }
  }

  private subgraphName(vertex: Vertex): string | undefined {
    if (vertex.source === this.graph.name || vertex.source === FEDERATED_GRAPH_ROOT_SOURCE) {
      return undefined;
    }
    return vertex.source;
  }

  private vertexName(vertex: Vertex): string {
    if (isFederatedGraphRootType(vertex.type)) {
      return `root-${vertex.type.name.slice(1, vertex.type.name.length-1)}`;
    }
    const sg = this.subgraphName(vertex);
    const n = sg ? `${vertex.type.name}-${sg}` : `${vertex.type.name}`;
    return vertex.provideId ? `${n}-${vertex.provideId}` : n;
  }

  addVertex(vertex: Vertex): void {
    const sg = this.subgraphName(vertex);
    const addTo = sg ? this.subgraphs.get(sg)! : this.before;
    if (isFederatedGraphRootType(vertex.type)) {
      addTo.push(`${this.vertexName(vertex)}(["root(${vertex.type.name.slice(1, vertex.type.name.length)})"])`);
    } else {
      addTo.push(`${this.vertexName(vertex)}["${vertex.toString()}"]`);
    }
  }

  addEdge(edge: Edge): boolean {
    switch (edge.transition.kind) {
      case 'FieldCollection':
        if (edge.transition.definition.name.startsWith('_')) {
          return false;
        }
        break;
      case 'RootTypeResolution':
        if (!(this.options.includeRootTypeLinks ?? true)) {
          return false;
        }
        break;
      case 'SubgraphEnteringTransition':
        const rt = edge.tail.type as ObjectType;
        if (rt.fields().filter((f) => !f.name.startsWith('_')).length === 0) {
          return false;
        }
        break;
    }

    const head = this.vertexName(edge.head);
    const tail = this.vertexName(edge.tail);
    const addTo = edge.head.source !== this.graph.name && edge.head.source === edge.tail.source
      ? this.subgraphs.get(edge.head.source)!
      : this.after;
    const label = edge.label();
    if (label.length === 0) {
      addTo.push(`${head} --> ${tail}`);
    } else {
      addTo.push(`${head} -->|"${label}"| ${tail}`);
    }
    return true;
  }

  build(): void {
    if (this.isBuilt) {
      return;
    }

    simpleTraversal(
      this.graph,
      (v) => this.addVertex(v),
      (e) => this.addEdge(e),
    );

    this.isBuilt = true;
  }

  toString(): string {
    this.build();

    const final = [ 'flowchart TD' ];
    this.before.forEach((b) => final.push('  ' + b));
    for (const [name, data] of this.subgraphs.entries()) {
      final.push(`  subgraph ${name}`);
      data.forEach((d) => final.push('    ' + d));
      final.push('  end');
    }
    this.after.forEach((a) => final.push('  ' + a));
    return final.join('\n');
  }
}
