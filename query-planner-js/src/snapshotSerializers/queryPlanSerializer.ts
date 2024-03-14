import { Config, Plugin, Refs } from 'pretty-format';
import { DeferredNode, PlanNode, QueryPlan, SubscriptionNode } from '../';
import { parse, Kind, visit, DocumentNode } from 'graphql';

export default {
  test(value: any) {
    return value && value.kind === 'QueryPlan';
  },

  serialize(
    queryPlan: QueryPlan,
    config: Config,
    indentation: string,
    depth: number,
    refs: Refs,
    printer: any,
  ): string {
    return (
      'QueryPlan {' +
      printNodes(
        queryPlan.node ? [queryPlan.node] : undefined,
        config,
        indentation,
        depth,
        refs,
        printer,
      ) +
      '}'
    );
  },
} as Plugin;

function printNode(
  node: PlanNode | SubscriptionNode,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: any,
): string {
  let result = '';

  const indentationNext = indentation + config.indent;

  const printOperation = (operationString: string, indent: string) =>
    printer(
      flattenEntitiesField(parse(operationString)),
      config,
      indent,
      depth,
      refs,
      printer,
    );

  switch (node.kind) {
    case 'Fetch':
      const idStr = node.id ? `, id: ${node.id}` : '';
      result +=
        `${node.kind}(service: "${node.serviceName}"${idStr})` +
        ' {' +
        config.spacingOuter +
        (node.requires
          ? printer(
              // this is an array of selections, so we need to make it a proper
              // selectionSet so we can print it
              { kind: Kind.SELECTION_SET, selections: node.requires },
              config,
              indentationNext,
              depth,
              refs,
              printer,
            ) +
            ' =>' +
            config.spacingOuter
          : '') +
        printOperation(node.operation, indentationNext) +
        config.spacingOuter +
        indentation +
        '}';
      break;
    case 'Flatten':
      result += `Flatten(path: "${node.path.join('.')}")`;
      break;
    case 'Defer':
      const primary = node.primary;
      const indentationInner = indentationNext + config.indent;
      result +=
        'Defer {' + config.spacingOuter +
        indentationNext + `Primary {` + config.spacingOuter +
        (primary.subselection ? printOperation(primary.subselection, indentationInner): indentationInner) + ':' + config.spacingOuter +
        (primary.node ? (indentationInner + printNode(primary.node, config, indentationInner, depth, refs, printer) + config.spacingOuter) : '') +
        indentationNext + '}, [' +
        printDeferredNodes(node.deferred, config, indentationNext, depth, refs, printer) +
        ']' + config.spacingOuter +
        indentation + '}';
      break;
    case 'Condition':
      if (node.ifClause) {
        const indentationInner = indentationNext + config.indent;
        if (node.elseClause) {
          result +=
            `Condition(if: \$${node.condition}) {` + config.spacingOuter +
            indentationNext + `Then {` + config.spacingOuter +
            indentationInner + printNode(node.ifClause, config, indentationInner, depth, refs, printer) + config.spacingOuter +
            indentationNext + `} Else {` + config.spacingOuter +
            indentationInner + printNode(node.elseClause, config, indentationInner, depth, refs, printer) + config.spacingOuter +
            indentationNext + `}` + config.spacingOuter +
            indentation + '}'
        } else {
          result +=
            `Include(if: \$${node.condition}) {` + config.spacingOuter +
            indentationNext + printNode(node.ifClause, config, indentationNext, depth, refs, printer) + config.spacingOuter +
            indentation + '}'
        }
      } else {
        result +=
          `Skip(if: \$${node.condition}) {` + config.spacingOuter +
          indentationNext + printNode(node.elseClause!, config, indentationNext, depth, refs, printer) + config.spacingOuter +
          indentation + '}'
      }
      break;
    case 'Subscription': {
      const primary = node.primary;
      const rest = node.rest;
      const indentationInner = indentationNext + config.indent;
      result += 'Subscription {'
        + config.spacingOuter + indentationNext + 'Primary: {' + config.spacingOuter + indentationInner + printNode(primary, config, indentationInner, depth, refs, printer)
        + config.spacingOuter + indentationNext + '},'
        + (rest ? (config.spacingOuter + indentationNext + 'Rest: {' + config.spacingOuter + indentationInner + printNode(rest, config, indentationInner, depth, refs, printer)) : '')
        + config.spacingOuter + indentationNext + '}'
        + config.spacingOuter + config.indent + '}'; // TODO: Is this right?
        break;
    }
    default:
      result += node.kind;
  }

  const nodes =
    'nodes' in node ? node.nodes : 'node' in node ? [node.node] : [];

  if (nodes.length > 0) {
    result +=
      ' {' + printNodes(nodes, config, indentation, depth, refs, printer) + '}';
  }

  return result;
}

function printNodes(
  nodes: (SubscriptionNode | PlanNode)[] | undefined,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: any,
): string {
  let result = '';

  if (nodes && nodes.length > 0) {
    result += config.spacingOuter;

    const indentationNext = indentation + config.indent;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;

      result +=
        indentationNext +
        printNode(node, config, indentationNext, depth, refs, printer);

      if (i < nodes.length - 1) {
        result += ',' + config.spacingInner;
      } else if (!config.min) {
        result += ',';
      }
    }

    result += config.spacingOuter + indentation;
  }

  return result;
}

function printDeferredNodes(
  nodes: DeferredNode[],
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: any,
): string {
  let result = config.spacingOuter;

  const indentationNext = indentation + config.indent;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;

    result +=
      indentationNext +
      printDeferredNode(node, config, indentationNext, depth, refs, printer);

    if (i < nodes.length - 1) {
      result += ',' + config.spacingInner;
    } else if (!config.min) {
      result += ',';
    }
  }
  result += config.spacingOuter + indentation;

  return result;
}

function printDeferredNode(
  node: DeferredNode,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: any,
): string {
  const printOperation = (operationString: string) =>
    printer(
      flattenEntitiesField(parse(operationString)),
      config,
      indentationNext,
      depth,
      refs,
      printer,
    );

  const indentationNext = indentation + config.indent;
  const dependsStr = node.depends.map(({id, deferLabel}) => id + (deferLabel ? (`:"${deferLabel}"`) : '')).join(', ');
  const pathStr = node.queryPath.join('/');
  const labelStr = node.label ? `, label: "${node.label}"` : '';
  let result = `Deferred(depends: [${dependsStr}], path: "${pathStr}"${labelStr}) {`;
  if (node.subselection) {
    result += config.spacingOuter + printOperation(node.subselection) + ':';
  }
  if (node.node) {
    result += config.spacingOuter + indentationNext + printNode(node.node, config, indentationNext, depth, refs, printer);
  }
  result += config.spacingOuter + indentation + '}';
  return result;
}

/**
 * when we serialize a query plan, we want to serialize the operation, but not
 * show the root level `query` definition or the `_entities` call. This function
 * flattens those nodes to only show their selectionSets
 */
function flattenEntitiesField(node: DocumentNode) {
  return visit(node, {
    OperationDefinition: ({ operation, selectionSet }) => {
      const firstSelection = selectionSet.selections[0];
      if (
        operation === 'query' &&
        firstSelection.kind === Kind.FIELD &&
        firstSelection.name.value === '_entities'
      ) {
        return firstSelection.selectionSet;
      }
      // we don't want to print the `query { }` definition either for query plan printing
      return selectionSet;
    },
  });
}
