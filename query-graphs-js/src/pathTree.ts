import { assert, OperationElement } from "@apollo/core";
import { GraphPath } from "./graphPath";
import { Edge, QueryGraph, RootVertex, isRootVertex, Vertex } from "./querygraph";
import { PathContext, isPathContext } from "./pathContext";

export class PathTree<TTrigger, RV extends Vertex = Vertex, TNullEdge extends null | never = never> {
  private constructor(
    readonly graph: QueryGraph,
    readonly vertex: RV,
    private readonly triggerEquality: (t1: TTrigger, t2: TTrigger) => boolean,
    private readonly childs: PathTree<TTrigger, Vertex, TNullEdge>[],
    private readonly childsTrigger: TTrigger[],
    private readonly childsIndexes: (number | TNullEdge)[],
    private readonly childsConditions: (OpPathTree | null)[]
  ) {
  }

  static create<TTrigger, RV extends Vertex = Vertex, TNullEdge extends null | never = never>(
    graph: QueryGraph,
    root: RV,
    triggerEquality: (t1: TTrigger, t2: TTrigger) => boolean
  ): PathTree<TTrigger, RV, TNullEdge> {
    return new PathTree(graph, root, triggerEquality, [], [], [], []);
  }

  static createOp<RV extends Vertex = Vertex>(graph: QueryGraph, root: RV): OpPathTree<RV> {
    const opEquals = (op1: OperationElement | PathContext, op2: OperationElement | PathContext) => {
      if (op1 === op2) {
        return true;
      }
      if (isPathContext(op1)) {
        return isPathContext(op2) && op1.equals(op2);
      }
      if (isPathContext(op2)) {
        return false;
      }
      switch (op1.kind) {
        case 'Field': return op2.kind === 'Field' && op1.equals(op2);
        case 'FragmentElement': return op2.kind === 'FragmentElement' && op1.equals(op2);
      }
    };
    return this.create(graph, root, opEquals);
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
    return [
      this.edgeAt(i, this.vertex),
      this.childsTrigger[i],
      this.childsConditions[i],
      this.childs[i]
    ];
  }

  private edgeAt(index: number, v: Vertex): Edge | TNullEdge {
    const edgeIdx = this.childsIndexes[index];
    return (edgeIdx !== null ? this.graph.outEdge(v, edgeIdx) : null) as Edge | TNullEdge;
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
    // Note that in some cases we could save ourselves some duplications, when the set of trigger/index/conditions of one is completely
    // included in that of the other. That said, not sure it's worth the trouble (both in term of code complexity and on whether such
    // "optimization" would actually pay off in practice).
    const newChilds = [...this.childs];
    const newChildsTrigger = [...this.childsTrigger];
    const newChildsIndexes = [...this.childsIndexes];
    const newChildsConditions = [...this.childsConditions];
    for (let i = 0; i < other.childs.length; i++) {
      const idx = this.findIndex(other.childsTrigger[i], other.childsIndexes[i]);
      if (idx < 0) {
        newChilds.push(other.childs[i]);
        newChildsTrigger.push(other.childsTrigger[i]);
        newChildsIndexes.push(other.childsIndexes[i]);
        newChildsConditions.push(other.childsConditions[i]);
      } else {
        newChilds[idx] = newChilds[idx].merge(other.childs[i]);
        const otherConditions = other.childsConditions[i];
        if (otherConditions) {
          const existingConditions = newChildsConditions[idx];
          newChildsConditions[idx] = existingConditions ? existingConditions.merge(otherConditions) : otherConditions; 
        }
      }
    }

    return new PathTree(
      this.graph,
      this.vertex,
      this.triggerEquality,
      newChilds,
      newChildsTrigger,
      newChildsIndexes,
      newChildsConditions
    );
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
    // Note that in some cases we could save ourselves some duplications, when the set of trigger/index/conditions of one is completely
    // included in that of the other. That said, not sure it's worth the trouble (both in term of code complexity and on whether such
    // "optimization" would actually pay off in practice).
    const newChilds = this.childs.concat(other.childs);
    const newChildsTrigger = this.childsTrigger.concat(other.childsTrigger);
    const newChildsIndexes = this.childsIndexes.concat(other.childsIndexes);
    const newChildsConditions = this.childsConditions.concat(other.childsConditions);

    return new PathTree(
      this.graph,
      this.vertex,
      this.triggerEquality,
      newChilds,
      newChildsTrigger,
      newChildsIndexes,
      newChildsConditions
    );
  }

  mergePath(path: GraphPath<TTrigger, RV, TNullEdge>): PathTree<TTrigger, RV, TNullEdge> {
    assert(path.graph === this.graph, 'Cannot merge path build on another graph');
    assert(path.root.index === this.vertex.index, () => `Cannot merge path rooted at vertex ${path.root} into tree rooted at other vertex ${this.vertex}`);
    return this.mergePathInternal(path.elements());
  }

  private mergePathInternal(elements: Generator<[Edge | TNullEdge, TTrigger, OpPathTree | null], void, undefined>): PathTree<TTrigger, RV, TNullEdge> {
    const iterResult = elements.next();
    if (iterResult.done) {
      return this;
    }
    const [edge, trigger, conditions] = iterResult.value;
    assert(!edge || edge.head.index === this.vertex.index, () => `Next element head of ${edge} is not equal to current tree vertex ${this.vertex}`);
    const edgeIndex = (edge ? edge.index : null) as number | TNullEdge;
    const idx = this.findIndex(trigger, edgeIndex);
    if (idx < 0) {
      const empty = PathTree.create<TTrigger, Vertex, TNullEdge>(this.graph, edge ? edge.tail : this.vertex, this.triggerEquality);
      return new PathTree<TTrigger, RV, TNullEdge>(
        this.graph,
        this.vertex,
        this.triggerEquality,
        [...this.childs, empty.mergePathInternal(elements)],
        [...this.childsTrigger, trigger],
        [...this.childsIndexes, edgeIndex],
        [...this.childsConditions, conditions]
      );
    } else {
      // The child already exists, we just want to 1) merge the conditions if necessary and 2) continue merging downward.
      let newChildConditions = this.childsConditions;
      if (conditions) {
        newChildConditions = [...this.childsConditions];
        const existingConditions = newChildConditions[idx];
        newChildConditions[idx] = existingConditions ? existingConditions.merge(conditions) : conditions;
      }
      const newChilds = [...this.childs];
      newChilds[idx] = this.childs[idx].mergePathInternal(elements);
      return new PathTree<TTrigger, RV, TNullEdge>(
        this.graph,
        this.vertex,
        this.triggerEquality,
        newChilds,
        this.childsTrigger,
        this.childsIndexes,
        newChildConditions
      );
    }
  }

  private findIndex(trigger: TTrigger, edgeIndex: number | TNullEdge): number {
    for (let i = 0; i < this.childs.length; i++) {
      if (this.childsIndexes[i] === edgeIndex && this.triggerEquality(this.childsTrigger[i], trigger)) {
        return i;
      }
    }
    return -1;
  }

  toPaths(): GraphPath<TTrigger, RV, TNullEdge>[] {
    return this.toPathsInternal([ GraphPath.create(this.graph, this.vertex) ]);
  }

  isAllInSameSubgraph(): boolean {
    return this.isAllInSameSubgraphInternal(this.vertex.source);
  }

  private isAllInSameSubgraphInternal(target: string): boolean {
    return this.vertex.source === target && this.childs.every(c => c.isAllInSameSubgraphInternal(target));
  }

  private toPathsInternal<V extends Vertex>(parentPaths: GraphPath<TTrigger, V, TNullEdge>[]): GraphPath<TTrigger, V, TNullEdge>[] {
    if (this.isLeaf()) {
      return parentPaths;
    }
    return this.childs.flatMap((child, i) => 
      child.toPathsInternal(parentPaths.map(path => path.add(this.childsTrigger[i], this.edgeAt(i, this.vertex), this.childsConditions[i] ?? undefined)))
    );
  }

  toString(indent: string = "", includeConditions: boolean = false): string {
    return this.toStringInternal(indent, includeConditions);
  }

  private toStringInternal(indent: string, includeConditions: boolean): string {
    if (this.isLeaf()) {
      return this.vertex.toString();
    }
    return this.vertex + ':\n' + 
      this.childs.map((child, i) => 
        indent
        + ` -> [${this.childsIndexes[i]}] `
        + (includeConditions && this.childsConditions[i] ? `!! {\n${indent + "  "}${this.childsConditions[i]!.toString(indent + "     ", true)}\n${indent} } ` : "")
        + `${this.childsTrigger[i]} = `
        + child.toStringInternal(indent + "  ", includeConditions)
      ).join('\n');
  }
}

export type RootPathTree<TTrigger, TNullEdge extends null | never = never> = PathTree<TTrigger, RootVertex, TNullEdge>;

export type OpPathTree<RV extends Vertex = Vertex> = PathTree<OperationElement | PathContext, RV, null>;
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
