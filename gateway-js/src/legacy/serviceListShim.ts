import {
  composeAndValidate,
  compositionHasErrors,
  ServiceDefinition,
} from '@apollo/federation';
import CallableInstance from 'callable-instance';
import { HeadersInit } from 'node-fetch';
import {
  GraphQLDataSource,
  RemoteGraphQLDataSource,
  ServiceEndpointDefinition,
  SupergraphSdlUpdateFunction,
} from '..';
import { SupergraphSdlHookOptions, SupergraphSdlHookReturn } from '../config';
import {
  getServiceDefinitionsFromRemoteEndpoint,
  Service,
} from '../loadServicesFromRemoteEndpoint';

export interface ServiceListShimOptions {
  serviceList: ServiceEndpointDefinition[];
  introspectionHeaders?:
    | HeadersInit
    | ((
        service: ServiceEndpointDefinition,
      ) => Promise<HeadersInit> | HeadersInit);
  buildService?: (definition: ServiceEndpointDefinition) => GraphQLDataSource;
  pollIntervalInMs?: number;
}

export class ServiceListShim extends CallableInstance<
  [SupergraphSdlHookOptions],
  SupergraphSdlHookReturn
> {
  private update?: SupergraphSdlUpdateFunction;
  private serviceList: Service[];
  private introspectionHeaders?:
    | HeadersInit
    | ((
        service: ServiceEndpointDefinition,
      ) => Promise<HeadersInit> | HeadersInit);
  private buildService?: (
    definition: ServiceEndpointDefinition,
  ) => GraphQLDataSource;
  private serviceSdlCache: Map<string, string> = new Map();
  private pollIntervalInMs?: number;
  private timerRef: NodeJS.Timeout | null = null;

  constructor(options: ServiceListShimOptions) {
    super('instanceCallableMethod');
    // this.buildService needs to be assigned before this.serviceList is built
    this.buildService = options.buildService;
    this.pollIntervalInMs = options.pollIntervalInMs;
    this.serviceList = options.serviceList.map((serviceDefinition) => ({
      ...serviceDefinition,
      dataSource: this.createDataSource(serviceDefinition),
    }));
    this.introspectionHeaders = options.introspectionHeaders;
  }

  // @ts-ignore noUsedLocals
  private async instanceCallableMethod(
    ...[{ update }]: [SupergraphSdlHookOptions]
  ) {
    this.update = update;

    const initialSupergraphSdl = await this.updateSupergraphSdl();
    // Start polling after we resolve the first supergraph
    if (this.pollIntervalInMs) {
      this.beginPolling();
    }

    return {
      supergraphSdl: initialSupergraphSdl,
      cleanup: async () => {
        if (this.timerRef) {
          this.timerRef.unref();
          clearInterval(this.timerRef);
          this.timerRef = null;
        }
      },
    };
  }

  private async updateSupergraphSdl() {
    const result = await getServiceDefinitionsFromRemoteEndpoint({
      serviceList: this.serviceList,
      getServiceIntrospectionHeaders: async (service) => {
        return typeof this.introspectionHeaders === 'function'
          ? await this.introspectionHeaders(service)
          : this.introspectionHeaders;
      },
      serviceSdlCache: this.serviceSdlCache,
    });

    if (!result.isNewSchema) {
      return null;
    }

    return this.createSupergraphFromServiceList(result.serviceDefinitions!);
  }

  private createDataSource(
    serviceDef: ServiceEndpointDefinition,
  ): GraphQLDataSource {
    return (
      this.buildService?.(serviceDef) ??
      new RemoteGraphQLDataSource({
        url: serviceDef.url,
      })
    );
  }

  private createSupergraphFromServiceList(serviceList: ServiceDefinition[]) {
    const compositionResult = composeAndValidate(serviceList);

    if (compositionHasErrors(compositionResult)) {
      const { errors } = compositionResult;
      throw Error(
        "A valid schema couldn't be composed. The following composition errors were found:\n" +
          errors.map((e) => '\t' + e.message).join('\n'),
      );
    } else {
      const { supergraphSdl } = compositionResult;
      return supergraphSdl;
    }
  }

  private beginPolling() {
    this.poll();
  }

  private poll() {
    this.timerRef = global.setTimeout(async () => {
      const maybeNewSupergraphSdl = await this.updateSupergraphSdl();
      if (maybeNewSupergraphSdl) {
        this.update?.(maybeNewSupergraphSdl);
      }
      this.poll();
    }, this.pollIntervalInMs!);
  }
}
