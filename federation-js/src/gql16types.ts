import { ASTNode } from 'graphql';

export type ASTVisitFn<TVisitedNode extends ASTNode> = (
  /** The current node being visiting. */
  node: TVisitedNode,
  /** The index or key to this node from the parent node or Array. */
  key: string | number | undefined,
  /** The parent immediately above this node, which may be an Array. */
  parent: ASTNode | ReadonlyArray<ASTNode> | undefined,
  /** The key path to get to this node from the root node. */
  path: ReadonlyArray<string | number>,
  /**
   * All nodes and Arrays visited before reaching parent of this node.
   * These correspond to array indices in `path`.
   * Note: ancestors includes arrays which contain the parent of visited node.
   */
  ancestors: ReadonlyArray<ASTNode | ReadonlyArray<ASTNode>>,
) => any;
