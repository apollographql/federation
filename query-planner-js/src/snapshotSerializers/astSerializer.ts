import { ASTNode, print } from 'graphql';
import { Config, NewPlugin, Refs } from 'pretty-format';
import { remapInlineFragmentNodes } from '../QueryPlan';

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
};
