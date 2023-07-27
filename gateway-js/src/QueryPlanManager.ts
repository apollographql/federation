import { GatewayApolloConfig } from "@apollo/server-gateway-interface";
import { GatewayConfig, GetDataSourceFunction, IntrospectAndCompose, LocalCompose, RemoteGraphQLDataSource, SubgraphHealthCheckFunction, SupergraphManager, SupergraphSdlUpdateFunction, UplinkSupergraphManager } from ".";
import { SupergraphSdlHookOptions, SupergraphSdlUpdate, isLocalConfig, isManuallyManagedSupergraphSdlGatewayConfig, isServiceListConfig, isStaticSupergraphSdlConfig } from "./config";
import { LegacyFetcher } from "./supergraphManagers";
import { Logger } from "@apollo/utils.logger";
import { assert } from "./utilities/assert";
import { createHash } from "@apollo/utils.createhash";
import {
  Operation,
  Schema,
  Supergraph,
  operationFromDocument,
  buildSchema as buildFederationSchema,
} from '@apollo/federation-internals';
import { GraphQLSchema, buildSchema } from "graphql";
import { IQueryPlanner, QueryPlan, QueryPlanner } from "@apollo/query-planner";
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { print, parse } from 'graphql';

interface ApolloConfigFromAS2Or3 {
  key?: string;
  keyHash?: string;
  graphRef?: string;
  graphId?: string;
  graphVariant?: string;
}

export class QueryPlanManager implements IQueryPlanner {
  worker: WorkerFacade | undefined;

  constructor(
    private config: GatewayConfig,
    private pollIntervalInMs: number | undefined,
    private logger: Logger,
  ) {}

  private apolloConfig: GatewayApolloConfig | undefined;

  private supergraphManager: SupergraphManager | undefined;
  // private supergraphSdl: string | undefined;
  private compositionId: string | undefined;

  private schema: GraphQLSchema | undefined;
  private supergraph: Supergraph | undefined;
  private supergraphSchema: GraphQLSchema | undefined;
  private subgraphs: readonly { name: string; url: string }[] | undefined;

  private queryPlanner: IQueryPlanner | undefined;

  private toDispose: (() => Promise<void>)[] = [];

  async createSupergraphManager(apollo: ApolloConfigFromAS2Or3 | undefined): Promise<SupergraphManager> {
    this.apolloConfig = apollo;

    // Handles initial assignment of `this.schema`, `this.queryPlanner`
    if (isStaticSupergraphSdlConfig(this.config)) {
      const supergraphSdl = this.config.supergraphSdl;
      this.supergraphManager = {
        initialize: async () => {
          return {
            supergraphSdl,
          };
        },
      };
    } else if (isLocalConfig(this.config)) {
      // TODO(trevor:removeServiceList)
      this.supergraphManager = new LocalCompose({
        localServiceList: this.config.localServiceList,
        logger: this.logger,
      });
    } else if (isManuallyManagedSupergraphSdlGatewayConfig(this.config)) {
      const supergraphManager =
        typeof this.config.supergraphSdl === 'object'
          ? this.config.supergraphSdl
          : { initialize: this.config.supergraphSdl };
      this.supergraphManager = supergraphManager;
    } else if (
      'experimental_updateServiceDefinitions' in this.config ||
      'experimental_updateSupergraphSdl' in this.config
    ) {
      const updateServiceDefinitions =
        'experimental_updateServiceDefinitions' in this.config
          ? this.config.experimental_updateServiceDefinitions
          : this.config.experimental_updateSupergraphSdl;

      this.supergraphManager = new LegacyFetcher({
        logger: this.logger,
        gatewayConfig: this.config,
        updateServiceDefinitions,
        pollIntervalInMs: this.pollIntervalInMs,
        subgraphHealthCheck: this.config.serviceHealthCheck,
      });
    } else if (isServiceListConfig(this.config)) {
      // TODO(trevor:removeServiceList)
      this.logger.warn(
        'The `serviceList` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to its replacement `IntrospectAndCompose`. More information on `IntrospectAndCompose` can be found in the documentation.',
      );
      this.supergraphManager = new IntrospectAndCompose({
        subgraphs: this.config.serviceList,
        pollIntervalInMs: this.pollIntervalInMs,
        logger: this.logger,
        subgraphHealthCheck: this.config.serviceHealthCheck,
        introspectionHeaders: this.config.introspectionHeaders,
      });
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

      const schemaDeliveryEndpoints: string[] | undefined = this.config
        .schemaConfigDeliveryEndpoint
        ? [this.config.schemaConfigDeliveryEndpoint]
        : undefined;


      this.worker = await WorkerFacade.create();

      this.supergraphManager = await this.worker.createUplinkManager({
        graphRef: this.apolloConfig!.graphRef!,
        apiKey: this.apolloConfig!.key!,
        shouldRunSubgraphHealthcheck: this.config.serviceHealthCheck,
        uplinkEndpoints: this.config.uplinkEndpoints ?? schemaDeliveryEndpoints,
        maxRetries: this.config.uplinkMaxRetries,
        // fetcher: this.config.fetcher,
        // logger: this.logger,
        fallbackPollIntervalInMs: this.pollIntervalInMs,
      });
    }

    return this.supergraphManager;
  }

  async initializeSupergraphManager({
    update,
    healthCheck,
    getDataSource,
  }: {
    update: SupergraphSdlUpdateFunction;
    healthCheck: SubgraphHealthCheckFunction;
    getDataSource: GetDataSourceFunction;
  }) {
    assert(this.supergraphManager, 'supergraphManager must be defined');

    const result = await this.supergraphManager.initialize({
      update: (supergraphSdl) => {
        this.updateWithSupergraphSdl({
          supergraphSdl,
          id: getIdForSupergraphSdl(supergraphSdl),
        });

        update(supergraphSdl);
      },
      healthCheck,
      getDataSource,
    });

    if (result?.cleanup) {
      if (typeof result.cleanup === 'function') {
        this.toDispose.push(result.cleanup);
      } else {
        this.logger.error(
          'Provided `supergraphSdl` function returned an invalid `cleanup` property (must be a function)',
        );
      }
    }

    this.updateWithSupergraphSdl({
      supergraphSdl: result.supergraphSdl,
      id: getIdForSupergraphSdl(result.supergraphSdl),
    });
    update(result.supergraphSdl);

    return result;
  }

  private updateWithSupergraphSdl(result: SupergraphSdlUpdate) {
    if (result.id === this.compositionId) {
      this.logger.debug('No change in composition since last check.');
      return;
    }

    assert(this.supergraphManager, 'supergraphManager must be defined');

    const { supergraph, supergraphSchema, supergraphSdl, subgraphs } =
      this.createSchemaFromSupergraphSdl(result.supergraphSdl);

    const previousSchema = this.schema;

    if (previousSchema) {
      this.logger.info(
        `Updated Supergraph SDL was found [Composition ID ${this.compositionId} => ${result.id}]`,
      );
    }

    if (!supergraphSdl) {
      this.logger.error(
        "A valid schema couldn't be composed. Falling back to previous schema.",
      );
    } else {
      this.compositionId = result.id;

      this.supergraph = supergraph;
      this.supergraphSchema = supergraphSchema;
      this.subgraphs = subgraphs;

      this.updateWithSchemaAndNotify();
    }
  }

  private createSchemaFromSupergraphSdl(supergraphSdl: string) {
    if (this.worker && this.worker.schemas) {
      return {
        supergraphSdl: this.worker.schemas.supergraphSdl,
        supergraphSchema: buildSchema(this.worker.schemas.supergraphSdl),
        subgraphs: this.worker.schemas.subgraphs,
      };
    } else {
      console.log('THIS IS THE PART WE NEED TO REMOVE');
      const validateSupergraph =
        this.config.validateSupergraph ?? process.env.NODE_ENV !== 'production';
      const supergraph = Supergraph.build(supergraphSdl, { validateSupergraph });
      const supergraphSchema = supergraph.schema.toGraphQLJSSchema();
      const subgraphs = supergraph.subgraphsMetadata();

      return {
        supergraph,
        supergraphSchema,
        supergraphSdl,
        subgraphs,
      };
    }
  }

  private updateWithSchemaAndNotify() {
    if (this.worker) {
      this.queryPlanner = this.worker;
    } else {
      assert(this.supergraph, 'supergraph must be defined');
      this.queryPlanner = new QueryPlanner(
        this.supergraph,
        this.config.queryPlannerConfig,
      );
    }
  }

  public async buildQueryPlan(operation: Operation): Promise<QueryPlan> {
    assert(this.queryPlanner, 'queryPlanner must be defined');
    return this.queryPlanner.buildQueryPlan(operation);
  }

  schemas(): {
    apiSchema: Schema;
    schema: GraphQLSchema;
    supergraphSchema: GraphQLSchema;
    subgraphs: readonly { name: string; url: string }[];
  } {
    if (this.worker && this.worker.schemas) {
      const apiSchema = buildFederationSchema(this.worker.schemas.apiSchemaSdl);
      return {
        apiSchema,
        schema: apiSchema.toGraphQLJSSchema(),
        supergraphSchema: buildSchema(this.worker.schemas.supergraphSdl),
        subgraphs: this.worker.schemas.subgraphs,
      }
    } else {
      assert(this.supergraph, 'supergraph must be defined');
      assert(this.supergraphSchema, 'supergraphSchema must be defined');
      assert(this.subgraphs, 'subgraphs must be defined');
      const apiSchema = this.supergraph?.apiSchema();
      return {
        apiSchema,
        schema: apiSchema.toGraphQLJSSchema(),
        supergraphSchema: this.supergraphSchema,
        subgraphs: this.subgraphs,
      };
    }

  }

  public async dispose() {
    await Promise.all(this.toDispose.map((dispose) => dispose()));
  }
}

function getIdForSupergraphSdl(supergraphSdl: string) {
  return createHash('sha256').update(supergraphSdl).digest('hex');
}

interface UplinkUpdate {
  supergraphSdl: string;
  apiSchemaSdl: string;
  subgraphs: readonly { name: string; url: string }[];
}

class WorkerFacade implements SupergraphManager, IQueryPlanner {
  static async create() {
    const worker = new Worker(__filename);
    const facade = new WorkerFacade(worker);

    await new Promise<WorkerFacade>((resolve, reject) => {
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });

      worker.once('message', (message) => {
        console.log('worker.once(message)', message);
        if (message.isReady) {
          resolve(facade);
        } else {
          assert(false, `invalid startup message: ${message}`);
        }
      });
    });

    worker.on('message', (message) => {
      if (message.nonce) {
        facade.#nonceListeners.get(message.nonce)?.(message);
        facade.#nonceListeners.delete(message.nonce);
      } else if (message.type === 'nextUplinkManagerResult') {
        facade.schemas = message.payload;
        assert(facade.updater, 'updater must be defined');
        facade.updater(message.payload.supergraphSdl);
      }
    });

    return facade;
  }

  #nonceListeners = new Map<string, (message: unknown) => void>();

  constructor(private worker: Worker) {}

  schemas: UplinkUpdate | undefined;
  updater: SupergraphSdlUpdateFunction | undefined;

  async createUplinkManager(
    options: ConstructorParameters<typeof UplinkSupergraphManager>[0],
  ) {
    const nonce = makeNonce();

    const { resolve, promise } = defer();

    this.#nonceListeners.set(nonce, (message) => {
      assertMessageType(message, 'createUplinkManagerResult');
      if (message.error) {
        throw new Error(message.error);
      }
      resolve(void 0);
    });

    this.worker.postMessage({
      type: 'createUplinkManager',
      options,
      nonce,
    });

    await promise;

    return this;
  }

  async initialize(options: SupergraphSdlHookOptions): Promise<{
    supergraphSdl: string;
    cleanup?: () => Promise<void>;
  }> {
    const nonce = makeNonce();

    const { resolve, promise } =
      defer<Message<'initializeUplinkManagerResult', UplinkUpdate>>();

    this.#nonceListeners.set(nonce, (message) => {
      console.log('initializeUplinkManagerResult');
      assertMessageType(message, 'initializeUplinkManagerResult');
      if (message.error) {
        throw new Error(message.error);
      }
      resolve(
        message as Message<'initializeUplinkManagerResult', UplinkUpdate>,
      );
    });

    this.worker.postMessage({
      type: 'initializeUplinkManager',
      nonce,
    });

    const result = await promise;

    this.schemas = result.payload;

    this.updater = options.update;
    return {
      supergraphSdl: result.payload.supergraphSdl,
    };
  }

  async buildQueryPlan(operation: Operation): Promise<QueryPlan> {
    const nonce = makeNonce();

    const { resolve, promise } =
      defer<Message<'buildQueryPlanResult', { queryPlanJSON: string }>>();

    this.#nonceListeners.set(nonce, (message) => {
      assertMessageType(message, 'buildQueryPlanResult');
      if (message.error) {
        throw new Error(message.error);
      }
      resolve(
        message as Message<'buildQueryPlanResult', { queryPlanJSON: string }>,
      );
    });

    this.worker.postMessage({
      type: 'buildQueryPlan',
      operation: operation.toString(),
      nonce,
    });

    const message = await promise;

    return JSON.parse(message.payload.queryPlanJSON) as QueryPlan;
  }
}

if (!isMainThread) {
  assert(parentPort, 'parentPort must be defined');
  parentPort.postMessage({ isReady: true });

  let uplinkManager: UplinkSupergraphManager | undefined;
  let supergraphSdl: string | undefined;
  let supergraph: Supergraph | undefined;
  let apiSchema: Schema | undefined;
  let schema: GraphQLSchema | undefined;
  let supergraphSchema: GraphQLSchema | undefined;
  let subgraphs: readonly { name: string; url: string }[] | undefined;
  let apiSchemaSdl: string | undefined;
  let queryPlanner: QueryPlanner | undefined;

  parentPort.on('message', async (message) => {
    switch (message.type) {
      case 'createUplinkManager': {
        console.log('createUplinkManager in worker thread');
        assert(parentPort, 'parentPort must be defined');
        uplinkManager = new UplinkSupergraphManager(message.options);
        parentPort.postMessage({ nonce: message.nonce, type: 'createUplinkManagerResult', error: null });
      }
      break;

      case 'initializeUplinkManager': {
        console.log('initializeUplinkManager in worker thread');
        assert(parentPort, 'parentPort must be defined');
        assert(uplinkManager, 'uplinkManager must be defined');

        const update = (_supergraphSdl: string) => {
          supergraphSdl = _supergraphSdl;

          supergraph = Supergraph.build(supergraphSdl);
          apiSchema = supergraph.apiSchema();
          schema = apiSchema.toGraphQLJSSchema();
          supergraphSchema = supergraph.schema.toGraphQLJSSchema();
          subgraphs = supergraph.subgraphsMetadata();

          apiSchemaSdl = print(apiSchema.toAST());

          queryPlanner = new QueryPlanner(supergraph);
        };

        const result = await uplinkManager.initialize({
          update: (supergraphSdl) => {
            console.log('received supergraph update in worker thread');
            update(supergraphSdl);

            assert(parentPort, 'parentPort must be defined');
            parentPort.postMessage({
              type: 'nextUplinkManagerResult',
              error: null,
              payload: {
                supergraphSdl,
                apiSchemaSdl,
                subgraphs,
              },
            });
          },
          healthCheck: async () => { return; },
          getDataSource: ({ url }) => {
            return new RemoteGraphQLDataSource({ url });
          }
        });

        update(result.supergraphSdl);

        parentPort.postMessage({
          nonce: message.nonce,
          type: 'initializeUplinkManagerResult',
          error: null,
          payload: {
            supergraphSdl,
            apiSchemaSdl,
            subgraphs,
          },
        });
      }
      break;

      case 'buildQueryPlan': {
        assert(parentPort, 'parentPort must be defined');
        assert(queryPlanner, 'queryPlanner must be defined');
        assert(supergraph, 'supergraph must be defined');

        console.log('buildQueryPlan in worker thread');

        try {
          const operation = operationFromDocument(supergraph.schema, parse(message.operation));

          const queryPlan = await queryPlanner.buildQueryPlan(operation);

          parentPort.postMessage({
            nonce: message.nonce,
            type: 'buildQueryPlanResult',
            error: null,
            payload: {
              queryPlanJSON: JSON.stringify(queryPlan),
            }
          });
        } catch (error) {
          console.log(error);
          parentPort.postMessage({
            nonce: message.nonce,
            type: 'buildQueryPlanResult',
            error: null,
            payload: {
              queryPlanJSON: JSON.stringify({}),
            },
          });
        }
      }
      break;

      case 'whatever': {
        console.log(schema);
        console.log(supergraphSchema);
        console.log(queryPlanner);
      }
      break;

      default:
        throw new Error(`invalid message type: ${message.type}`);
    }
  });
}

function defer<T>(): { resolve: (_: T) => void; promise: Promise<T> } {
  let resolve;
  const promise = new Promise<T>((_resolve) => { resolve = _resolve; });
  return { promise, resolve: resolve! };
}

let nonce = 0;
function makeNonce() {
  return `${nonce++}`;
}

interface Message<Type extends string, Payload> {
  type: Type;
  nonce?: string;
  error?: string;
  payload: Payload;
}

function assertMessageType<P>(message: unknown, type: string): asserts message is Message<typeof type, P> {
  if (!message || typeof message !== 'object' || !("type" in message) || message.type !== type) {
    assert(false, `invalid message: ${message}`);
  }
}
