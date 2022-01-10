/**
 * Similar in concept to `IntrospectAndCompose`, but this handles
 * the `experimental_updateComposition` and `experimental_updateSupergraphSdl`
 * configuration options of the gateway and will be removed in a future release
 * along with those options.
 */
import { Logger } from 'apollo-server-types';
import resolvable from '@josephg/resolvable';
import {
  SupergraphManager,
  SupergraphSdlHookOptions,
  DynamicGatewayConfig,
  isSupergraphSdlUpdate,
  isServiceDefinitionUpdate,
  ServiceDefinitionUpdate,
  GetDataSourceFunction,
} from '../../config';
import {
  Experimental_UpdateComposition,
  SubgraphHealthCheckFunction,
  SupergraphSdlUpdateFunction,
} from '../..';
import { composeAndValidate, compositionHasErrors, ServiceDefinition } from '@apollo/federation';
import { GraphQLSchema, isIntrospectionType, isObjectType, parse } from 'graphql';
import { buildComposedSchema } from '@apollo/query-planner';
import { defaultFieldResolverWithAliasSupport } from '../../executeQueryPlan';

export interface LegacyFetcherOptions {
  pollIntervalInMs?: number;
  logger?: Logger;
  subgraphHealthCheck?: boolean;
  updateServiceDefinitions: Experimental_UpdateComposition;
  gatewayConfig: DynamicGatewayConfig;
}

type State =
  | { phase: 'initialized' }
  | { phase: 'polling'; pollingPromise?: Promise<void> }
  | { phase: 'stopped' };

export class LegacyFetcher implements SupergraphManager {
  private config: LegacyFetcherOptions;
  private update?: SupergraphSdlUpdateFunction;
  private healthCheck?: SubgraphHealthCheckFunction;
  private getDataSource?: GetDataSourceFunction;
  private timerRef: NodeJS.Timeout | null = null;
  private state: State;
  private compositionId?: string;
  private serviceDefinitions?: ServiceDefinition[];
  private schema?: GraphQLSchema;

  constructor(options: LegacyFetcherOptions) {
    this.config = options;
    this.state = { phase: 'initialized' };
    this.issueDeprecationWarnings();
  }

  private issueDeprecationWarnings() {
    if ('experimental_updateSupergraphSdl' in this.config.gatewayConfig) {
      this.config.logger?.warn(
        'The `experimental_updateSupergraphSdl` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to the function form of the `supergraphSdl` configuration option.',
      );
    }

    if ('experimental_updateServiceDefinitions' in this.config.gatewayConfig) {
      this.config.logger?.warn(
        'The `experimental_updateServiceDefinitions` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to the function form of the `supergraphSdl` configuration option.',
      );
    }
  }

  public async initialize({
    update,
    healthCheck,
    getDataSource,
  }: SupergraphSdlHookOptions) {
    this.update = update;
    this.getDataSource = getDataSource;

    if (this.config.subgraphHealthCheck) {
      this.healthCheck = healthCheck;
    }

    let initialSupergraphSdl: string | null = null;
    try {
      initialSupergraphSdl = await this.updateSupergraphSdl();
    } catch (e) {
      this.logUpdateFailure(e);
      throw e;
    }

    // Start polling after we resolve the first supergraph
    if (this.config.pollIntervalInMs) {
      this.beginPolling();
    }

    return {
      // on init, this supergraphSdl should never actually be `null`.
      // `this.updateSupergraphSdl()` will only return null if the schema hasn't
      // changed over the course of an _update_.
      supergraphSdl: initialSupergraphSdl!,
      cleanup: async () => {
        if (this.state.phase === 'polling') {
          await this.state.pollingPromise;
        }
        this.state = { phase: 'stopped' };
        if (this.timerRef) {
          clearTimeout(this.timerRef);
          this.timerRef = null;
        }
      },
    };
  }

  private async updateSupergraphSdl() {
    const result = await this.config.updateServiceDefinitions(
      this.config.gatewayConfig,
    );

    if (isSupergraphSdlUpdate(result)) {
      // no change
      if (this.compositionId === result.id) return null;

      await this.healthCheck?.(result.supergraphSdl);
      this.compositionId = result.id;
      return result.supergraphSdl;
    } else if (isServiceDefinitionUpdate(result)) {
      const supergraphSdl = this.updateByComposition(result);
      if (!supergraphSdl) return null;
      await this.healthCheck?.(supergraphSdl);
      return supergraphSdl;
    } else {
      throw new Error(
        'Programming error: unexpected result type from `updateServiceDefinitions`',
      );
    }
  }

  private updateByComposition(result: ServiceDefinitionUpdate) {
    if (
      !result.serviceDefinitions ||
      JSON.stringify(this.serviceDefinitions) ===
        JSON.stringify(result.serviceDefinitions)
    ) {
      this.config.logger?.debug(
        'No change in service definitions since last check.',
      );
      return null;
    }

    const previousSchema = this.schema;

    if (previousSchema) {
      this.config.logger?.info('New service definitions were found.');
    }

    this.serviceDefinitions = result.serviceDefinitions;

    const { schema, supergraphSdl } = this.createSchemaFromServiceList(
      result.serviceDefinitions,
    );

    if (!supergraphSdl) {
      throw new Error(
        "A valid schema couldn't be composed. Falling back to previous schema.",
      );
    } else {
      this.schema = schema;
      return supergraphSdl;
    }
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

  private beginPolling() {
    this.state = { phase: 'polling' };
    this.poll();
  }

  private poll() {
    this.timerRef = setTimeout(async () => {
      if (this.state.phase === 'polling') {
        const pollingPromise = resolvable();

        this.state.pollingPromise = pollingPromise;
        try {
          const maybeNewSupergraphSdl = await this.updateSupergraphSdl();
          if (maybeNewSupergraphSdl) {
            this.update?.(maybeNewSupergraphSdl);
          }
        } catch (e) {
          this.logUpdateFailure(e);
        }
        pollingPromise.resolve();
      }

      this.poll();
    }, this.config.pollIntervalInMs!);
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
