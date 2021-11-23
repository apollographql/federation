import { print, SelectionNode, isSelectionNode } from 'graphql';
import { NewPlugin } from 'pretty-format';

export default {
  test(value: any) {
    return (
      Array.isArray(value) && value.length > 0 && value.every(isSelectionNode)
    );
  },
  serialize(selectionNodes: SelectionNode[]): string {
    return selectionNodes.map((node) => print(node)).join('\n');
  },
} as NewPlugin;
