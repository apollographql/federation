import { arrayEquals, assert, composeSets, copyWitNewLength, mergeMapOrNull, SelectionSet, setsEqual } from "@apollo/federation-internals";
import { OpGraphPath, OpTrigger, PathIterator, ContextAtUsageEntry } from "./graphPath";
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
  tree: PathTree<TTrigger, RV, TNullEdge>,
  contextToSelection: Set<string> | null,
  parameterToContext: Map<string, ContextAtUsageEntry> | null,
}

function findTriggerIdx<TTrigger, TElements>(
  triggerEquality: (t1: TTrigger, t2: TTrigger) => boolean,
  forIndex: [TTrigger, OpPathTree | null, TElements, Set<string> | null, Map<string, ContextAtUsageEntry> | null][] | [TTrigger, OpPathTree | null, TElements][],
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
    const forEdgeIndex: [TTrigger, OpPathTree | null, IterAndSelection<TTrigger, TNullEdge>[], Set<string> | null, Map<string, ContextAtUsageEntry> | null][][] = new Array(maxEdges + 1);
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
      const [edge, trigger, conditions, contextToSelection, parameterToContext] = iterResult.value;
      const idx = edge ? edge.index : maxEdges;
      if (edge) {
        newVertices[idx] = edge.tail;
      }
      const forIndex = forEdgeIndex[idx];
      if (forIndex) {
        const triggerIdx = findTriggerIdx(triggerEquality, forIndex, trigger);
        if (triggerIdx < 0) {
          forIndex.push([trigger, conditions, [ps], contextToSelection, parameterToContext]);
          totalChilds++;
        } else {
          const existing = forIndex[triggerIdx];
          const existingCond = existing[1];
          const mergedConditions = existingCond ? (conditions ? existingCond.mergeIfNotEqual(conditions) : existingCond) : conditions;
          const newPaths = existing[2];
          const mergedContextToSelection = composeSets(existing[3], contextToSelection);
          const mergedParameterToContext = mergeMapOrNull(existing[4], parameterToContext);
          newPaths.push(ps);
          forIndex[triggerIdx] = [trigger, mergedConditions, newPaths, mergedContextToSelection, mergedParameterToContext];
          // Note that as we merge, we don't create a new child
        }
      } else {
        // First time we see someone from that index; record the order
        order[currentOrder++] = idx;
        forEdgeIndex[idx] = [[trigger, conditions, [ps], contextToSelection, parameterToContext]];
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
      for (const [trigger, conditions, subPathAndSelections, contextToSelection, parameterToContext] of values) {
        childs[idx++] = {
          index,
          trigger,
          conditions,
          tree: this.createFromPaths(graph, triggerEquality, newVertex, subPathAndSelections),
          contextToSelection,
          parameterToContext,
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

  *childElements(reverseOrder: boolean = false): Generator<[Edge | TNullEdge, TTrigger, OpPathTree | null, PathTree<TTrigger, Vertex, TNullEdge>, Set<string> | null, Map<string, ContextAtUsageEntry> | null], void, undefined> {
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

  private element(i: number): [Edge | TNullEdge, TTrigger, OpPathTree | null, PathTree<TTrigger, Vertex, TNullEdge>, Set<string> | null, Map<string, ContextAtUsageEntry> | null] {
    const child = this.childs[i];
    return [
      (child.index === null ? null : this.graph.outEdge(this.vertex, child.index)) as Edge | TNullEdge,
      child.trigger,
      child.conditions,
      child.tree,
      child.contextToSelection,
      child.parameterToContext,
    ];
  }

  private mergeChilds(c1: Child<TTrigger, Vertex, TNullEdge>, c2: Child<TTrigger, Vertex, TNullEdge>): Child<TTrigger, Vertex, TNullEdge> {
    const cond1 = c1.conditions;
    const cond2 = c2.conditions;
    return {
      index: c1.index,
      trigger: c1.trigger,
      conditions: cond1 ? (cond2 ? cond1.mergeIfNotEqual(cond2) : cond1) : cond2,
      tree: c1.tree.merge(c2.tree),
      contextToSelection: composeSets(c1.contextToSelection, c2.contextToSelection),
      parameterToContext: mergeMapOrNull(c1.parameterToContext, c2.parameterToContext),
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
        && c1.tree.equalsSameRoot(c2.tree)
        && setsEqual(c1.contextToSelection, c2.contextToSelection)
        && PathTree.parameterToContextEquals(c1.parameterToContext, c2.parameterToContext)
    });    
  }

  private static parameterToContextEquals(ptc1: Map<string, ContextAtUsageEntry> | null, ptc2: Map<string, ContextAtUsageEntry> | null): boolean {
    const thisKeys = Array.from(ptc1?.keys() ?? []);
    const thatKeys = Array.from(ptc2?.keys() ?? []);
    
    if (thisKeys.length !== thatKeys.length) {
      return false; 
    }
    
    for (const key of thisKeys) {
      const thisSelection = ptc1!.get(key);
      const thatSelection = ptc2!.get(key);
      assert(thisSelection, () => `Expected to have a selection for key ${key}`);
      
      if (!thatSelection 
        || (thisSelection.contextId !== thatSelection.contextId) 
        || !arrayEquals(thisSelection.relativePath, thatSelection.relativePath) 
        || !thisSelection.selectionSet.equals(thatSelection.selectionSet) 
        || (thisSelection.subgraphArgType !== thatSelection.subgraphArgType)) {
        return false;
      }
    }
    return false;
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
