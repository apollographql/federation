/**
 * Forked from graphql-js printSchema.ts file @ v16.0.0
 * This file has been modified to support printing subgraph
 * schema, including associated federation directives.
 */
import {
  GraphQLSchema,
  GraphQLNamedType,
  print,
  DefinitionNode,
} from 'graphql';
import { buildSubgraph, FEDERATION_UNNAMED_SUBGRAPH_NAME, graphQLJSNamedTypeToAST, graphQLJSSchemaToAST, printSchema } from '@apollo/federation-internals';

export function printSubgraphSchema(schema: GraphQLSchema): string {
  const ast = graphQLJSSchemaToAST(schema);
  const subgraph = buildSubgraph(FEDERATION_UNNAMED_SUBGRAPH_NAME, '', ast, false);
  return subgraph.toString();
}

export function printIntrospectionSchema(schema: GraphQLSchema): string {
  // Note(Sylvain): it's unclear to me what this method is meant for. It says that it prints an introspection
  // schema, but even the historical version in fed1 was printing directive applications for federation
  // directives, even though those wouldn't appear in an introspected schema.
  // So really, if we wanted to print what introspecting the schema would get us, then I believe that
  // simply calling the graphQL-js `printSchema` method on the input `schema` does just that and I'm
  // not sure why we have this, and we should probably deprecate it.
  //
  // In the meantime, we more or less continue to do what fed1 used to do here, that is we print with
  // directive applications and without skipping any directive definition (contrarily to
  // `printSubgraphSchema`).
  // Note in particular that we're not saying that the "behaviour" of this method is useless, there is
  // definitively something to be said for having an easy to print a full `GraphQLSchema` with directive
  // applications, which this does, but what we're saying is that the current name of the method doesn't
  // carries clearly that notion.
  const ast = graphQLJSSchemaToAST(schema);
  const subgraph = buildSubgraph(FEDERATION_UNNAMED_SUBGRAPH_NAME, '', ast, false);
  return printSchema(subgraph.schema);
}

export function printType(type: GraphQLNamedType): string {
  const { definition, extensions } = graphQLJSNamedTypeToAST(type);
  const defAst: DefinitionNode[] = definition ? [definition] : [];
  return defAst.concat(extensions).map((n) => print(n)).join('\n\n');
}

/**
 * Print a block string in the indented block form by adding a leading and
 * trailing blank line. However, if a block string starts with whitespace and is
 * a single-line, adding a leading blank line would strip that whitespace.
 */
export function printBlockString(
  value: string,
  preferMultipleLines: boolean = false,
): string {
  const isSingleLine = !value.includes('\n');
  const hasLeadingSpace = value[0] === ' ' || value[0] === '\t';
  const hasTrailingQuote = value[value.length - 1] === '"';
  const hasTrailingSlash = value[value.length - 1] === '\\';
  const printAsMultipleLines =
    !isSingleLine ||
    hasTrailingQuote ||
    hasTrailingSlash ||
    preferMultipleLines;

  let result = '';
  // Format a multi-line block quote to account for leading space.
  if (printAsMultipleLines && !(isSingleLine && hasLeadingSpace)) {
    result += '\n';
  }
  result += value;
  if (printAsMultipleLines) {
    result += '\n';
  }

  return '"""' + result.replace(/"""/g, '\\"""') + '"""';
}
