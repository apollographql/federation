import { GraphQLError, GraphQLSchema } from "graphql";
import { HeadersInit } from "node-fetch";
import { fetch } from 'apollo-server-env';
import { GraphQLRequestContextExecutionDidStart, Logger } from "apollo-server-types";
import { ServiceDefinition } from "@apollo/federation";
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

export function isSupergraphSdlUpdate(update: CompositionUpdate): update is SupergraphSdlUpdate {
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

export interface RemoteGatewayConfig extends GatewayConfigBase {
  serviceList: ServiceEndpointDefinition[];
  introspectionHeaders?:
    | HeadersInit
    | ((service: ServiceEndpointDefinition) => Promise<HeadersInit> | HeadersInit);
}

// TODO(trevor:cloudconfig): This type goes away
export interface LegacyManagedGatewayConfig extends GatewayConfigBase {
  federationVersion?: number;
  /**
   * Setting this to null will cause the gateway to use the old mechanism for
   * managed federation via GCS + composition.
   */
  schemaConfigDeliveryEndpoint: null;
}

// TODO(trevor:cloudconfig): This type becomes the only managed config
export interface PrecomposedManagedGatewayConfig extends GatewayConfigBase {
  /**
   * This configuration option shouldn't be used unless by recommendation from
   * Apollo staff. This can also be set to `null` (see above) in order to revert
   * to the previous mechanism for managed federation.
   */
  schemaConfigDeliveryEndpoint?: string;
}

// TODO(trevor:cloudconfig): This union is no longer needed
export type ManagedGatewayConfig =
  | LegacyManagedGatewayConfig
  | PrecomposedManagedGatewayConfig;

interface ManuallyManagedServiceDefsGatewayConfig extends GatewayConfigBase {
  experimental_updateServiceDefinitions: Experimental_UpdateServiceDefinitions;
}

interface ManuallyManagedSupergraphSdlGatewayConfig extends GatewayConfigBase {
  experimental_updateSupergraphSdl: Experimental_UpdateSupergraphSdl
}

type ManuallyManagedGatewayConfig =
  | ManuallyManagedServiceDefsGatewayConfig
  | ManuallyManagedSupergraphSdlGatewayConfig;

interface LocalGatewayConfig extends GatewayConfigBase {
  localServiceList: ServiceDefinition[];
}

interface SupergraphSdlGatewayConfig extends GatewayConfigBase {
  supergraphSdl: string;
}

export type StaticGatewayConfig = LocalGatewayConfig | SupergraphSdlGatewayConfig;

type DynamicGatewayConfig =
| ManagedGatewayConfig
| RemoteGatewayConfig
| ManuallyManagedGatewayConfig;

export type GatewayConfig = StaticGatewayConfig | DynamicGatewayConfig;

export function isLocalConfig(config: GatewayConfig): config is LocalGatewayConfig {
  return 'localServiceList' in config;
}

export function isRemoteConfig(config: GatewayConfig): config is RemoteGatewayConfig {
  return 'serviceList' in config;
}

export function isSupergraphSdlConfig(config: GatewayConfig): config is SupergraphSdlGatewayConfig {
  return 'supergraphSdl' in config;
}

// A manually managed config means the user has provided a function which
// handles providing service definitions to the gateway.
export function isManuallyManagedConfig(
  config: GatewayConfig,
): config is ManuallyManagedGatewayConfig {
  return (
    'experimental_updateServiceDefinitions' in config ||
    'experimental_updateSupergraphSdl' in config
  );
}

// Managed config strictly means managed by Studio
export function isManagedConfig(
  config: GatewayConfig,
): config is ManagedGatewayConfig {
  return isPrecomposedManagedConfig(config) || isLegacyManagedConfig(config);
}

// TODO(trevor:cloudconfig): This merges with `isManagedConfig`
export function isPrecomposedManagedConfig(
  config: GatewayConfig,
): config is PrecomposedManagedGatewayConfig {
  return (
    !isLegacyManagedConfig(config) &&
    (('schemaConfigDeliveryEndpoint' in config &&
      typeof config.schemaConfigDeliveryEndpoint === 'string') ||
      (!isRemoteConfig(config) &&
        !isLocalConfig(config) &&
        !isSupergraphSdlConfig(config) &&
        !isManuallyManagedConfig(config)))
  );
}

export function isLegacyManagedConfig(
  config: GatewayConfig,
): config is LegacyManagedGatewayConfig {
  return (
    'schemaConfigDeliveryEndpoint' in config &&
    config.schemaConfigDeliveryEndpoint === null
  );
}

// A static config is one which loads synchronously on start and never updates
export function isStaticConfig(config: GatewayConfig): config is StaticGatewayConfig {
  return isLocalConfig(config) || isSupergraphSdlConfig(config);
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
