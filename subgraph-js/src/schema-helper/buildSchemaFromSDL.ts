import Schema, { byKind, byName, err, LinkUrl, flat, only, toDefinitionKind, report, maybe, isAst, GRef, hasName } from '@apollo/core-schema';
import { hasRef } from '@apollo/core-schema/dist/de';
import { ASTNode, DefinitionNode, DocumentNode, GraphQLEnumType, GraphQLEnumValueConfig, GraphQLSchema, isAbstractType, isEnumType, isObjectType, isScalarType, Kind, NamedTypeNode, OperationTypeNode, StringValueNode, visit } from 'graphql';
import { ATLAS,  FEDERATION_URLS,  FEDERATION_V2_0,  SUBGRAPH_BASE } from '../federation-atlas';
import { GraphQLResolverMap, GraphQLSchemaModule } from './resolverMap';

export function ErrTooManyFederations(versions: Readonly<Map<LinkUrl, ASTNode[]>>) {
  return err('TooManyFederations', {
    message: `schema should link against one version of federation, ${versions.size} versions found`,
    versions: [...versions.keys()],
    nodes: [...flat(versions.values())]
  })
}

export function modulesFromSDL(
  modulesOrSDL: (GraphQLSchemaModule | DocumentNode)[] | DocumentNode
): GraphQLSchemaModule[] {
  if (Array.isArray(modulesOrSDL)) {
    return modulesOrSDL.map(moduleOrSDL => {
      if (isAst(moduleOrSDL, Kind.DOCUMENT)) {
        return { typeDefs: moduleOrSDL };
      } else {
        return moduleOrSDL;
      }
    });
  } else {
    return [{ typeDefs: modulesOrSDL }];
  }
}

export function addResolversToSchema(
  schema: GraphQLSchema,
  resolvers: GraphQLResolverMap<any>
) {
  for (const [typeName, fieldConfigs] of Object.entries(resolvers)) {
    const type = schema.getType(typeName);

    if (isAbstractType(type)) {
      for (const [fieldName, fieldConfig] of Object.entries(fieldConfigs)) {
        if (fieldName.startsWith("__")) {
          (type as any)[fieldName.substring(2)] = fieldConfig;
        }
      }
    }

    if (isScalarType(type)) {
      for (const fn in fieldConfigs) {
        (type as any)[fn] = (fieldConfigs as any)[fn];
      }
    }

    if (isEnumType(type)) {
      const values = type.getValues();
      const newValues: { [key: string]: GraphQLEnumValueConfig } = {};
      values.forEach(value => {
        let newValue = (fieldConfigs as any)[value.name];
        if (newValue === undefined) {
          newValue = value.name;
        }

        newValues[value.name] = {
          value: newValue,
          deprecationReason: value.deprecationReason,
          description: value.description,
          astNode: value.astNode,
          extensions: undefined
        };
      });

      // In place updating hack to get around pulling in the full
      // schema walking and immutable updating machinery from graphql-tools
      Object.assign(
        type,
        new GraphQLEnumType({
          ...type.toConfig(),
          values: newValues
        })
      );
    }

    if (!isObjectType(type)) continue;

    const fieldMap = type.getFields();

    for (const [fieldName, fieldConfig] of Object.entries(fieldConfigs)) {
      if (fieldName.startsWith("__")) {
        (type as any)[fieldName.substring(2)] = fieldConfig;
        continue;
      }

      const field = fieldMap[fieldName];
      if (!field) continue;

      if (typeof fieldConfig === "function") {
        field.resolve = fieldConfig;
      } else {
        field.resolve = fieldConfig.resolve;
      }
    }
  }
}

export function subgraphCore(document: DocumentNode): DocumentNode {
  const schema = Schema.from(document, SUBGRAPH_BASE)
  let output = (linksFed2(schema) ? Schema.basic(document) : schema)
      .compile(ATLAS)
  if (!maybe(schema.scope)) {
    // if our scope was empty, we didn't @link anything
    // if we didn't @link anything, remove any generated headers to keep
    // the document in non-core form
    return fed1Subgraph(output)
  }
  return mergeSchemaDefinitions(withImplicitDefinitions(output.document))
}

function linksFed2(schema: Schema) {
  const versions = new Map<LinkUrl, ASTNode[]>()
  for (const link of schema.scope) {
    const graph = link.gref.graph
    if (!graph) continue
    if (FEDERATION_URLS.has(graph)) {
      const existing = versions.get(graph)
      if (existing) existing.push(link.via!)
      else versions.set(graph, [link.via!])
    }
  }
  if (versions.size > 1)
    report(ErrTooManyFederations(versions))
  return versions.has(FEDERATION_V2_0)
}

const FED1_FIELDSET = GRef.named('FieldSet', 'https://specs.apollo.dev/federation/v1.0')
function fed1Subgraph(schema: Schema): DocumentNode {
  const {document} = schema.dangerousRemoveHeaders()
  return mergeSchemaDefinitions(withImplicitDefinitions(visit(document, {
    enter(node) {
      if (hasName(node) && hasRef(node) && node.gref === FED1_FIELDSET) {
        return {
          ...node,
          name: { ...node.name, value: "_FieldSet" },
          gref: GRef.named('_FieldSet', schema.url)
        }
      }
      return undefined
    }
  })))
}

function mergeSchemaDefinitions(document: DocumentNode): DocumentNode {
  const operationTypes: Partial<Record<OperationTypeNode, NamedTypeNode>> = {}
  const schemaDirectives = []
  let description: StringValueNode | undefined = undefined
  let hasAnyDefinitions = false
  const doc = visit(document, {
    SchemaDefinition(node) {
      hasAnyDefinitions = true
      for (const op of node.operationTypes) {
        operationTypes[op.operation] = op.type
      }
      if (node.directives) schemaDirectives.push(...node.directives)
      if (node.description)
        description = description ? {
          ...description,
          value: [description.value, node.description.value].join('\n'),
        } : node.description
      return null
    }
  })
  if (!hasAnyDefinitions) return doc
  return {
    ...doc,
    definitions: [{
      kind: Kind.SCHEMA_DEFINITION,
      description,
      operationTypes: Object.entries(operationTypes)
        .map(([operation, type]) => ({
          kind: Kind.OPERATION_TYPE_DEFINITION,
          operation: operation as OperationTypeNode,
          type
        }))
      }, ...doc.definitions]
  }
}

function withImplicitDefinitions(doc: DocumentNode) {
  const defs = [...implicitDefinitionNodes(doc)]
  return defs.length ? {
    ...doc,
    definitions: doc.definitions.concat(defs)
  } : doc
}

function *implicitDefinitionNodes(document: DocumentNode): Iterable<DefinitionNode> {
  for (const [name, type] of byName(document.definitions)) {
    if (!name) continue
    if (byKind(type).size !== 1) continue
    const kind = only(byKind(type).keys())
    if (toDefinitionKind(kind) !== kind) {
      yield {
        kind: toDefinitionKind(kind),
        name: { kind: Kind.NAME, value: name }
      }
    }
  }
}

