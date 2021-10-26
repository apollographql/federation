import {
  FieldNode,
  GraphQLField,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLNamedType,
} from 'graphql';
import { FederationEntityTypeMetadata } from '../composedSchema';
import { FieldSet } from '../FieldSet';
import { getResponseName } from '../utilities/graphql';
import { depthFirstSearch } from './traversal';
import { addPath } from '../buildQueryPlan';
const toposort = require('toposort');

interface OperationSchemaNode {
  fieldDef: GraphQLField<any, any>;
  fieldNode?: GraphQLField<any, any>;
}

export class SchemaDependencyGraph {
  public dependenciesAdjacencySet: Map<
    GraphQLField<any, any>,
    Set<GraphQLField<any, any>>
  > = new Map<GraphQLField<any, any>, Set<GraphQLField<any, any>>>();

  static fromSchema(schema: GraphQLSchema): SchemaDependencyGraph {
    const schemaGraph = new SchemaDependencyGraph();

    const types = Object.values(schema.getTypeMap());
    types.forEach((type) => {
      if (!(type instanceof GraphQLObjectType)) {
        return;
      }

      const fieldDefs = Object.values(type.getFields());
      // this data structure simplifies mapping of fieldDefs to fieldNodes
      const typeNameDefMap: Map<string, GraphQLField<any, any>> = new Map(
        fieldDefs.map((fieldDef) => [fieldDef.name, fieldDef]),
      );
      fieldDefs.forEach((fieldDef) => {
        schemaGraph.addKeyDependencies(type, fieldDef, typeNameDefMap);

        const dependencyNodes = fieldDef.extensions?.federation?.requires || [];
        schemaGraph.addRequiresDependencies(
          dependencyNodes as FieldNode[],
          fieldDef,
          typeNameDefMap,
        );
      });
    });
    return schemaGraph;
  }

  public getDependencySubgraph(fields: FieldSet): {
    subgraph: SchemaDependencyGraph;
    paths: Map<GraphQLField<any, any>, string[]>;
  } {
    // Get the subgraph of all nodes in the operation plus their dependencies.
    // fieldNode represents operation nodes whereas fieldDef represents schema nodes. Traverse them
    // in parallel so the visitor has access to both corresponding nodes. Follow structural schema edges
    // from fieldNodes to get all nodes in the operation. Follow dependency edges from fieldDef to get all
    // dependencies.

    const subgraph: SchemaDependencyGraph = new SchemaDependencyGraph();

    const paths: Map<GraphQLField<any, any>, string[]> = new Map();
    if (fields.length > 1) {
      throw new Error('this POC only supports one query field');
    }
    const { fieldNode, fieldDef } = fields[0];
    depthFirstSearch({
      root: { fieldNode, fieldDef },
      visit: (node: any) => {
        const { fieldDef } = node;
        subgraph.addDependencies(fieldDef, this.getDependencies(fieldDef));
        const path = paths.get(fieldDef) || [];
        const newPath = addPath(
          path,
          getResponseName(fieldNode),
          fieldDef.type,
        ) as string[];
        paths.set(fieldDef, newPath);
      },
      getChildren: (node: any) => {
        // traverse operation structure edges
        const structuralChildren: OperationSchemaNode[] =
          node.fieldNode?.selectionSet?.selections.map(
            (fieldNode: FieldNode) => {
              const fieldDefs = node.fieldDef.type.getFields();
              const fieldDef = Object.values(fieldDefs).find(
                (fieldDef: any) => fieldDef.name === fieldNode.name.value,
              );
              return { fieldDef, fieldNode };
            },
          ) || [];

        // traverse schema dependency edges
        const dependencyChildren: OperationSchemaNode[] =
          this.getDependencies(node.fieldDef)
            ?.filter(
              (
                dep: GraphQLField<any, any> | undefined,
              ): dep is GraphQLField<any, any> => {
                return !!dep && !subgraph.dependenciesAdjacencySet.has(dep);
              },
            )
            .map((dep: GraphQLField<any, any>) => {
              return { fieldDef: dep };
            }) || [];

        return structuralChildren.concat(dependencyChildren);
      },
    });

    return { subgraph, paths };
  }

  public getDependencies(
    node: GraphQLField<any, any>,
  ): GraphQLField<any, any>[] {
    const depSet = this.dependenciesAdjacencySet.get(node);
    return depSet ? [...depSet] : [];
  }

  public getSortedNodes(): GraphQLField<any, any>[] {
    return toposort.array(this.getNodes(), this.getEdges()).reverse();
  }

  private addKeyDependencies(
    type: GraphQLNamedType,
    fieldDef: any,
    typeNameDefMap: Map<string, GraphQLField<any, any>>,
  ) {
    const keyFields = (
      type.extensions?.federation as FederationEntityTypeMetadata
    )?.keys;
    const fieldGraphName = fieldDef.extensions?.federation?.graphName;

    const fieldKeyNodes: FieldNode[] =
      keyFields && fieldGraphName
        ? (keyFields
            .get(fieldGraphName)
            ?.flat()
            .filter(
              (fieldNodeOrFragment: any) => fieldNodeOrFragment['name'],
            ) as FieldNode[])
        : [];

    const fieldKeyDefs = fieldKeyNodes
      ?.map((keyNode) => typeNameDefMap.get(keyNode.name.value)!)
      .filter((keyDef) => keyDef !== fieldDef);

    if (fieldKeyDefs) {
      this.dependenciesAdjacencySet.set(fieldDef, new Set(fieldKeyDefs));
    } else {
      this.dependenciesAdjacencySet.set(fieldDef, new Set());
    }
  }

  private addRequiresDependencies(
    dependencyNodes: FieldNode[],
    fieldDef: GraphQLField<any, any>,
    nameDefMap: Map<string, GraphQLField<any, any>>,
  ) {
    const dependencyDefs: GraphQLField<any, any>[] = dependencyNodes
      .map((dependencyNode: FieldNode) =>
        nameDefMap.get((dependencyNode as FieldNode).name.value),
      )
      .filter(
        (
          dependencyDef: GraphQLField<any, any> | undefined,
        ): dependencyDef is GraphQLField<any, any> => !!dependencyDef,
      );

    this.addDependencies(fieldDef, dependencyDefs);
  }

  private addDependencies(
    node: GraphQLField<any, any>,
    dependencies: GraphQLField<any, any>[],
  ): void {
    const existingDeps = this.dependenciesAdjacencySet.get(node) || [];
    this.dependenciesAdjacencySet.set(
      node,
      new Set([...existingDeps, ...dependencies]),
    );
  }

  private getNodes(): GraphQLField<any, any>[] {
    return [...this.dependenciesAdjacencySet.keys()];
  }

  private getEdges(): GraphQLField<any, any>[][] {
    const edges: GraphQLField<any, any>[][] = [];
    this.dependenciesAdjacencySet.forEach((value, key) => {
      value.forEach((value) => edges.push([key, value]));
    });
    return edges;
  }
}
