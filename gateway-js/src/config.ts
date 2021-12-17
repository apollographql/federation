import { GraphQLError, GraphQLSchema } from 'graphql';
import { HeadersInit } from 'node-fetch';
import { fetch } from 'apollo-server-env';
import {
  GraphQLRequestContextExecutionDidStart,
  Logger,
} from 'apollo-server-types';
import { ServiceDefinition } from '@apollo/federation';
import { GraphQLDataSource } from './datasources/types';
import { QueryPlan } from '@apollo/query-planner';
import { OperationContext } from './operationContext';
import { ServiceMap } from './executeQueryPlan';

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

export type Experimental_DidUpdateCompositionCallback = (
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
  experimental_didFailComposition?: Experimental_DidFailCompositionCallback;
  experimental_didUpdateComposition?: Experimental_DidUpdateCompositionCallback;
  experimental_pollInterval?: number;
  experimental_approximateQueryPlanStoreMiB?: number;
  experimental_autoFragmentization?: boolean;
  fetcher?: typeof fetch;
  serviceHealthCheck?: boolean;
}

// TODO(trevor:removeServiceList)
export interface RemoteGatewayConfig extends GatewayConfigBase {
  // @deprecated: use `supergraphSdl` in its function form instead
  serviceList: ServiceEndpointDefinition[];
  // @deprecated: use `supergraphSdl` in its function form instead
  introspectionHeaders?:
    | HeadersInit
    | ((
        service: ServiceEndpointDefinition,
      ) => Promise<HeadersInit> | HeadersInit);
}

export interface ManagedGatewayConfig extends GatewayConfigBase {
  /**
   * This configuration option shouldn't be used unless by recommendation from
   * Apollo staff.
   */
  schemaConfigDeliveryEndpoint?: string; // deprecated
  uplinkEndpoints?: string[];
  uplinkMaxRetries?: number;
}

// TODO(trevor:removeServiceList): migrate users to `supergraphSdl` function option
interface ManuallyManagedServiceDefsGatewayConfig extends GatewayConfigBase {
  // @deprecated: use `supergraphSdl` in its function form instead
  experimental_updateServiceDefinitions: Experimental_UpdateServiceDefinitions;
}

// TODO(trevor:removeServiceList): migrate users to `supergraphSdl` function option
interface ExperimentalManuallyManagedSupergraphSdlGatewayConfig
  extends GatewayConfigBase {
  // @deprecated: use `supergraphSdl` in its function form instead
  experimental_updateSupergraphSdl: Experimental_UpdateSupergraphSdl;
}

export function isManuallyManagedSupergraphSdlGatewayConfig(
  config: GatewayConfig,
): config is ManuallyManagedSupergraphSdlGatewayConfig {
  return (
    'supergraphSdl' in config && typeof config.supergraphSdl === 'function'
  );
}

export type SupergraphSdlUpdateFunction = (updatedSupergraphSdl: string) => void;

export type SubgraphHealthCheckFunction = (supergraphSdl: string) => Promise<void>;

export type GetDataSourceFunction = ({
  name,
  url,
}: ServiceEndpointDefinition) => GraphQLDataSource;

export interface SupergraphSdlHook {
  (options: {
    update: SupergraphSdlUpdateFunction;
    healthCheck: SubgraphHealthCheckFunction;
    getDataSource: GetDataSourceFunction;
  }): Promise<{
    supergraphSdl: string;
    cleanup?: () => Promise<void>;
  }>;
}
export interface ManuallyManagedSupergraphSdlGatewayConfig extends GatewayConfigBase {
  supergraphSdl: SupergraphSdlHook;
}

type ManuallyManagedGatewayConfig =
  | ManuallyManagedServiceDefsGatewayConfig
  | ExperimentalManuallyManagedSupergraphSdlGatewayConfig
  | ManuallyManagedSupergraphSdlGatewayConfig;

// TODO(trevor:removeServiceList)
interface LocalGatewayConfig extends GatewayConfigBase {
  // @deprecated: use `supergraphSdl` in its function form instead
  localServiceList: ServiceDefinition[];
}

interface StaticSupergraphSdlGatewayConfig extends GatewayConfigBase {
  supergraphSdl: string;
}

export type StaticGatewayConfig =
  | LocalGatewayConfig
  | StaticSupergraphSdlGatewayConfig;

type DynamicGatewayConfig =
  | ManagedGatewayConfig
  | RemoteGatewayConfig
  | ManuallyManagedGatewayConfig;

export type GatewayConfig = StaticGatewayConfig | DynamicGatewayConfig;

// TODO(trevor:removeServiceList)
export function isLocalConfig(
  config: GatewayConfig,
): config is LocalGatewayConfig {
  return 'localServiceList' in config;
}

// TODO(trevor:removeServiceList)
export function isRemoteConfig(
  config: GatewayConfig,
): config is RemoteGatewayConfig {
  return 'serviceList' in config;
}

export function isStaticSupergraphSdlConfig(
  config: GatewayConfig,
): config is StaticSupergraphSdlGatewayConfig {
  return 'supergraphSdl' in config && typeof config.supergraphSdl === 'string';
}

// A manually managed config means the user has provided a function which
// handles providing service definitions to the gateway.
export function isManuallyManagedConfig(
  config: GatewayConfig,
): config is ManuallyManagedGatewayConfig {
  return (
    isManuallyManagedSupergraphSdlGatewayConfig(config) ||
    'experimental_updateServiceDefinitions' in config ||
    'experimental_updateSupergraphSdl' in config
  );
}

// Managed config strictly means managed by Studio
export function isManagedConfig(
  config: GatewayConfig,
): config is ManagedGatewayConfig {
  return (
    'schemaConfigDeliveryEndpoint' in config ||
    (!isRemoteConfig(config) &&
      !isLocalConfig(config) &&
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

// A dynamic config is one which loads asynchronously and (can) update via polling
export function isDynamicConfig(
  config: GatewayConfig,
): config is DynamicGatewayConfig {
  return (
    isRemoteConfig(config) ||
    isManagedConfig(config) ||
    isManuallyManagedConfig(config)
  );
}
