import { deprecate } from 'util';
import {
  DocumentNode,
  GraphQLSchema,
  concatAST,
  visit,
  OperationTypeNode,
} from 'graphql';
import {
  GraphQLSchemaModule,
  GraphQLResolverMap,
  addResolversToSchema,
  modulesFromSDL,
} from './schema-helper';

import { buildSubgraph, FEDERATION_UNNAMED_SUBGRAPH_NAME, printSchema } from '@apollo/federation-internals';
import { entitiesResolver } from './types';

type LegacySchemaModule = {
  typeDefs: DocumentNode | DocumentNode[];
  resolvers?: GraphQLResolverMap<unknown>;
};

export { GraphQLSchemaModule };

export function buildSubgraphSchema(
  modulesOrSDL:
    | (GraphQLSchemaModule | DocumentNode)[]
    | DocumentNode
    | LegacySchemaModule,
): GraphQLSchema {
  // ApolloServer supports passing an array of DocumentNode along with a single
  // map of resolvers to build a schema. Long term we don't want to support this
  // style anymore as we move towards a more structured approach to modules,
  // however, it has tripped several teams up to not support this signature
  // in buildSubgraphSchema. Especially as teams migrate from
  // `new ApolloServer({ typeDefs: DocumentNode[], resolvers })` to
  // `new ApolloServer({ schema: buildSubgraphSchema({ typeDefs: DocumentNode[], resolvers }) })`
  //
  // The last type in the union for `modulesOrSDL` supports this "legacy" input
  // style in a simple manner (by just adding the resolvers to the first typeDefs entry)
  //
  let shapedModulesOrSDL: (GraphQLSchemaModule | DocumentNode)[] | DocumentNode;
  if ('typeDefs' in modulesOrSDL) {
    const { typeDefs, resolvers } = modulesOrSDL;
    const augmentedTypeDefs = Array.isArray(typeDefs) ? typeDefs : [typeDefs];
    shapedModulesOrSDL = augmentedTypeDefs.map((typeDefs, i) => {
      const module: GraphQLSchemaModule = { typeDefs };
      // add the resolvers to the first "module" in the array
      if (i === 0 && resolvers) module.resolvers = resolvers;
      return module;
    });
  } else {
    shapedModulesOrSDL = modulesOrSDL;
  }

  const modules = modulesFromSDL(shapedModulesOrSDL);
  const documentAST = concatAST(modules.map(module => module.typeDefs));

  let queryTypeName = 'Query';
  visit(documentAST, {
    SchemaDefinition: (def) => {
      const foundName = def.operationTypes.find((t) => t.operation === OperationTypeNode.QUERY)?.type?.name;
      if (foundName) {
        queryTypeName = foundName.value;
      }
    }
  });
  const subgraph = buildSubgraph(FEDERATION_UNNAMED_SUBGRAPH_NAME, '', documentAST);

  const sdl = printSchema(subgraph.schema);

  const schema = subgraph.schema.toGraphQLJSSchema(true);

  addResolversToSchema(schema, {
     Query : {
      _service: () => ({ sdl }),
    }
  });

  if (subgraph.metadata().entityType()) {
    addResolversToSchema(schema, {
     Query : {
        _entities: (_source, { representations }, context, info) => entitiesResolver({ representations, context, info }),
      }
    });
  }

  for (const module of modules) {
    if (!module.resolvers) continue;
    const updatedResolvers: GraphQLResolverMap = {
      ...module.resolvers,
      Query: module.resolvers[queryTypeName] ?? {},
    };
    addResolversToSchema(schema, updatedResolvers);
  }

  return schema;
}

/**
 * @deprecated Use `buildSubgraphSchema` instead.
 */
export const buildFederatedSchema = deprecate(
  buildSubgraphSchema,
  `'buildFederatedSchema' is deprecated. Use 'buildSubgraphSchema' instead.`,
);
