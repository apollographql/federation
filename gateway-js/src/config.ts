import { GraphQLError, GraphQLSchema } from 'graphql';
import { HeadersInit } from 'node-fetch';
import { GraphQLRequestContextExecutionDidStart } from 'apollo-server-types';
import type { Logger } from '@apollo/utils.logger';
import { ServiceDefinition } from '@apollo/federation';
import { GraphQLDataSource } from './datasources/types';
import { QueryPlan } from '@apollo/query-planner';
import { OperationContext } from './operationContext';
import { ServiceMap } from './executeQueryPlan';
import { Fetcher } from '@apollo/utils.fetcher';

export type ServiceEndpointDefinition = Pick<ServiceDefinition, 'name' | 'url'>;

export type Experimental_DidResolveQueryPlanCallback = ({
  queryPlan,
  serviceMap,
  operationContext,
  requestContext,
}: {
  readonly queryPlan: QueryPlan;
  readonly serviceMap: ServiceMap;
  readonly operationContext: OperationContext;
  readonly requestContext: GraphQLRequestContextExecutionDidStart<
    Record<string, any>
  >;
}) => void;

interface ImplementingServiceLocation {
  name: string;
  path: string;
}

export interface CompositionMetadata {
  formatVersion: number;
  id: string;
  implementingServiceLocations: ImplementingServiceLocation[];
  schemaHash: string;
}

export type Experimental_DidFailCompositionCallback = ({
  errors,
  serviceList,
  compositionMetadata,
}: {
  readonly errors: GraphQLError[];
  readonly serviceList: ServiceDefinition[];
  readonly compositionMetadata?: CompositionMetadata;
}) => void;

export interface ServiceDefinitionCompositionInfo {
  serviceDefinitions: ServiceDefinition[];
  schema: GraphQLSchema;
  compositionMetadata?: CompositionMetadata;
}

export interface SupergraphSdlCompositionInfo {
  schema: GraphQLSchema;
  compositionId: string;
  supergraphSdl: string;
}

export type CompositionInfo =
  | ServiceDefinitionCompositionInfo
  | SupergraphSdlCompositionInfo;

export type Experimental_DidUpdateSupergraphCallback = (
  currentConfig: CompositionInfo,
  previousConfig?: CompositionInfo,
) => void;

export type CompositionUpdate = ServiceDefinitionUpdate | SupergraphSdlUpdate;

export interface ServiceDefinitionUpdate {
  serviceDefinitions?: ServiceDefinition[];
  compositionMetadata?: CompositionMetadata;
  isNewSchema: boolean;
}

export interface SupergraphSdlUpdate {
  id: string;
  supergraphSdl: string;
  minDelaySeconds?: number;
}

export function isSupergraphSdlUpdate(
  update: CompositionUpdate,
): update is SupergraphSdlUpdate {
  return 'supergraphSdl' in update;
}

export function isServiceDefinitionUpdate(
  update: CompositionUpdate,
): update is ServiceDefinitionUpdate {
  return 'isNewSchema' in update;
}

/**
 * **Note:** It's possible for a schema to be the same (`isNewSchema: false`) when
 * `serviceDefinitions` have changed. For example, during type migration, the
 * composed schema may be identical but the `serviceDefinitions` would differ
 * since a type has moved from one service to another.
 */
export type Experimental_UpdateServiceDefinitions = (
  config: DynamicGatewayConfig,
) => Promise<ServiceDefinitionUpdate>;

export type Experimental_UpdateSupergraphSdl = (
  config: DynamicGatewayConfig,
) => Promise<SupergraphSdlUpdate>;

export type Experimental_UpdateComposition = (
  config: DynamicGatewayConfig,
) => Promise<CompositionUpdate>;

interface GatewayConfigBase {
  debug?: boolean;
  logger?: Logger;
  // TODO: expose the query plan in a more flexible JSON format in the future
  // and remove this config option in favor of `exposeQueryPlan`. Playground
  // should cutover to use the new option when it's built.
  __exposeQueryPlanExperimental?: boolean;
  buildService?: (definition: ServiceEndpointDefinition) => GraphQLDataSource;

  // experimental observability callbacks
  experimental_didResolveQueryPlan?: Experimental_DidResolveQueryPlanCallback;
  experimental_didUpdateSupergraph?: Experimental_DidUpdateSupergraphCallback;
  experimental_approximateQueryPlanStoreMiB?: number;
  experimental_autoFragmentization?: boolean;
  fetcher?: Fetcher;
  serviceHealthCheck?: boolean;
}

// TODO(trevor:removeServiceList)
export interface ServiceListGatewayConfig extends GatewayConfigBase {
  /**
   * @deprecated: use `supergraphSdl: new IntrospectAndCompose(...)` instead
   */
  serviceList: ServiceEndpointDefinition[];
  /**
   * @deprecated: use `supergraphSdl: new IntrospectAndCompose(...)` instead
   */
  introspectionHeaders?:
    | HeadersInit
    | ((
        service: ServiceEndpointDefinition,
      ) => Promise<HeadersInit> | HeadersInit);
  pollIntervalInMs?: number;
}

export interface ManagedGatewayConfig extends GatewayConfigBase {
  /**
   * This configuration option shouldn't be used unless by recommendation from
   * Apollo staff.
   *
   * @deprecated: use `uplinkEndpoints` instead
   */
  schemaConfigDeliveryEndpoint?: string;
  /**
   * This defaults to:
   * ['https://uplink.api.apollographql.com/', 'https://aws.uplink.api.apollographql.com/']
   * The first URL points to GCP, the second to AWS. This option should most likely
   * be left to default unless you have a specific reason to change it.
   */
  uplinkEndpoints?: string[];
  uplinkMaxRetries?: number;
  /**
   * @deprecated use `fallbackPollIntervalInMs` instead
   */
  pollIntervalInMs?: number;
  fallbackPollIntervalInMs?: number;
}

// TODO(trevor:removeServiceList): migrate users to `supergraphSdl` function option
interface ManuallyManagedServiceDefsGatewayConfig extends GatewayConfigBase {
  /**
   * @deprecated: use `supergraphSdl` instead (either as a `SupergraphSdlHook` or `SupergraphManager`)
   */
  experimental_updateServiceDefinitions: Experimental_UpdateServiceDefinitions;
  pollIntervalInMs?: number;
}

// TODO(trevor:removeServiceList): migrate users to `supergraphSdl` function option
interface ExperimentalManuallyManagedSupergraphSdlGatewayConfig
  extends GatewayConfigBase {
  /**
   * @deprecated: use `supergraphSdl` instead (either as a `SupergraphSdlHook` or `SupergraphManager`)
   */
  experimental_updateSupergraphSdl: Experimental_UpdateSupergraphSdl;
  pollIntervalInMs?: number;
}

export function isManuallyManagedSupergraphSdlGatewayConfig(
  config: GatewayConfig,
): config is ManuallyManagedSupergraphSdlGatewayConfig {
  return isSupergraphSdlHookConfig(config) || isSupergraphManagerConfig(config);
}

export type SupergraphSdlUpdateFunction = (
  updatedSupergraphSdl: string,
) => void;

export type SubgraphHealthCheckFunction = (
  supergraphSdl: string,
) => Promise<void>;

export type GetDataSourceFunction = ({
  name,
  url,
}: ServiceEndpointDefinition) => GraphQLDataSource;

export interface SupergraphSdlHookOptions {
  update: SupergraphSdlUpdateFunction;
  healthCheck: SubgraphHealthCheckFunction;
  getDataSource: GetDataSourceFunction;
}
export interface SupergraphSdlHook {
  (options: SupergraphSdlHookOptions): Promise<{
    supergraphSdl: string;
    cleanup?: () => Promise<void>;
  }>;
}

export interface SupergraphManager {
  initialize: SupergraphSdlHook;
}

type ManuallyManagedSupergraphSdlGatewayConfig =
  | SupergraphSdlHookGatewayConfig
  | SupergraphManagerGatewayConfig;

export interface SupergraphSdlHookGatewayConfig extends GatewayConfigBase {
  supergraphSdl: SupergraphSdlHook;
}

export interface SupergraphManagerGatewayConfig extends GatewayConfigBase {
  supergraphSdl: SupergraphManager;
}

type ManuallyManagedGatewayConfig =
  | ManuallyManagedServiceDefsGatewayConfig
  | ExperimentalManuallyManagedSupergraphSdlGatewayConfig
  | ManuallyManagedSupergraphSdlGatewayConfig
  // TODO(trevor:removeServiceList)
  | ServiceListGatewayConfig;

// TODO(trevor:removeServiceList)
interface LocalGatewayConfig extends GatewayConfigBase {
  /**
   * @deprecated: use `supergraphSdl: new LocalCompose(...)` instead
   */
  localServiceList: ServiceDefinition[];
}

interface StaticSupergraphSdlGatewayConfig extends GatewayConfigBase {
  supergraphSdl: string;
}

export type StaticGatewayConfig =
  | LocalGatewayConfig
  | StaticSupergraphSdlGatewayConfig;

export type DynamicGatewayConfig =
  | ManagedGatewayConfig
  | ManuallyManagedGatewayConfig;

export type GatewayConfig = StaticGatewayConfig | DynamicGatewayConfig;

// TODO(trevor:removeServiceList)
export function isLocalConfig(
  config: GatewayConfig,
): config is LocalGatewayConfig {
  return 'localServiceList' in config;
}

// TODO(trevor:removeServiceList)
export function isServiceListConfig(
  config: GatewayConfig,
): config is ServiceListGatewayConfig {
  return 'serviceList' in config;
}

export function isStaticSupergraphSdlConfig(
  config: GatewayConfig,
): config is StaticSupergraphSdlGatewayConfig {
  return 'supergraphSdl' in config && typeof config.supergraphSdl === 'string';
}

export function isSupergraphSdlHookConfig(
  config: GatewayConfig,
): config is SupergraphSdlHookGatewayConfig {
  return (
    'supergraphSdl' in config && typeof config.supergraphSdl === 'function'
  );
}

export function isSupergraphManagerConfig(
  config: GatewayConfig,
): config is SupergraphManagerGatewayConfig {
  return (
    'supergraphSdl' in config &&
    typeof config.supergraphSdl === 'object' &&
    'initialize' in config.supergraphSdl
  );
}

// A manually managed config means the user has provided a function which
// handles providing service definitions to the gateway.
export function isManuallyManagedConfig(
  config: GatewayConfig,
): config is ManuallyManagedGatewayConfig {
  return (
    isManuallyManagedSupergraphSdlGatewayConfig(config) ||
    'experimental_updateServiceDefinitions' in config ||
    'experimental_updateSupergraphSdl' in config ||
    // TODO(trevor:removeServiceList)
    isServiceListConfig(config)
  );
}

// Managed config strictly means managed by Studio
export function isManagedConfig(
  config: GatewayConfig,
): config is ManagedGatewayConfig {
  return (
    'schemaConfigDeliveryEndpoint' in config ||
    'uplinkEndpoints' in config ||
    'fallbackPollIntervalInMs' in config ||
    (!isLocalConfig(config) &&
      !isStaticSupergraphSdlConfig(config) &&
      !isManuallyManagedConfig(config))
  );
}

// A static config is one which loads synchronously on start and never updates
export function isStaticConfig(
  config: GatewayConfig,
): config is StaticGatewayConfig {
  return isLocalConfig(config) || isStaticSupergraphSdlConfig(config);
}
