import { QueryPlanInlineFragmentNode, QueryPlanSelectionNode } from '../';
import { ASTNode, Kind, print, SelectionNode as GraphQLJSSelectionNode, visit } from 'graphql';
import { Config, NewPlugin, Refs } from 'pretty-format';

export default {
  test(value: any) {
    // Note that this isn't a reliable test because other objects may also have a `kind` property
    // (like query plans!).
    // `graphql-js` does have an unexported `isNode` function, but that currently performs the same check
    // and doesn't check whether `kind` represents a valid AST node either:
    // https://github.com/graphql/graphql-js/blob/998bea680d6e11e1c055a400a887a9539de08f75/src/language/ast.js#L135-L137
    // Perhaps we should attempt to contribute an improved `isNode` function.
    return value && typeof value.kind === 'string';
  },

  serialize(
    value: ASTNode,
    config: Config,
    indentation: string,
    _depth: number,
    _refs: Refs,
    _printer: any,
  ): string {
    const lines = print(remapInlineFragmentNodes(value)).trim().split('\n');

    // Avoid adding newlines for single line results.
    if (lines.length === 0) {
      return '';
    } else if (lines.length === 1) {
      return lines[0];
    }

    return lines.map(line => {
      // We re-indent the lines printed from `graphql-js` to respect the passed in `indentation`
      // and`config.indent` values.
      // This is important because Jest has started to ignore indentation when diffing snapshots,
      // and it does this by invoking snapshot serializers with these values set to 0.
      // Without re-indenting, every line printed from `graphql-js` would be shown as changed.
      // See https://github.com/facebook/jest/pull/9203
      const indentationLength = getIndentationLength(line);
      const dedentedLine = line.slice(indentationLength);
      // `graphql-js` always indents with 2 spaces
      const indentationDepth = indentationLength / 2;

      return indentation + config.indent.repeat(indentationDepth) + dedentedLine;
    }).join(config.spacingOuter);
  },
} as NewPlugin;

// From https://github.com/facebook/jest/blob/32aaff83f02c347ccd591727544002490fb4ee9a/packages/jest-snapshot/src/dedentLines.ts#L8
function getIndentationLength(line: string): number {
  const result = /^( {2})+/.exec(line);
  return result === null ? 0 : result[0].length;
}

/**
 * This function converts potential InlineFragmentNodes that WE created
 * (defined in ../QueryPlan, not graphql-js) to GraphQL-js compliant AST nodes
 * for the graphql-js printer to work with
 *
 * The arg type here SHOULD be (node: AstNode | SelectionNode (from ../QueryPlan)),
 * but that breaks the graphql-js visitor, as it won't allow our redefined
 * SelectionNode to be passed in.
 *
 * Since our SelectionNode still has a `kind`, this will still functionally work
 * at runtime to call the InlineFragment visitor defined below
 *
 * We have to cast the `fragmentNode as unknown` and then to an InlineFragmentNode
 * at the bottom though, since there's no way to cast it appropriately to an
 * `InlineFragmentNode` as defined in ../QueryPlan.ts. TypeScript will complain
 * about there not being overlapping fields
 */
export function remapInlineFragmentNodes(node: ASTNode): ASTNode {
  return visit(node, {
    InlineFragment: (fragmentNode) => {
      // if the fragmentNode is already a proper graphql AST Node, return it
      if (fragmentNode.selectionSet) return fragmentNode;

      /**
       * Since the above check wasn't hit, we _know_ that fragmentNode is an
       * InlineFragmentNode from ../QueryPlan, but we can't actually type that
       * without causing ourselves a lot of headache, so we cast to unknown and
       * then to InlineFragmentNode (from ../QueryPlan) below
       */

      // if the fragmentNode is a QueryPlan InlineFragmentNode, convert it to graphql-js node
      return {
        kind: Kind.INLINE_FRAGMENT,
        typeCondition: fragmentNode.typeCondition
          ? {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: fragmentNode.typeCondition,
              },
            }
          : undefined,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          // we have to recursively rebuild the selectionSet using selections
          selections: remapSelections(
            ((fragmentNode as unknown) as QueryPlanInlineFragmentNode).selections,
          ),
        },
      };
    },
  });
}

function remapSelections(
  selections: QueryPlanSelectionNode[],
): readonly GraphQLJSSelectionNode[] {
  return selections.map((selection) => {
    switch (selection.kind) {
      case 'Field':
        return {
          kind: Kind.FIELD,
          name: {
            kind: Kind.NAME,
            value: selection.name,
          },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: remapSelections(selection.selections || []),
          },
        };
      case 'InlineFragment':
        return {
          kind: Kind.INLINE_FRAGMENT,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: remapSelections(selection.selections || []),
          },
          typeCondition: selection.typeCondition
            ? {
                kind: Kind.NAMED_TYPE,
                name: {
                  kind: Kind.NAME,
                  value: selection.typeCondition,
                },
              }
            : undefined,
        };
    }
  });
}
