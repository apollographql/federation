import { deprecate } from 'util';
import { GraphQLService, Unsubscriber } from 'apollo-server-core';
import {
  GraphQLExecutionResult,
  GraphQLRequestContextExecutionDidStart,
} from 'apollo-server-types';
import type { Logger } from '@apollo/utils.logger';
import { InMemoryLRUCache } from 'apollo-server-caching';
import {
  isObjectType,
  isIntrospectionType,
  GraphQLSchema,
  VariableDefinitionNode,
  DocumentNode,
  print,
  parse,
  Source,
} from 'graphql';
import { ServiceDefinition } from '@apollo/federation';
import loglevel from 'loglevel';
import { buildOperationContext, OperationContext } from './operationContext';
import {
  executeQueryPlan,
  ServiceMap,
  defaultFieldResolverWithAliasSupport,
} from './executeQueryPlan';
import {
  GraphQLDataSource,
  GraphQLDataSourceRequestKind,
} from './datasources/types';
import { RemoteGraphQLDataSource } from './datasources/RemoteGraphQLDataSource';
import { getVariableValues } from 'graphql/execution/values';
import fetcher from 'make-fetch-happen';
import { HttpRequestCache } from './cache';
import { fetch } from 'apollo-server-env';
import {
  QueryPlanner,
  QueryPlan,
  prettyFormatQueryPlan,
  toAPISchema,
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
  SupergraphSdlUpdate,
  isManuallyManagedSupergraphSdlGatewayConfig,
  ManagedGatewayConfig,
  isStaticSupergraphSdlConfig,
  SupergraphManager,
} from './config';
import { buildComposedSchema } from '@apollo/query-planner';
import { SpanStatusCode } from '@opentelemetry/api';
import { OpenTelemetrySpanNames, tracer } from './utilities/opentelemetry';
import { CoreSchema } from '@apollo/core-schema';
import { featureSupport } from './core';
import { createHash } from './utilities/createHash';
import {
  IntrospectAndCompose,
  UplinkFetcher,
  LegacyFetcher,
  LocalCompose,
} from './supergraphManagers';

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

export function getDefaultFetcher() {
  const { name, version } = require('../package.json');
  return fetcher.defaults({
    cacheManager: new HttpRequestCache(),
    // All headers should be lower-cased here, as `make-fetch-happen`
    // treats differently cased headers as unique (unlike the `Headers` object).
    // @see: https://git.io/JvRUa
    headers: {
      'apollographql-client-name': name,
      'apollographql-client-version': version,
      'user-agent': `${name}/${version}`,
      'content-type': 'application/json',
    },
    retry: {
      retries: 5,
      // The default factor: expected attempts at 0, 1, 3, 7, 15, and 31 seconds elapsed
      factor: 2,
      // 1 second
      minTimeout: 1000,
      randomize: true,
    },
  });
}

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

export class ApolloGateway implements GraphQLService {
  public schema?: GraphQLSchema;
  private serviceMap: DataSourceMap = Object.create(null);
  private config: GatewayConfig;
  private logger: Logger;
  private queryPlanStore: InMemoryLRUCache<QueryPlan>;
  private apolloConfig?: ApolloConfigFromAS3;
  private onSchemaChangeListeners = new Set<(schema: GraphQLSchema) => void>();
  private onSchemaLoadOrUpdateListeners = new Set<
    (schemaContext: {
      apiSchema: GraphQLSchema;
      coreSupergraphSdl: string;
    }) => void
  >();
  private warnedStates: WarnedStates = Object.create(null);
  private queryPlanner?: QueryPlanner;
  private supergraphSdl?: string;
  private parsedSupergraphSdl?: DocumentNode;
  private fetcher: typeof fetch;
  private compositionId?: string;
  private state: GatewayState;

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

    this.logger = this.initLogger();
    this.queryPlanStore = this.initQueryPlanStore(
      config?.experimental_approximateQueryPlanStoreMiB,
    );
    this.fetcher = config?.fetcher || getDefaultFetcher();

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
  }

  private initLogger() {
    // Setup logging facilities
    if (this.config.logger) {
      return this.config.logger;
    }

    // If the user didn't provide their own logger, we'll initialize one.
    const loglevelLogger = loglevel.getLogger(`apollo-gateway`);

    // And also support the `debug` option, if it's truthy.
    if (this.config.debug === true) {
      loglevelLogger.setLevel(loglevelLogger.levels.DEBUG);
    } else {
      loglevelLogger.setLevel(loglevelLogger.levels.WARN);
    }

    return loglevelLogger;
  }

  private initQueryPlanStore(approximateQueryPlanStoreMiB?: number) {
    return new InMemoryLRUCache<QueryPlan>({
      // Create ~about~ a 30MiB InMemoryLRUCache.  This is less than precise
      // since the technique to calculate the size of a DocumentNode is
      // only using JSON.stringify on the DocumentNode (and thus doesn't account
      // for unicode characters, etc.), but it should do a reasonable job at
      // providing a caching document store for most operations.
      maxSize: Math.pow(2, 20) * (approximateQueryPlanStoreMiB || 30),
      sizeCalculator: approximateObjectSize,
    });
  }

  private issueConfigurationWarningsIfApplicable() {
    // Warn against a pollInterval of < 10s in managed mode and reset it to 10s
    if (
      isManagedConfig(this.config) &&
      this.pollIntervalInMs &&
      this.pollIntervalInMs < 10000
    ) {
      this.pollIntervalInMs = 10000;
      this.logger.warn(
        'Polling Apollo services at a frequency of less than once per 10 ' +
          'seconds (10000) is disallowed. Instead, the minimum allowed ' +
          'pollInterval of 10000 will be used. Please reconfigure your ' +
          '`fallbackPollIntervalInMs` accordingly. If this is problematic for ' +
          'your team, please contact support.',
      );
    }

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

    // Handles initial assignment of `this.schema`, `this.queryPlanner`
    if (isStaticSupergraphSdlConfig(this.config)) {
      const supergraphSdl = this.config.supergraphSdl;
      await this.initializeSupergraphManager({
        initialize: async () => {
          return {
            supergraphSdl,
          };
        },
      });
    } else if (isLocalConfig(this.config)) {
      // TODO(trevor:removeServiceList)
      await this.initializeSupergraphManager(new LocalCompose({
        localServiceList: this.config.localServiceList,
        logger: this.logger,
      }));
    } else if (isManuallyManagedSupergraphSdlGatewayConfig(this.config)) {
      const supergraphManager = typeof this.config.supergraphSdl === 'object'
        ? this.config.supergraphSdl
        : { initialize: this.config.supergraphSdl };
      await this.initializeSupergraphManager(supergraphManager);
    } else if (
      'experimental_updateServiceDefinitions' in this.config || 'experimental_updateSupergraphSdl' in this.config
    ) {
      const updateServiceDefinitions =
        'experimental_updateServiceDefinitions' in this.config
          ? this.config.experimental_updateServiceDefinitions
          : this.config.experimental_updateSupergraphSdl;

      await this.initializeSupergraphManager(
        new LegacyFetcher({
          logger: this.logger,
          gatewayConfig: this.config,
          updateServiceDefinitions,
          pollIntervalInMs: this.pollIntervalInMs,
          subgraphHealthCheck: this.config.serviceHealthCheck,
        }),
      );
    } else if (isServiceListConfig(this.config)) {
      // TODO(trevor:removeServiceList)
      this.logger.warn(
        'The `serviceList` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to its replacement `IntrospectAndCompose`. More information on `IntrospectAndCompose` can be found in the documentation.',
      );
      await this.initializeSupergraphManager(
        new IntrospectAndCompose({
          subgraphs: this.config.serviceList,
          pollIntervalInMs: this.pollIntervalInMs,
          logger: this.logger,
          subgraphHealthCheck: this.config.serviceHealthCheck,
          introspectionHeaders: this.config.introspectionHeaders,
        }),
      );
    } else {
      // isManagedConfig(this.config)
      const canUseManagedConfig =
        this.apolloConfig?.graphRef && this.apolloConfig?.keyHash;
      if (!canUseManagedConfig) {
        throw new Error(
          'When a manual configuration is not provided, gateway requires an Apollo ' +
            'configuration. See https://www.apollographql.com/docs/apollo-server/federation/managed-federation/ ' +
            'for more information. Manual configuration options include: ' +
            '`serviceList`, `supergraphSdl`, and `experimental_updateServiceDefinitions`.',
        );
      }
      const uplinkEndpoints = this.getUplinkEndpoints(this.config);

      await this.initializeSupergraphManager(
        new UplinkFetcher({
          graphRef: this.apolloConfig!.graphRef!,
          apiKey: this.apolloConfig!.key!,
          uplinkEndpoints,
          maxRetries:
            this.config.uplinkMaxRetries ?? uplinkEndpoints.length * 3 - 1, // -1 for the initial request
          subgraphHealthCheck: this.config.serviceHealthCheck,
          fetcher: this.fetcher,
          logger: this.logger,
          fallbackPollIntervalInMs: this.pollIntervalInMs ?? 10000,
        }),
      );
    }

    const mode = isManagedConfig(this.config) ? 'managed' : 'unmanaged';
    this.logger.info(
      `Gateway successfully loaded schema.\n\t* Mode: ${mode}${
        this.apolloConfig && this.apolloConfig.graphRef
          ? `\n\t* Service: ${this.apolloConfig.graphRef}`
          : ''
      }`,
    );

    return {
      schema: this.schema!,
      executor: this.executor,
    };
  }

  private getUplinkEndpoints(config: ManagedGatewayConfig) {
    /**
     * Configuration priority order:
     * 1. `uplinkEndpoints` configuration option
     * 2. (deprecated) `schemaConfigDeliveryEndpoint` configuration option
     * 3. APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT environment variable
     * 4. default (GCP and AWS)
     */
    const rawEndpointsString =
      process.env.APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT;
    const envEndpoints = rawEndpointsString?.split(',') ?? null;
    return config.uplinkEndpoints ??
      (config.schemaConfigDeliveryEndpoint
        ? [config.schemaConfigDeliveryEndpoint]
        : null) ??
      envEndpoints ?? [
        'https://uplink.api.apollographql.com/',
        'https://aws.uplink.api.apollographql.com/',
      ];
  }

  private getIdForSupergraphSdl(supergraphSdl: string) {
    return createHash('sha256').update(supergraphSdl).digest('hex');
  }

  private async initializeSupergraphManager<T extends SupergraphManager>(
    supergraphManager: T,
  ) {
    try {
      const result = await supergraphManager.initialize({
        update: this.externalSupergraphUpdateCallback.bind(this),
        healthCheck: this.externalSubgraphHealthCheckCallback.bind(this),
        getDataSource: this.externalGetDataSourceCallback.bind(this),
      });
      if (!result?.supergraphSdl) {
        throw new Error(
          'Provided `supergraphSdl` function did not return an object containing a `supergraphSdl` property',
        );
      }
      if (result?.cleanup) {
        if (typeof result.cleanup === 'function') {
        this.toDispose.push(result.cleanup);
        } else {
          this.logger.error(
            'Provided `supergraphSdl` function returned an invalid `cleanup` property (must be a function)',
          );
        }
      }

      this.externalSupergraphUpdateCallback(result.supergraphSdl);
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
      this.updateWithSupergraphSdl({
        supergraphSdl,
        id: this.getIdForSupergraphSdl(supergraphSdl),
      });
    } finally {
      // if update fails, we still want to go back to `loaded` state
      this.state = { phase: 'loaded' };
    }
  }

  /**
   * @throws Error
   * when any subgraph fails the health check
   */
  private async externalSubgraphHealthCheckCallback(supergraphSdl: string) {
    const parsedSupergraphSdl =
      supergraphSdl === this.supergraphSdl
        ? this.parsedSupergraphSdl
        : parse(supergraphSdl);

    const serviceList = this.serviceListFromSupergraphSdl(parsedSupergraphSdl!);
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

  private updateWithSupergraphSdl({ supergraphSdl, id }: SupergraphSdlUpdate) {
    // TODO(trevor): #580 redundant parse
    // This may throw, so we'll calculate early (specifically before making any updates)
    // In the case that it throws, the gateway will:
    //   * on initial load, throw the error
    //   * on update, log the error and don't update
    const parsedSupergraphSdl = parse(supergraphSdl);

    const previousSchema = this.schema;
    const previousSupergraphSdl = this.parsedSupergraphSdl;
    const previousCompositionId = this.compositionId;

    if (previousSchema) {
      this.logger.info('Updated Supergraph SDL was found.');
    }

    this.compositionId = id;
    this.supergraphSdl = supergraphSdl;
    this.parsedSupergraphSdl = parsedSupergraphSdl;

    const { schema, supergraphSdl: generatedSupergraphSdl } =
      this.createSchemaFromSupergraphSdl(supergraphSdl);

    if (!generatedSupergraphSdl) {
      this.logger.error(
        "A valid schema couldn't be composed. Falling back to previous schema.",
      );
    } else {
      this.updateWithSchemaAndNotify(schema, generatedSupergraphSdl);

      if (this.experimental_didUpdateSupergraph) {
        this.experimental_didUpdateSupergraph(
          {
            compositionId: id,
            supergraphSdl,
            schema,
          },
          previousCompositionId && previousSupergraphSdl && previousSchema
            ? {
                compositionId: previousCompositionId,
                supergraphSdl: print(previousSupergraphSdl),
                schema: previousSchema,
              }
            : undefined,
        );
      }
    }
  }

  // TODO: We should consolidate "schema derived data" state as we've done in Apollo Server to
  //       ensure we do not forget to update some of that state, and to avoid scenarios where
  //       concurrently executing code sees partially-updated state.
  private updateWithSchemaAndNotify(
    coreSchema: GraphQLSchema,
    coreSupergraphSdl: string,
    // Once we remove the deprecated onSchemaChange() method, we can remove this.
    legacyDontNotifyOnSchemaChangeListeners: boolean = false,
  ): void {
    if (this.queryPlanStore) this.queryPlanStore.flush();
    this.schema = toAPISchema(coreSchema);
    this.queryPlanner = new QueryPlanner(coreSchema);

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
          coreSupergraphSdl,
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

  private serviceListFromSupergraphSdl(
    supergraphSdl: DocumentNode,
  ): Omit<ServiceDefinition, 'typeDefs'>[] {
    const schema = buildComposedSchema(supergraphSdl);
    return this.serviceListFromComposedSchema(schema);
  }

  private serviceListFromComposedSchema(schema: GraphQLSchema) {
    const graphMap = schema.extensions?.federation?.graphs;
    if (!graphMap) {
      throw Error(`Couldn't find graph map in composed schema`);
    }

    return Array.from(graphMap.values());
  }

  private createSchemaFromSupergraphSdl(supergraphSdl: string) {
    const core = CoreSchema.fromSource(
      new Source(supergraphSdl, 'supergraphSdl'),
    )
      .check() // run basic core schema compliance checks
      .check(featureSupport); // run supported feature check

    // TODO(trevor): #580 redundant parse
    this.parsedSupergraphSdl = core.document;

    const schema = buildComposedSchema(this.parsedSupergraphSdl);

    const serviceList = this.serviceListFromComposedSchema(schema);

    this.createServices(serviceList);

    return {
      schema: wrapSchemaWithAliasResolver(schema),
      supergraphSdl,
    };
  }

  /**
   * @deprecated Please use `onSchemaLoadOrUpdate` instead.
   */
  public onSchemaChange(
    callback: (schema: GraphQLSchema) => void,
  ): Unsubscriber {
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
  ): Unsubscriber {
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

  private createServices(services: ServiceEndpointDefinition[]) {
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
  public executor = async <TContext>(
    requestContext: GraphQLRequestContextExecutionDidStart<TContext>,
  ): Promise<GraphQLExecutionResult> => {
    const spanAttributes = requestContext.operationName
      ? { operationName: requestContext.operationName }
      : {};

    return tracer.startActiveSpan(
      OpenTelemetrySpanNames.REQUEST,
      { attributes: spanAttributes },
      async (span) => {
        try {
          const { request, document, queryHash } = requestContext;
          const queryPlanStoreKey = queryHash + (request.operationName || '');
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

          let queryPlan: QueryPlan | undefined;
          if (this.queryPlanStore) {
            queryPlan = await this.queryPlanStore.get(queryPlanStoreKey);
          }

          if (!queryPlan) {
            queryPlan = tracer.startActiveSpan(
              OpenTelemetrySpanNames.PLAN,
              (span) => {
                try {
                  // TODO(#631): Can we be sure the query planner has been initialized here?
                  return this.queryPlanner!.buildQueryPlan(operationContext, {
                    autoFragmentization: Boolean(
                      this.config.experimental_autoFragmentization,
                    ),
                  });
                } catch (err) {
                  span.setStatus({ code: SpanStatusCode.ERROR });
                  throw err;
                } finally {
                  span.end();
                }
              },
            );

            if (this.queryPlanStore) {
              // The underlying cache store behind the `documentStore` returns a
              // `Promise` which is resolved (or rejected), eventually, based on the
              // success or failure (respectively) of the cache save attempt.  While
              // it's certainly possible to `await` this `Promise`, we don't care about
              // whether or not it's successful at this point.  We'll instead proceed
              // to serve the rest of the request and just hope that this works out.
              // If it doesn't work, the next request will have another opportunity to
              // try again.  Errors will surface as warnings, as appropriate.
              //
              // While it shouldn't normally be necessary to wrap this `Promise` in a
              // `Promise.resolve` invocation, it seems that the underlying cache store
              // is returning a non-native `Promise` (e.g. Bluebird, etc.).
              Promise.resolve(
                this.queryPlanStore.set(queryPlanStoreKey, queryPlan),
              ).catch((err) =>
                this.logger.warn(
                  'Could not store queryPlan' + ((err && err.message) || err),
                ),
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

          const response = await executeQueryPlan<TContext>(
            queryPlan,
            serviceMap,
            requestContext,
            operationContext,
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

  private validateIncomingRequest<TContext>(
    requestContext: GraphQLRequestContextExecutionDidStart<TContext>,
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
    if (this.toDispose.length === 0) return;

    await Promise.all(
      this.toDispose.map((p) =>
        p().catch((e) => {
          this.logger.error(
            'Error occured while calling user provided `cleanup` function: ' +
              (e.message ?? e),
          );
        }),
      ),
    );
    this.toDispose = [];
  }

  // Stops all processes involved with the gateway. Can be called multiple times
  // safely. Once it (async) returns, all gateway background activity will be finished.
  public async stop() {
    switch (this.state.phase) {
      case 'initialized':
      case 'failed to load':
        throw Error(
          'ApolloGateway.stop does not need to be called before ApolloGateway.load is called successfully',
        );
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
          '`ApolloGateway.stop` shouldn\'t be called from inside a schema change listener',
        );
      }
      default:
        throw new UnreachableCaseError(this.state);
    }
  }

  public __testing() {
    return {
      state: this.state,
      compositionId: this.compositionId,
      supergraphSdl: this.supergraphSdl,
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
  CompositionInfo,
  IntrospectAndCompose,
  LocalCompose,
};

export * from './datasources';

export {
  SupergraphSdlUpdateFunction,
  SubgraphHealthCheckFunction,
  GetDataSourceFunction,
  SupergraphSdlHook,
  SupergraphManager
} from './config';

export { UplinkFetcherError } from "./supergraphManagers"

