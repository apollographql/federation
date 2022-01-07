// TODO(trevor:removeServiceList) the whole file goes away
import { Logger } from 'apollo-server-types';
import {
  composeAndValidate,
  compositionHasErrors,
  ServiceDefinition,
} from '@apollo/federation';
import {
  GraphQLSchema,
  isIntrospectionType,
  isObjectType,
  parse,
} from 'graphql';
import { buildComposedSchema } from '@apollo/query-planner';
import {
  GetDataSourceFunction,
  SupergraphSdlHookOptions,
  SupergraphManager,
} from '../../config';
import { defaultFieldResolverWithAliasSupport } from '../../executeQueryPlan';

export interface LocalComposeOptions {
  logger?: Logger;
  localServiceList: ServiceDefinition[];
}

export class LocalCompose implements SupergraphManager {
  private config: LocalComposeOptions;
  private getDataSource?: GetDataSourceFunction;

  constructor(options: LocalComposeOptions) {
    this.config = options;
    this.issueDeprecationWarnings();
  }

  private issueDeprecationWarnings() {
    this.config.logger?.warn(
      'The `localServiceList` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to the `LocalCompose` supergraph manager exported by `@apollo/gateway`.',
    );
  }

  public async initialize({ getDataSource }: SupergraphSdlHookOptions) {
    this.getDataSource = getDataSource;
    let supergraphSdl: string | null = null;
    try {
      ({ supergraphSdl } = this.createSchemaFromServiceList(
        this.config.localServiceList,
      ));
    } catch (e) {
      this.logUpdateFailure(e);
      throw e;
    }
    return {
      supergraphSdl,
    };
  }

  private createSchemaFromServiceList(serviceList: ServiceDefinition[]) {
    this.config.logger?.debug(
      `Composing schema from service list: \n${serviceList
        .map(({ name, url }) => `  ${url || 'local'}: ${name}`)
        .join('\n')}`,
    );

    const compositionResult = composeAndValidate(serviceList);

    if (compositionHasErrors(compositionResult)) {
      const { errors } = compositionResult;
      throw Error(
        "A valid schema couldn't be composed. The following composition errors were found:\n" +
          errors.map((e) => '\t' + e.message).join('\n'),
      );
    } else {
      const { supergraphSdl } = compositionResult;
      for (const service of serviceList) {
        this.getDataSource?.(service);
      }

      const schema = buildComposedSchema(parse(supergraphSdl));

      this.config.logger?.debug('Schema loaded and ready for execution');

      // This is a workaround for automatic wrapping of all fields, which Apollo
      // Server does in the case of implementing resolver wrapping for plugins.
      // Here we wrap all fields with support for resolving aliases as part of the
      // root value which happens because aliases are resolved by sub services and
      // the shape of the root value already contains the aliased fields as
      // responseNames
      return {
        schema: wrapSchemaWithAliasResolver(schema),
        supergraphSdl,
      };
    }
  }

  private logUpdateFailure(e: any) {
    this.config.logger?.error(
      'UplinkFetcher failed to update supergraph with the following error: ' +
        (e.message ?? e),
    );
  }
}

// We can't use transformSchema here because the extension data for query
// planning would be lost. Instead we set a resolver for each field
// in order to counteract GraphQLExtensions preventing a defaultFieldResolver
// from doing the same job
function wrapSchemaWithAliasResolver(schema: GraphQLSchema): GraphQLSchema {
  const typeMap = schema.getTypeMap();
  Object.keys(typeMap).forEach((typeName) => {
    const type = typeMap[typeName];

    if (isObjectType(type) && !isIntrospectionType(type)) {
      const fields = type.getFields();
      Object.keys(fields).forEach((fieldName) => {
        const field = fields[fieldName];
        field.resolve = defaultFieldResolverWithAliasSupport;
      });
    }
  });
  return schema;
}
