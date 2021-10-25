import { assert, copyWitNewLength } from "@apollo/core";
import { GraphPath, OpTrigger, PathIterator } from "./graphPath";
import { Edge, QueryGraph, RootVertex, isRootVertex, Vertex } from "./querygraph";
import { isPathContext } from "./pathContext";

function opTriggerEquality(t1: OpTrigger, t2: OpTrigger): boolean {
  if (t1 === t2) {
    return true;
  }
  if (isPathContext(t1)) {
    return isPathContext(t2) && t1.equals(t2);
  }
  if (isPathContext(t2)) {
    return false;
  }
  return t1.equals(t2);
}

type Child<TTrigger, RV extends Vertex, TNullEdge extends null | never> = {
  index: number | TNullEdge,
  trigger: TTrigger,
  conditions: OpPathTree | null,
  tree: PathTree<TTrigger, RV, TNullEdge>
}

export class PathTree<TTrigger, RV extends Vertex = Vertex, TNullEdge extends null | never = never> {
  private constructor(
    readonly graph: QueryGraph,
    readonly vertex: RV,
    private readonly triggerEquality: (t1: TTrigger, t2: TTrigger) => boolean,
    private readonly childs: Child<TTrigger, Vertex, TNullEdge>[],
  ) {
  }

  static create<TTrigger, RV extends Vertex = Vertex, TNullEdge extends null | never = never>(
    graph: QueryGraph,
    root: RV,
    triggerEquality: (t1: TTrigger, t2: TTrigger) => boolean
  ): PathTree<TTrigger, RV, TNullEdge> {
    return new PathTree(graph, root, triggerEquality, []);
  }

  static createOp<RV extends Vertex = Vertex>(graph: QueryGraph, root: RV): OpPathTree<RV> {
    return this.create(graph, root, opTriggerEquality);
  }

  childCount(): number {
    return this.childs.length;
  }

  isLeaf(): boolean {
    return this.childCount() === 0;
  }

  *childElements(reverseOrder: boolean = false): Generator<[Edge | TNullEdge, TTrigger, OpPathTree | null, PathTree<TTrigger, Vertex, TNullEdge>], void, undefined> {
    if (reverseOrder) {
      for (let i = this.childs.length - 1; i >= 0; i--) {
        yield this.element(i);
      }
    } else {
      for (let i = 0; i < this.childs.length; i++) {
        yield this.element(i);
      }
    }
  }

  private element(i: number): [Edge | TNullEdge, TTrigger, OpPathTree | null, PathTree<TTrigger, Vertex, TNullEdge>] {
    const child = this.childs[i];
    return [
      (child.index === null ? null : this.graph.outEdge(this.vertex, child.index)) as Edge | TNullEdge,
      child.trigger,
      child.conditions,
      child.tree
    ];
  }

  private mergeChilds(c1: Child<TTrigger, Vertex, TNullEdge>, c2: Child<TTrigger, Vertex, TNullEdge>): Child<TTrigger, Vertex, TNullEdge> {
    const cond1 = c1.conditions;
    const cond2 = c2.conditions;
    return {
      index: c1.index,
      trigger: c1.trigger,
      conditions: cond1 ? (cond2 ? cond1.merge(cond2) : cond1) : cond2,
      tree: c1.tree.merge(c2.tree)
    };
  }

  merge(other: PathTree<TTrigger, RV, TNullEdge>): PathTree<TTrigger, RV, TNullEdge> {
    // If we somehow end up trying to merge a tree with itself, let's not waste work on it.
    if (this === other) {
      return this;
    }

    assert(other.graph === this.graph, 'Cannot merge path tree build on another graph');
    assert(other.vertex.index === this.vertex.index, () => `Cannot merge path tree rooted at vertex ${other.vertex} into tree rooted at other vertex ${this.vertex}`);
    if (!other.childs.length) {
      return this;
    }
    if (!this.childs.length) {
      return other;
    }

    const mergeIndexes: number[] = new Array(other.childs.length);
    let countToAdd = 0;
    for (let i = 0; i < other.childs.length; i++) {
      const otherChild = other.childs[i];
      const idx = this.findIndex(otherChild.trigger, otherChild.index);
      mergeIndexes[i] = idx;
      if (idx < 0) {
        ++countToAdd;
      }
    }

    const thisSize = this.childs.length;
    const newSize = thisSize + countToAdd;
    const newChilds = copyWitNewLength(this.childs, newSize);
    for (let i = 0; i < other.childs.length; i++) {
      const idx = mergeIndexes[i];
      if (idx < 0) {
        newChilds[thisSize + i] = other.childs[i];
      } else {
        newChilds[idx] = this.mergeChilds(newChilds[idx], other.childs[i]);
      }
    }

    return new PathTree(this.graph, this.vertex, this.triggerEquality, newChilds);
  }

  // Like merge(), this create a new tree that contains the content of both `this` and `other` to this pathTree, but contrarily 
  // to merge() this never merge childs together, even if they are equal. This is only for the special case of mutations.
  concat(other: PathTree<TTrigger, RV, TNullEdge>): PathTree<TTrigger, RV, TNullEdge> {
    assert(other.graph === this.graph, 'Cannot concat path tree build on another graph');
    assert(other.vertex.index === this.vertex.index, () => `Cannot contat path tree rooted at vertex ${other.vertex} into tree rooted at other vertex ${this.vertex}`);
    if (!other.childs.length) {
      return this;
    }
    if (!this.childs.length) {
      return other;
    }
    const newChilds = this.childs.concat(other.childs);
    return new PathTree(this.graph, this.vertex, this.triggerEquality, newChilds);
  }

  mergePath(path: GraphPath<TTrigger, RV, TNullEdge>): PathTree<TTrigger, RV, TNullEdge> {
    assert(path.graph === this.graph, 'Cannot merge path build on another graph');
    assert(path.root.index === this.vertex.index, () => `Cannot merge path rooted at vertex ${path.root} into tree rooted at other vertex ${this.vertex}`);
    return this.mergePathInternal(path[Symbol.iterator]());
  }

  private childsFromPathElements(currentVertex: Vertex, elements: PathIterator<TTrigger, TNullEdge>): Child<TTrigger, Vertex, TNullEdge>[] {
    const iterResult = elements.next();
    if (iterResult.done) {
      return [];
    }

    const [edge, trigger, conditions] = iterResult.value;
    const edgeIndex = (edge ? edge.index : null) as number | TNullEdge;
    currentVertex = edge ? edge.tail : currentVertex;
    return [{
      index: edgeIndex,
      trigger: trigger,
      conditions: conditions,
      tree: new PathTree<TTrigger, Vertex, TNullEdge>(this.graph, currentVertex, this.triggerEquality, this.childsFromPathElements(currentVertex, elements))
    }];
  }

  private mergePathInternal(elements: PathIterator<TTrigger, TNullEdge>): PathTree<TTrigger, RV, TNullEdge> {
    const iterResult = elements.next();
    if (iterResult.done) {
      return this;
    }
    const [edge, trigger, conditions] = iterResult.value;
    assert(!edge || edge.head.index === this.vertex.index, () => `Next element head of ${edge} is not equal to current tree vertex ${this.vertex}`);
    const edgeIndex = (edge ? edge.index : null) as number | TNullEdge;
    const idx = this.findIndex(trigger, edgeIndex);
    if (idx < 0) {
      const currentVertex = edge ? edge.tail : this.vertex;
      return new PathTree<TTrigger, RV, TNullEdge>(
        this.graph,
        this.vertex,
        this.triggerEquality,
        this.childs.concat({
          index: edgeIndex,
          trigger: trigger,
          conditions: conditions,
          tree: new PathTree<TTrigger, Vertex, TNullEdge>(this.graph, currentVertex, this.triggerEquality, this.childsFromPathElements(currentVertex, elements))
        })
      );
    } else {
      const newChilds = this.childs.concat();
      const existing = newChilds[idx];
      newChilds[idx] = {
        index: existing.index,
        trigger: existing.trigger,
        conditions: conditions ? (existing.conditions ? existing.conditions.merge(conditions) : conditions) : existing.conditions,
        tree: existing.tree.mergePathInternal(elements)
      };
      return new PathTree<TTrigger, RV, TNullEdge>(this.graph, this.vertex, this.triggerEquality, newChilds);
    }
  }

  private findIndex(trigger: TTrigger, edgeIndex: number | TNullEdge): number {
    for (let i = 0; i < this.childs.length; i++) {
      const child = this.childs[i];
      if (child.index === edgeIndex && this.triggerEquality(child.trigger, trigger)) {
        return i;
      }
    }
    return -1;
  }

  isAllInSameSubgraph(): boolean {
    return this.isAllInSameSubgraphInternal(this.vertex.source);
  }

  private isAllInSameSubgraphInternal(target: string): boolean {
    return this.vertex.source === target
      && this.childs.every(c => c.tree.isAllInSameSubgraphInternal(target));
  }

  toString(indent: string = "", includeConditions: boolean = false): string {
    return this.toStringInternal(indent, includeConditions);
  }

  private toStringInternal(indent: string, includeConditions: boolean): string {
    if (this.isLeaf()) {
      return this.vertex.toString();
    }
    return this.vertex + ':\n' +
      this.childs.map(child =>
        indent
        + ` -> [${child.index}] `
        + (includeConditions && child.conditions ? `!! {\n${indent + "  "}${child.conditions!.toString(indent + "     ", true)}\n${indent} } ` : "")
        + `${child.trigger} = `
        + child.tree.toStringInternal(indent + "  ", includeConditions)
      ).join('\n');
  }
}

export type RootPathTree<TTrigger, TNullEdge extends null | never = never> = PathTree<TTrigger, RootVertex, TNullEdge>;

export type OpPathTree<RV extends Vertex = Vertex> = PathTree<OpTrigger, RV, null>;
export type OpRootPathTree = OpPathTree<RootVertex>;

export function isRootPathTree(tree: OpPathTree<any>): tree is OpRootPathTree {
  return isRootVertex(tree.vertex);
}

export function traversePathTree<TTrigger, RV extends Vertex = Vertex, TNullEdge extends null | never = never>(
  pathTree: PathTree<TTrigger, RV, TNullEdge>,
  onEdges: (edge: Edge) => void
) {
  for (const [edge, _, conditions, childTree] of pathTree.childElements()) {
    if (edge) {
      onEdges(edge);
    }
    if (conditions) {
      traversePathTree(conditions, onEdges);
    }
    traversePathTree(childTree, onEdges);
  }
}
