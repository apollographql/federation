import { deprecate } from 'util';
import { createHash } from '@apollo/utils.createhash';
import type { Logger } from '@apollo/utils.logger';
import { IQueryPlanner, QueryPlanCache } from '@apollo/query-planner'
import { InMemoryLRUCache } from '@apollo/utils.keyvaluecache';
import {
  GraphQLSchema,
  VariableDefinitionNode
} from 'graphql';
import { buildOperationContext, OperationContext } from './operationContext';
import {
  executeQueryPlan,
  ServiceMap,
} from './executeQueryPlan';
import {
  GraphQLDataSource,
  GraphQLDataSourceRequestKind,
} from './datasources/types';
import { RemoteGraphQLDataSource } from './datasources/RemoteGraphQLDataSource';
import { getVariableValues } from 'graphql/execution/values';
import {
  QueryPlan,
  prettyFormatQueryPlan,
} from '@apollo/query-planner';
import {
  ServiceEndpointDefinition,
  Experimental_DidFailCompositionCallback,
  Experimental_DidResolveQueryPlanCallback,
  Experimental_DidUpdateSupergraphCallback,
  Experimental_UpdateComposition,
  CompositionInfo,
  GatewayConfig,
  isManuallyManagedConfig,
  isLocalConfig,
  isServiceListConfig,
  isManagedConfig,

} from './config';
import { SpanStatusCode } from '@opentelemetry/api';
import { OpenTelemetrySpanNames, tracer } from './utilities/opentelemetry';
import { addExtensions } from './schema-helper/addExtensions';
import {
  IntrospectAndCompose,
  UplinkSupergraphManager,
  LocalCompose,
} from './supergraphManagers';
import {
  operationFromDocument,
  Schema,
  ServiceDefinition,
} from '@apollo/federation-internals';
import { getDefaultLogger } from './logger';
import {GatewayInterface, GatewayUnsubscriber, GatewayGraphQLRequestContext, GatewayExecutionResult} from '@apollo/server-gateway-interface';
import { assert } from './utilities/assert';
import { QueryPlanManager } from './QueryPlanManager';

type DataSourceMap = {
  [serviceName: string]: { url?: string; dataSource: GraphQLDataSource };
};

// Local state to track whether particular UX-improving warning messages have
// already been emitted.  This is particularly useful to prevent recurring
// warnings of the same type in, e.g. repeating timers, which don't provide
// additional value when they are repeated over and over during the life-time
// of a server.
type WarnedStates = {
  remoteWithLocalConfig?: boolean;
};

export const HEALTH_CHECK_QUERY =
  'query __ApolloServiceHealthCheck__ { __typename }';
export const SERVICE_DEFINITION_QUERY =
  'query __ApolloGetServiceDefinition__ { _service { sdl } }';

type GatewayState =
  | { phase: 'initialized' }
  | { phase: 'failed to load' }
  | { phase: 'loaded' }
  | { phase: 'stopping'; stoppingDonePromise: Promise<void> }
  | { phase: 'stopped' }
  | { phase: 'updating schema' };

// We want to be compatible with `load()` as called by both AS2 and AS3, so we
// define its argument types ourselves instead of relying on imports.

// This is what AS3's ApolloConfig looks like; it's what we'll save internally.
interface ApolloConfigFromAS3 {
  key?: string;
  keyHash?: string;
  graphRef?: string;
}

// This interface matches what we may receive from either version. We convert it
// to ApolloConfigFromAS3.
interface ApolloConfigFromAS2Or3 {
  key?: string;
  keyHash?: string;
  graphRef?: string;
  graphId?: string;
  graphVariant?: string;
}

// This interface was the only way this data was provided prior to AS 2.18; it
// is being removed in AS 3, so we define our own version.
interface GraphQLServiceEngineConfig {
  apiKeyHash: string;
  graphId: string;
  graphVariant?: string;
}

export class ApolloGateway implements GatewayInterface {
  public schema?: GraphQLSchema;
  // Same as a `schema` but as a `Schema` to avoid reconverting when we need it.
  // TODO(sylvain): if we add caching in `Schema.toGraphQLJSSchema`, we could maybe only keep `apiSchema`
  // and make `schema` a getter (though `schema` does add some extension and this should
  // be accounted for). Unsure if moving from a member to a getter could break anyone externally however
  // (also unclear why we expose a mutable member public in the first place; don't everything break if the
  // use manually assigns `schema`?).
  private apiSchema?: Schema;
  private serviceMap: DataSourceMap = Object.create(null);
  private config: GatewayConfig;
  private logger: Logger;
  private queryPlanStore: QueryPlanCache;
  private apolloConfig?: ApolloConfigFromAS3;
  private onSchemaChangeListeners = new Set<(schema: GraphQLSchema) => void>();
  private onSchemaLoadOrUpdateListeners = new Set<
    (schemaContext: {
      apiSchema: GraphQLSchema;
      coreSupergraphSdl: string;
    }) => void
  >();
  private warnedStates: WarnedStates = Object.create(null);
  private queryPlanner?: IQueryPlanner;
  private supergraphSdl?: string;
  private supergraphSchema?: GraphQLSchema;
  private subgraphs?: readonly { name: string; url: string }[];
  private state: GatewayState;

  private queryPlanManager: QueryPlanManager;

  // Observe query plan, service info, and operation info prior to execution.
  // The information made available here will give insight into the resulting
  // query plan and the inputs that generated it.
  private experimental_didResolveQueryPlan?: Experimental_DidResolveQueryPlanCallback;
  // Used to communicate supergraph updates
  private experimental_didUpdateSupergraph?: Experimental_DidUpdateSupergraphCallback;
  // how often service defs should be loaded/updated
  private pollIntervalInMs?: number;
  // Functions to call during gateway cleanup (when stop() is called)
  private toDispose: (() => Promise<void>)[] = [];

  constructor(config?: GatewayConfig) {
    this.config = {
      // TODO: expose the query plan in a more flexible JSON format in the future
      // and remove this config option in favor of `exposeQueryPlan`. Playground
      // should cutover to use the new option when it's built.
      __exposeQueryPlanExperimental: process.env.NODE_ENV !== 'production',
      ...config,
    };

    this.logger = this.config.logger ?? getDefaultLogger(this.config.debug);
    this.queryPlanStore = this.initQueryPlanStore(
      config?.experimental_approximateQueryPlanStoreMiB,
    );

    // set up experimental observability callbacks and config settings
    this.experimental_didResolveQueryPlan =
      config?.experimental_didResolveQueryPlan;
    this.experimental_didUpdateSupergraph =
      config?.experimental_didUpdateSupergraph;

    if (isManagedConfig(this.config)) {
      this.pollIntervalInMs =
        this.config.fallbackPollIntervalInMs ?? this.config.pollIntervalInMs;
    } else if (isServiceListConfig(this.config)) {
      this.pollIntervalInMs = this.config?.pollIntervalInMs;
    }

    this.issueConfigurationWarningsIfApplicable();

    this.logger.debug('Gateway successfully initialized (but not yet loaded)');
    this.state = { phase: 'initialized' };

    this.queryPlanManager = new QueryPlanManager(
      this.config,
      this.pollIntervalInMs,
      this.logger
    );
    this.queryPlanner = this.queryPlanManager;
  }

  private initQueryPlanStore(approximateQueryPlanStoreMiB?: number) {
    if (this.config.queryPlannerConfig?.cache) {
      return this.config.queryPlannerConfig?.cache;
    }
    // Create ~about~ a 30MiB InMemoryLRUCache (or 50MiB if the full operation ASTs are
    // enabled in query plans as this requires plans to use more memory). This is
    // less than precise since the technique to calculate the size of a DocumentNode is
    // only using JSON.stringify on the DocumentNode (and thus doesn't account
    // for unicode characters, etc.), but it should do a reasonable job at
    // providing a caching document store for most operations.
    const defaultSize = this.config.queryPlannerConfig
      ?.exposeDocumentNodeInFetchNode
      ? 50
      : 30;
    return new InMemoryLRUCache<QueryPlan>({
      maxSize: Math.pow(2, 20) * (approximateQueryPlanStoreMiB || defaultSize),
      sizeCalculation: approximateObjectSize,
    });
  }

  private issueConfigurationWarningsIfApplicable() {
    // Warn against using the pollInterval and a serviceList simultaneously
    // TODO(trevor:removeServiceList)
    if (this.pollIntervalInMs && isServiceListConfig(this.config)) {
      this.logger.warn(
        'Polling running services is dangerous and not recommended in production. ' +
          'Polling should only be used against a registry. ' +
          'If you are polling running services, use with caution.',
      );
    }

    if (
      isManuallyManagedConfig(this.config) &&
      'experimental_updateSupergraphSdl' in this.config &&
      'experimental_updateServiceDefinitions' in this.config
    ) {
      this.logger.warn(
        'Gateway found two manual update configurations when only one should be ' +
          'provided. Gateway will default to using the provided `experimental_updateSupergraphSdl` ' +
          'function when both `experimental_updateSupergraphSdl` and experimental_updateServiceDefinitions` ' +
          'are provided.',
      );
    }

    if ('schemaConfigDeliveryEndpoint' in this.config) {
      this.logger.warn(
        'The `schemaConfigDeliveryEndpoint` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to the equivalent (array form) `uplinkEndpoints` configuration option.',
      );
    }

    if (isManagedConfig(this.config) && 'pollIntervalInMs' in this.config) {
      this.logger.warn(
        'The `pollIntervalInMs` option is deprecated and will be removed in a future version of `@apollo/gateway`. ' +
          'Please migrate to the equivalent `fallbackPollIntervalInMs` configuration option. ' +
          'The poll interval is now defined by Uplink, this option will only be used if it is greater than the value defined by Uplink or as a fallback.',
      );
    }
  }

  public async load(options?: {
    apollo?: ApolloConfigFromAS2Or3;
    engine?: GraphQLServiceEngineConfig;
  }) {
    this.logger.debug('Loading gateway...');

    if (this.state.phase !== 'initialized') {
      throw Error(
        `ApolloGateway.load called in surprising state ${this.state.phase}`,
      );
    }
    if (options?.apollo) {
      const { key, keyHash, graphRef, graphId, graphVariant } = options.apollo;
      this.apolloConfig = {
        key,
        keyHash,
        graphRef:
          graphRef ??
          (graphId ? `${graphId}@${graphVariant ?? 'current'}` : undefined),
      };
    } else if (options?.engine) {
      // Older version of apollo-server-core that isn't passing 'apollo' yet.
      const { apiKeyHash, graphId, graphVariant } = options.engine;
      this.apolloConfig = {
        keyHash: apiKeyHash,
        graphRef: graphId
          ? `${graphId}@${graphVariant ?? 'current'}`
          : undefined,
      };
    }

    this.maybeWarnOnConflictingConfig();

    await this.queryPlanManager.createSupergraphManager(this.apolloConfig);
    await this.initializeSupergraphManager();

    const mode = isManagedConfig(this.config) ? 'managed' : 'unmanaged';
    this.logger.info(
      `Gateway successfully loaded schema.\n\t* Mode: ${mode}${
        this.apolloConfig && this.apolloConfig.graphRef
          ? `\n\t* Service: ${this.apolloConfig.graphRef}`
          : ''
      }`,
    );

    addExtensions(this.schema!);

    return {
      schema: this.schema!,
      executor: this.executor,
    };
  }

  private async initializeSupergraphManager() {
    try {
      await this.queryPlanManager.initializeSupergraphManager({
        update: this.externalSupergraphUpdateCallback.bind(this),
        healthCheck: this.externalSubgraphHealthCheckCallback.bind(this),
        getDataSource: this.externalGetDataSourceCallback.bind(this),
        experimental_didUpdateSupergraph: this.experimental_didUpdateSupergraph,
      });
    } catch (e) {
      this.state = { phase: 'failed to load' };
      await this.performCleanupAndLogErrors();
      throw e;
    }

    this.state = { phase: 'loaded' };
  }

  /**
   * @throws Error
   * when called from a state other than `loaded` or `intialized`
   *
   * @throws Error
   * when the provided supergraphSdl is invalid
   */
  private externalSupergraphUpdateCallback(supergraphSdl: string) {
    switch (this.state.phase) {
      case 'failed to load':
        throw new Error(
          "Can't call `update` callback after gateway failed to load.",
        );
      case 'updating schema':
        throw new Error(
          "Can't call `update` callback while supergraph update is in progress.",
        );
      case 'stopped':
        throw new Error(
          "Can't call `update` callback after gateway has been stopped.",
        );
      case 'stopping':
        throw new Error(
          "Can't call `update` callback while gateway is stopping.",
        );
      case 'loaded':
      case 'initialized':
        // typical case
        break;
      default:
        throw new UnreachableCaseError(this.state);
    }

    this.state = { phase: 'updating schema' };
    try {
      this.supergraphSdl = supergraphSdl;
      this.updateWithSchemaAndNotify(supergraphSdl)
    } finally {
      // if update fails, we still want to go back to `loaded` state
      this.state = { phase: 'loaded' };
    }
  }

  /**
   * @throws Error
   * when any subgraph fails the health check
   */
  private async externalSubgraphHealthCheckCallback() {
    const serviceList = this.subgraphs;
    assert(
      serviceList,
      'subgraph list extracted from supergraph sdl must be present',
    );
    // Here we need to construct new datasources based on the new schema info
    // so we can check the health of the services we're _updating to_.
    const serviceMap = serviceList.reduce((serviceMap, serviceDef) => {
      serviceMap[serviceDef.name] = {
        url: serviceDef.url,
        dataSource: this.createDataSource(serviceDef),
      };
      return serviceMap;
    }, Object.create(null) as DataSourceMap);

    try {
      await this.serviceHealthCheck(serviceMap);
    } catch (e) {
      throw new Error(
        'The gateway subgraphs health check failed. Updating to the provided ' +
          '`supergraphSdl` will likely result in future request failures to ' +
          'subgraphs. The following error occurred during the health check:\n' +
          e.message,
      );
    }
  }

  private externalGetDataSourceCallback({
    name,
    url,
  }: ServiceEndpointDefinition) {
    return this.getOrCreateDataSource({ name, url });
  }

  // TODO: We should consolidate "schema derived data" state as we've done in Apollo Server to
  //       ensure we do not forget to update some of that state, and to avoid scenarios where
  //       concurrently executing code sees partially-updated state.
  private updateWithSchemaAndNotify(
    supergraphSdl: string,
    // Once we remove the deprecated onSchemaChange() method, we can remove this.
    legacyDontNotifyOnSchemaChangeListeners: boolean = false,
  ): void {
    this.queryPlanStore.clear();

    const { apiSchema, supergraphSchema, subgraphs } = this.queryPlanManager.schemas();
    this.apiSchema = apiSchema;
    this.schema = addExtensions(apiSchema.toGraphQLJSSchema());
    this.supergraphSchema = supergraphSchema;
    this.createServices(subgraphs);

    // Notify onSchemaChange listeners of the updated schema
    if (!legacyDontNotifyOnSchemaChangeListeners) {
      this.onSchemaChangeListeners.forEach((listener) => {
        try {
          listener(this.schema!);
        } catch (e) {
          this.logger.error(
            "An error was thrown from an 'onSchemaChange' listener. " +
              'The schema will still update: ' +
              ((e && e.message) || e),
          );
        }
      });
    }

    // Notify onSchemaLoadOrUpdate listeners of the updated schema
    this.onSchemaLoadOrUpdateListeners.forEach((listener) => {
      try {
        listener({
          apiSchema: this.schema!,
          coreSupergraphSdl: supergraphSdl,
        });
      } catch (e) {
        this.logger.error(
          "An error was thrown from an 'onSchemaLoadOrUpdate' listener. " +
            'The schema will still update: ' +
            ((e && e.message) || e),
        );
      }
    });
  }

  /**
   * This can be used without an argument in order to perform an ad-hoc health check
   * of the downstream services like so:
   *
   * @example
   * ```
   * try {
   *   await gateway.serviceHealthCheck();
   * } catch(e) {
   *   /* your error handling here *\/
   * }
   * ```
   * @throws
   * @param serviceMap {DataSourceMap}
   */
  public serviceHealthCheck(serviceMap: DataSourceMap = this.serviceMap) {
    return Promise.all(
      Object.entries(serviceMap).map(([name, { dataSource }]) =>
        dataSource
          .process({
            kind: GraphQLDataSourceRequestKind.HEALTH_CHECK,
            request: { query: HEALTH_CHECK_QUERY },
            context: {},
          })
          .then((response) => ({ name, response }))
          .catch((e) => {
            throw new Error(`[${name}]: ${e.message}`);
          }),
      ),
    );
  }

  /**
   * @deprecated Please use `onSchemaLoadOrUpdate` instead.
   */
  public onSchemaChange(
    callback: (schema: GraphQLSchema) => void,
  ): GatewayUnsubscriber {
    this.onSchemaChangeListeners.add(callback);

    return () => {
      this.onSchemaChangeListeners.delete(callback);
    };
  }

  public onSchemaLoadOrUpdate(
    callback: (schemaContext: {
      apiSchema: GraphQLSchema;
      coreSupergraphSdl: string;
    }) => void,
  ): GatewayUnsubscriber {
    this.onSchemaLoadOrUpdateListeners.add(callback);

    return () => {
      this.onSchemaLoadOrUpdateListeners.delete(callback);
    };
  }

  private getOrCreateDataSource(
    serviceDef: ServiceEndpointDefinition,
  ): GraphQLDataSource {
    // If the DataSource has already been created, early return
    if (
      this.serviceMap[serviceDef.name] &&
      serviceDef.url === this.serviceMap[serviceDef.name].url
    ) {
      return this.serviceMap[serviceDef.name].dataSource;
    }

    const dataSource = this.createDataSource(serviceDef);

    // Cache the created DataSource
    this.serviceMap[serviceDef.name] = { url: serviceDef.url, dataSource };

    return dataSource;
  }

  private createDataSource(
    serviceDef: ServiceEndpointDefinition,
  ): GraphQLDataSource {
    if (!serviceDef.url && !isLocalConfig(this.config)) {
      this.logger.error(
        `Service definition for service ${serviceDef.name} is missing a url`,
      );
    }

    return this.config.buildService
      ? this.config.buildService(serviceDef)
      : new RemoteGraphQLDataSource({
          url: serviceDef.url,
        });
  }

  private createServices(services: readonly ServiceEndpointDefinition[]) {
    for (const serviceDef of services) {
      this.getOrCreateDataSource(serviceDef);
    }
  }

  private maybeWarnOnConflictingConfig() {
    const canUseManagedConfig =
      this.apolloConfig?.graphRef && this.apolloConfig?.keyHash;

    // This might be a bit confusing just by reading, but `!isManagedConfig` just
    // means it's any of the other types of config. If it's any other config _and_
    // we have a studio config available (`canUseManagedConfig`) then we have a
    // conflict.
    if (
      !isManagedConfig(this.config) &&
      canUseManagedConfig &&
      !this.warnedStates.remoteWithLocalConfig
    ) {
      // Only display this warning once per start-up.
      this.warnedStates.remoteWithLocalConfig = true;
      // This error helps avoid common misconfiguration.
      // We don't await this because a local configuration should assume
      // remote is unavailable for one reason or another.
      this.logger.warn(
        'A local gateway configuration is overriding a managed federation ' +
          'configuration.  To use the managed ' +
          'configuration, do not specify a service list or supergraphSdl locally.',
      );
    }
  }

  // XXX Nothing guarantees that the only errors thrown or returned in
  // result.errors are GraphQLErrors, even though other code (eg
  // ApolloServerPluginUsageReporting) assumes that. In fact, errors talking to backends
  // are unlikely to show up as GraphQLErrors. Do we need to use
  // formatApolloErrors or something?
  public executor = async (
    requestContext: GatewayGraphQLRequestContext,
  ): Promise<GatewayExecutionResult> => {
    const spanAttributes = requestContext.operationName
      ? { operationName: requestContext.operationName }
      : {};

    return tracer.startActiveSpan(
      OpenTelemetrySpanNames.REQUEST,
      { attributes: spanAttributes },
      async (span) => {
        try {
          const { request, document, queryHash } = requestContext;
          const queryPlanStoreKey = request.operationName
            ? createHash('sha256')
                .update(queryHash)
                .update(request.operationName)
                .digest('hex')
            : queryHash;
          const operationContext = buildOperationContext({
            schema: this.schema!,
            operationDocument: document,
            operationName: request.operationName,
          });

          // No need to build a query plan if we know the request is invalid beforehand
          // In the future, this should be controlled by the requestPipeline
          const validationErrors = this.validateIncomingRequest(
            requestContext,
            operationContext,
          );

          if (validationErrors.length > 0) {
            span.setStatus({ code: SpanStatusCode.ERROR });
            return { errors: validationErrors };
          }
          let queryPlan = await this.queryPlanStore.get(queryPlanStoreKey);

          if (!queryPlan) {
            queryPlan = await tracer.startActiveSpan(
              OpenTelemetrySpanNames.PLAN,
              (span) => {
                try {
                  const operation = operationFromDocument(
                    this.apiSchema!,
                    document,
                    { operationName: request.operationName },
                  );
                  // TODO(#631): Can we be sure the query planner has been initialized here?
                  return this.queryPlanner!.buildQueryPlan(operation);
                } catch (err) {
                  span.setStatus({ code: SpanStatusCode.ERROR });
                  throw err;
                } finally {
                  span.end();
                }
              },
            );

            try {
              await this.queryPlanStore.set(queryPlanStoreKey, queryPlan);
            } catch (err) {
              this.logger.warn(
                'Could not store queryPlan' + ((err && err.message) || err),
              );
            }
          }

          const serviceMap: ServiceMap = Object.entries(this.serviceMap).reduce(
            (serviceDataSources, [serviceName, { dataSource }]) => {
              serviceDataSources[serviceName] = dataSource;
              return serviceDataSources;
            },
            Object.create(null) as ServiceMap,
          );

          if (this.experimental_didResolveQueryPlan) {
            this.experimental_didResolveQueryPlan({
              queryPlan,
              serviceMap,
              requestContext,
              operationContext,
            });
          }

          const response = await executeQueryPlan(
            queryPlan,
            serviceMap,
            requestContext,
            operationContext,
            this.supergraphSchema!,
            this.apiSchema!,
          );

          const shouldShowQueryPlan =
            this.config.__exposeQueryPlanExperimental &&
            request.http &&
            request.http.headers &&
            request.http.headers.get('Apollo-Query-Plan-Experimental');

          // We only want to serialize the query plan if we're going to use it, which is
          // in two cases:
          // 1) non-empty query plan and config.debug === true
          // 2) non-empty query plan and shouldShowQueryPlan === true
          const serializedQueryPlan =
            queryPlan.node && (this.config.debug || shouldShowQueryPlan)
              ? // FIXME: I disabled printing the query plan because this lead to a
                // circular dependency between the `@apollo/gateway` and
                // `apollo-federation-integration-testsuite` packages.
                // We should either solve that or switch Playground to
                // the JSON serialization format.
                prettyFormatQueryPlan(queryPlan)
              : null;

          if (this.config.debug && serializedQueryPlan) {
            this.logger.debug(serializedQueryPlan);
          }

          if (shouldShowQueryPlan) {
            // TODO: expose the query plan in a more flexible JSON format in the future
            // and rename this to `queryPlan`. Playground should cutover to use the new
            // option once we've built a way to print that representation.

            // In the case that `serializedQueryPlan` is null (on introspection), we
            // still want to respond to Playground with something truthy since it depends
            // on this to decide that query plans are supported by this gateway.
            response.extensions = {
              __queryPlanExperimental: serializedQueryPlan || true,
            };
          }
          if (response.errors) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }
          return response;
        } catch (err) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  };

  private validateIncomingRequest(
    requestContext: GatewayGraphQLRequestContext,
    operationContext: OperationContext,
  ) {
    return tracer.startActiveSpan(OpenTelemetrySpanNames.VALIDATE, (span) => {
      try {
        // casting out of `readonly`
        const variableDefinitions = operationContext.operation
          .variableDefinitions as VariableDefinitionNode[] | undefined;

        if (!variableDefinitions) return [];

        const { errors } = getVariableValues(
          operationContext.schema,
          variableDefinitions,
          requestContext.request.variables || {},
        );

        if (errors) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
        return errors || [];
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  private async performCleanupAndLogErrors() {
    await this.queryPlanManager.dispose();
    if (this.toDispose.length === 0) return;

    await Promise.all(
      [...this.toDispose.map((p) =>
        p().catch((e) => {
          this.logger.error(
            'Error occured while calling user provided `cleanup` function: ' +
              (e.message ?? e),
          );
        }),
      )],
    );
    this.toDispose = [];
  }

  // Stops all processes involved with the gateway. Can be called multiple times
  // safely. Once it (async) returns, all gateway background activity will be finished.
  public async stop() {
    switch (this.state.phase) {
      case 'initialized':
      case 'failed to load':
      case 'stopped':
        // Calls to stop() are idempotent.
        return;
      case 'stopping':
        await this.state.stoppingDonePromise;
        // The cast here is because TS doesn't understand that this.state can
        // change during the await
        // (https://github.com/microsoft/TypeScript/issues/9998).
        if ((this.state as GatewayState).phase !== 'stopped') {
          throw Error(
            `Expected to be stopped when done stopping, but instead ${this.state.phase}`,
          );
        }
        return;
      case 'loaded':
        const stoppingDonePromise = this.performCleanupAndLogErrors();
        this.state = {
          phase: 'stopping',
          stoppingDonePromise,
        };
        await stoppingDonePromise;
        this.state = { phase: 'stopped' };
        return;
      case 'updating schema': {
        throw Error(
          "`ApolloGateway.stop` shouldn't be called from inside a schema change listener",
        );
      }
      default:
        throw new UnreachableCaseError(this.state);
    }
  }

  public __testing() {
    return {
      state: this.state,
      compositionId: (this.queryPlanManager as any).compositionId,
      supergraphSdl: this.supergraphSdl,
      queryPlanner: this.queryPlanner,
    };
  }
}

ApolloGateway.prototype.onSchemaChange = deprecate(
  ApolloGateway.prototype.onSchemaChange,
  `'ApolloGateway.prototype.onSchemaChange' is deprecated. Use 'ApolloGateway.prototype.onSchemaLoadOrUpdate' instead.`,
);

function approximateObjectSize<T>(obj: T): number {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

// Throw this in places that should be unreachable (because all other cases have
// been handled, reducing the type of the argument to `never`). TypeScript will
// complain if in fact there is a valid type for the argument.
class UnreachableCaseError extends Error {
  constructor(val: never) {
    super(`Unreachable case: ${val}`);
  }
}

export {
  executeQueryPlan,
  buildOperationContext,
  ServiceMap,
  Experimental_DidFailCompositionCallback,
  Experimental_DidResolveQueryPlanCallback,
  Experimental_DidUpdateSupergraphCallback,
  Experimental_UpdateComposition,
  GatewayConfig,
  ServiceEndpointDefinition,
  ServiceDefinition,
  CompositionInfo,
  IntrospectAndCompose,
  LocalCompose,
  UplinkSupergraphManager,
};

export * from './datasources';

export {
  SupergraphSdlUpdateFunction,
  SubgraphHealthCheckFunction,
  GetDataSourceFunction,
  SupergraphSdlHook,
  SupergraphManager,
} from './config';

export {
  UplinkFetcherError,
  FailureToFetchSupergraphSdlAfterInit,
  FailureToFetchSupergraphSdlDuringInit,
  FailureToFetchSupergraphSdlFunctionParams,
} from './supergraphManagers';
