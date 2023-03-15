import { arrayEquals, assert, copyWitNewLength, SelectionSet } from "@apollo/federation-internals";
import { GraphPath, OpGraphPath, OpTrigger, PathIterator } from "./graphPath";
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

function findTriggerIdx<TTrigger, TElements>(
  triggerEquality: (t1: TTrigger, t2: TTrigger) => boolean,
  forIndex: [TTrigger, OpPathTree | null, TElements][],
  trigger: TTrigger
): number {
  for (let i = 0; i < forIndex.length; i++) {
    if (triggerEquality(forIndex[i][0], trigger)) {
      return i;
    }
  }
  return -1;
}

type IterAndSelection<TTrigger, TNullEdge extends null | never> = { 
  path: PathIterator<TTrigger, TNullEdge>,
  selection?: SelectionSet,
}

export class PathTree<TTrigger, RV extends Vertex = Vertex, TNullEdge extends null | never = never> {
  private constructor(
    readonly graph: QueryGraph,
    readonly vertex: RV,
    readonly localSelections: readonly SelectionSet[] | undefined,
    private readonly triggerEquality: (t1: TTrigger, t2: TTrigger) => boolean,
    private readonly childs: Child<TTrigger, Vertex, TNullEdge>[],
  ) {
  }

  static create<TTrigger, RV extends Vertex = Vertex, TNullEdge extends null | never = never>(
    graph: QueryGraph,
    root: RV,
    triggerEquality: (t1: TTrigger, t2: TTrigger) => boolean
  ): PathTree<TTrigger, RV, TNullEdge> {
    return new PathTree(graph, root, undefined, triggerEquality, []);
  }

  static createOp<RV extends Vertex = Vertex>(graph: QueryGraph, root: RV): OpPathTree<RV> {
    return this.create(graph, root, opTriggerEquality);
  }

  static createFromOpPaths<RV extends Vertex = Vertex>(
    graph: QueryGraph,
    root: RV,
    paths: { path: OpGraphPath<RV>, selection?: SelectionSet }[]
  ): OpPathTree<RV> {
    assert(paths.length > 0, `Should compute on empty paths`);

    return this.createFromPaths(
      graph,
      opTriggerEquality,
      root,
      paths.map(({path, selection}) => ({ path: path[Symbol.iterator](), selection }))
    );
  }

  private static createFromPaths<TTrigger, RV extends Vertex = Vertex, TNullEdge extends null | never = never>(
    graph: QueryGraph,
    triggerEquality: (t1: TTrigger, t2: TTrigger) => boolean,
    currentVertex: RV,
    pathAndSelections: IterAndSelection<TTrigger, TNullEdge>[]
  ): PathTree<TTrigger, RV, TNullEdge> {
    const maxEdges = graph.outEdgesCount(currentVertex);
    // We store 'null' edges at `maxEdges` index
    const forEdgeIndex: [TTrigger, OpPathTree | null, IterAndSelection<TTrigger, TNullEdge>[]][][] = new Array(maxEdges + 1);
    const newVertices: Vertex[] = new Array(maxEdges);
    const order: number[] = new Array(maxEdges + 1);
    let currentOrder = 0;
    let totalChilds = 0;
    let localSelections: SelectionSet[] | undefined = undefined;
    for (const ps of pathAndSelections) {
      const iterResult = ps.path.next();
      if (iterResult.done) {
        if (ps.selection) {
          localSelections = localSelections ? localSelections.concat(ps.selection) : [ps.selection];
        }
        continue;
      }
      const [edge, trigger, conditions] = iterResult.value;
      const idx = edge ? edge.index : maxEdges;
      if (edge) {
        newVertices[idx] = edge.tail;
      }
      const forIndex = forEdgeIndex[idx];
      if (forIndex) {
        const triggerIdx = findTriggerIdx(triggerEquality, forIndex, trigger);
        if (triggerIdx < 0) {
          forIndex.push([trigger, conditions, [ps]]);
          totalChilds++;
        } else {
          const existing = forIndex[triggerIdx];
          const existingCond = existing[1];
          const mergedConditions = existingCond ? (conditions ? existingCond.mergeIfNotEqual(conditions) : existingCond) : conditions;
          const newPaths = existing[2];
          newPaths.push(ps);
          forIndex[triggerIdx] = [trigger, mergedConditions, newPaths];
          // Note that as we merge, we don't create a new child
        }
      } else {
        // First time we see someone from that index; record the order
        order[currentOrder++] = idx;
        forEdgeIndex[idx] = [[trigger, conditions, [ps]]];
        totalChilds++;
      }
    }

    const childs: Child<TTrigger, Vertex, TNullEdge>[] = new Array(totalChilds);
    let idx = 0;
    for (let i = 0; i < currentOrder; i++) {
      const edgeIndex = order[i];
      const index = (edgeIndex === maxEdges ? null : edgeIndex) as number | TNullEdge;
      const newVertex = index === null ? currentVertex : newVertices[edgeIndex];
      const values = forEdgeIndex[edgeIndex];
      for (const [trigger, conditions, subPathAndSelections] of values) {
        childs[idx++] = {
          index,
          trigger,
          conditions,
          tree: this.createFromPaths(graph, triggerEquality, newVertex, subPathAndSelections)
        };
      }
    }
    assert(idx === totalChilds, () => `Expected to have ${totalChilds} childs but only ${idx} added`);
    return new PathTree<TTrigger, RV, TNullEdge>(graph, currentVertex, localSelections, triggerEquality, childs);
  }

  // Assumes all root are rooted on the same vertex
  static mergeAllOpTrees<RV extends Vertex = Vertex>(graph: QueryGraph, root: RV, trees: OpPathTree<RV>[]): OpPathTree<RV> {
    return this.mergeAllTreesInternal(graph, opTriggerEquality, root, trees);
  }

  private static mergeAllTreesInternal<TTrigger, RV extends Vertex, TNullEdge extends null | never>(
    graph: QueryGraph,
    triggerEquality: (t1: TTrigger, t2: TTrigger) => boolean,
    currentVertex: RV,
    trees: PathTree<TTrigger, RV, TNullEdge>[]
  ): PathTree<TTrigger, RV, TNullEdge> {
    const maxEdges = graph.outEdgesCount(currentVertex);
    // We store 'null' edges at `maxEdges` index
    const forEdgeIndex: [TTrigger, OpPathTree | null, PathTree<TTrigger, Vertex, TNullEdge>[]][][] = new Array(maxEdges + 1);
    const newVertices: Vertex[] = new Array(maxEdges);
    const order: number[] = new Array(maxEdges + 1);
    let localSelections: readonly SelectionSet[] | undefined = undefined;
    let currentOrder = 0;
    let totalChilds = 0;
    for (const tree of trees) {
      if (tree.localSelections) {
        if (localSelections) {
          localSelections = localSelections.concat(tree.localSelections);
        } else {
          localSelections = tree.localSelections;
        }
      }

      for (const child of tree.childs) {
        const idx = child.index === null ? maxEdges : child.index;
        if (!newVertices[idx]) {
          newVertices[idx] = child.tree.vertex;
        }
        const forIndex = forEdgeIndex[idx];
        if (forIndex) {
          const triggerIdx = findTriggerIdx(triggerEquality, forIndex, child.trigger);
          if (triggerIdx < 0) {
            forIndex.push([child.trigger, child.conditions, [child.tree]]);
            totalChilds++;
          } else {
            const existing = forIndex[triggerIdx];
            const existingCond = existing[1];
            const mergedConditions = existingCond ? (child.conditions ? existingCond.mergeIfNotEqual(child.conditions) : existingCond) : child.conditions;
            const newTrees = existing[2];
            newTrees.push(child.tree);
            forIndex[triggerIdx] = [child.trigger, mergedConditions, newTrees];
            // Note that as we merge, we don't create a new child
          }
        } else {
          // First time we see someone from that index; record the order
          order[currentOrder++] = idx;
          forEdgeIndex[idx] = [[child.trigger, child.conditions, [child.tree]]];
          totalChilds++;
        }
      }
    }

    const childs: Child<TTrigger, Vertex, TNullEdge>[] = new Array(totalChilds);
    let idx = 0;
    for (let i = 0; i < currentOrder; i++) {
      const edgeIndex = order[i];
      const index = (edgeIndex === maxEdges ? null : edgeIndex) as number | TNullEdge;
      const newVertex = index === null ? currentVertex : newVertices[edgeIndex];
      const values = forEdgeIndex[edgeIndex];
      for (const [trigger, conditions, subTrees] of values) {
        childs[idx++] = {
          index,
          trigger,
          conditions,
          tree: this.mergeAllTreesInternal(graph, triggerEquality, newVertex, subTrees)
        };
      }
    }
    assert(idx === totalChilds, () => `Expected to have ${totalChilds} childs but only ${idx} added`);
    return new PathTree<TTrigger, RV, TNullEdge>(graph, currentVertex, localSelections, triggerEquality, childs);
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
      conditions: cond1 ? (cond2 ? cond1.mergeIfNotEqual(cond2) : cond1) : cond2,
      tree: c1.tree.merge(c2.tree)
    };
  }

  mergeIfNotEqual(other: PathTree<TTrigger, RV, TNullEdge>): PathTree<TTrigger, RV, TNullEdge> {
    if (this.equalsSameRoot(other)) {
      return this;
    }
    return this.merge(other);
  }

  private mergeLocalSelectionsWith(other: PathTree<TTrigger, RV, TNullEdge>): readonly SelectionSet[] | undefined {
    return this.localSelections
      ? (other.localSelections ? this.localSelections.concat(other.localSelections) : this.localSelections)
      : other.localSelections;
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

    const localSelections = this.mergeLocalSelectionsWith(other);

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
    let addIdx = thisSize;
    for (let i = 0; i < other.childs.length; i++) {
      const idx = mergeIndexes[i];
      if (idx < 0) {
        newChilds[addIdx++] = other.childs[i];
      } else {
        newChilds[idx] = this.mergeChilds(newChilds[idx], other.childs[i]);
      }
    }
    assert(addIdx === newSize, () => `Expected ${newSize} childs but only got ${addIdx}`);

    return new PathTree(this.graph, this.vertex, localSelections, this.triggerEquality, newChilds);
  }

  private equalsSameRoot(that: PathTree<TTrigger, RV, TNullEdge>): boolean {
    if (this === that) {
      return true;
    }

    // Note that we use '===' for trigger instead of `triggerEquality`: this method is all about avoid unnecessary merging
    // when we suspect conditions trees have been build from the exact same inputs and `===` is faster and good enough for this.
    return arrayEquals(this.childs, that.childs, (c1, c2) => {
      return c1.index === c2.index
        && c1.trigger === c2.trigger
        && (c1.conditions ? (c2.conditions ? c1.conditions.equalsSameRoot(c2.conditions) : false) : !c2.conditions)
        && c1.tree.equalsSameRoot(c2.tree);
    });
  }

  // Like merge(), this create a new tree that contains the content of both `this` and `other` to this pathTree, but contrarily
  // to merge() this never merge childs together, even if they are equal. This is only for the special case of mutations.
  concat(other: PathTree<TTrigger, RV, TNullEdge>): PathTree<TTrigger, RV, TNullEdge> {
    assert(other.graph === this.graph, 'Cannot concat path tree build on another graph');
    assert(other.vertex.index === this.vertex.index, () => `Cannot concat path tree rooted at vertex ${other.vertex} into tree rooted at other vertex ${this.vertex}`);
    if (!other.childs.length) {
      return this;
    }
    if (!this.childs.length) {
      return other;
    }

    const localSelections = this.mergeLocalSelectionsWith(other);
    const newChilds = this.childs.concat(other.childs);
    return new PathTree(this.graph, this.vertex, localSelections, this.triggerEquality, newChilds);
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
      tree: new PathTree<TTrigger, Vertex, TNullEdge>(this.graph, currentVertex, undefined, this.triggerEquality, this.childsFromPathElements(currentVertex, elements))
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
        undefined,
        this.triggerEquality,
        this.childs.concat({
          index: edgeIndex,
          trigger: trigger,
          conditions: conditions,
          tree: new PathTree<TTrigger, Vertex, TNullEdge>(this.graph, currentVertex, undefined, this.triggerEquality, this.childsFromPathElements(currentVertex, elements))
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
      return new PathTree<TTrigger, RV, TNullEdge>(this.graph, this.vertex, undefined, this.triggerEquality, newChilds);
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
