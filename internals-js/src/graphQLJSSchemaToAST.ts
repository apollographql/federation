import {
  DefinitionNode,
  DirectiveDefinitionNode,
  DocumentNode,
  GraphQLDirective,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLSchema,
  isIntrospectionType,
  isSpecifiedDirective,
  isSpecifiedScalarType,
  Kind,
  OperationTypeDefinitionNode,
  OperationTypeNode,
  parse,
  printSchema,
  printType,
  SchemaDefinitionNode,
  SchemaExtensionNode,
  TypeDefinitionNode,
  TypeExtensionNode
} from "graphql";
import { Maybe } from "graphql/jsutils/Maybe";
import { defaultRootName } from "./definitions";

const allOperationTypeNode = [ OperationTypeNode.QUERY, OperationTypeNode.MUTATION, OperationTypeNode.SUBSCRIPTION];

/**
 * Converts a graphql-js schema into an equivalent AST document.
 *
 * Note importantly that this method is not, in general, equivalent to `parse(printSchema(schema))` in that
 * the returned AST will contain directive _applications_ when those can be found in AST nodes linked by
 * the elements of the provided schema.
 */
export function graphQLJSSchemaToAST(schema: GraphQLSchema): DocumentNode {
  const types = Object.values(schema.getTypeMap()).filter((type) => !isIntrospectionType(type) && !isSpecifiedScalarType(type));
  const directives = schema.getDirectives().filter((directive) => !isSpecifiedDirective(directive));

  const schemaASTs = toNodeArray(graphQLJSSchemaToSchemaDefinitionAST(schema));
  const typesASTs = types.map((type) => toNodeArray(graphQLJSNamedTypeToAST(type))).flat();
  const directivesASTs = directives.map((directive) => graphQLJSDirectiveToAST(directive));

  return {
    kind: Kind.DOCUMENT,
    definitions: [...schemaASTs, ...typesASTs, ...directivesASTs],
  }
}

function toNodeArray<TDef extends DefinitionNode, TExt extends DefinitionNode>({
  definition,
  extensions,
}: {
  definition?: TDef,
  extensions: readonly TExt[]}
): readonly DefinitionNode[] {
  return definition ? [definition, ...extensions] : extensions;
}

function maybe<T>(v: Maybe<T>): T | undefined {
  return v ? v : undefined;
}

// Not exposing that one for now because it's a bit weirder API-wise (and take a `GraphqQLSchema` but only handle a specific subpart of it) .
function graphQLJSSchemaToSchemaDefinitionAST(schema: GraphQLSchema): { definition?: SchemaDefinitionNode, extensions: readonly SchemaExtensionNode[] } {
  if (schema.astNode || schema.extensionASTNodes.length > 0) {
    return {
      definition: maybe(schema.astNode),
      extensions: schema.extensionASTNodes,
    };
  } else {
    let definition: SchemaDefinitionNode | undefined = undefined;
    if (hasNonDefaultRootNames(schema)) {
      const operationTypes: OperationTypeDefinitionNode[] = [];
      for (const operation of allOperationTypeNode) {
        const type = schema.getRootType(operation);
        if (type) {
          operationTypes.push({
            kind: Kind.OPERATION_TYPE_DEFINITION,
            operation,
            type: { kind: Kind.NAMED_TYPE, name: { kind: Kind.NAME, value : type.name } },
          });
        }
      }
      definition = {
        kind: Kind.SCHEMA_DEFINITION,
        description: schema.description ? {
          kind: Kind.STRING,
          value: schema.description,
        } : undefined,
        operationTypes,
      }
    }
    return {
      definition,
      extensions: [],
    };
  }
}

function hasNonDefaultRootNames(schema: GraphQLSchema): boolean {
  return allOperationTypeNode.some((t) => isNonDefaultRootName(schema.getRootType(t), t));
}

function isNonDefaultRootName(type: Maybe<GraphQLObjectType>, operation: OperationTypeNode): boolean {
  return !!type && type.name !== defaultRootName(operation);
}

export function graphQLJSNamedTypeToAST(type: GraphQLNamedType): { definition?: TypeDefinitionNode, extensions: readonly TypeExtensionNode[] }  {
  if (type.astNode || type.extensionASTNodes.length > 0) {
    return {
      definition: maybe(type.astNode),
      extensions: type.extensionASTNodes,
    };
  } else {
    // While we could theoretically manually build the AST, it's just simpler to print the type and parse it back.
    return {
      definition: parse(printType(type)).definitions[0] as TypeDefinitionNode,
      extensions: [],
    };
  }
}

export function graphQLJSDirectiveToAST(directive: GraphQLDirective): DirectiveDefinitionNode {
  if (directive.astNode) {
    return directive.astNode;
  } else {
    // Note that the trick used for type of printing and parsing back is tad less convenient here because graphQL-js does not
    // expose a direct way to print a directive alone. So we work-around it by built-in a "fake" schema with essentially just
    // that directive.
    const fakeSchema = new GraphQLSchema({
      directives: [directive],
      assumeValid: true,
    });
    const reparsed = parse(printSchema(fakeSchema));
    return reparsed.definitions.find((def) => def.kind === Kind.DIRECTIVE_DEFINITION) as DirectiveDefinitionNode;
  }
}

