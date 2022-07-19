import type { Logger } from '@apollo/utils.logger';
import type { HeadersInit } from 'node-fetch';
import resolvable from '@josephg/resolvable';
import {
  ServiceEndpointDefinition,
  SupergraphSdlUpdateFunction,
  SubgraphHealthCheckFunction,
} from '../..';
import {
  loadServicesFromRemoteEndpoint,
  Service,
} from './loadServicesFromRemoteEndpoint';
import { SupergraphManager, SupergraphSdlHookOptions } from '../../config';
import { composeServices } from '@apollo/composition';
import { ServiceDefinition } from '@apollo/federation-internals';

export interface IntrospectAndComposeOptions {
  subgraphs: ServiceEndpointDefinition[];
  introspectionHeaders?:
    | HeadersInit
    | ((
        service: ServiceEndpointDefinition,
      ) => Promise<HeadersInit> | HeadersInit);
  pollIntervalInMs?: number;
  logger?: Logger;
  subgraphHealthCheck?: boolean;
}

type State =
  | { phase: 'initialized' }
  | { phase: 'polling'; pollingPromise?: Promise<void> }
  | { phase: 'stopped' };

export class IntrospectAndCompose implements SupergraphManager {
  private config: IntrospectAndComposeOptions;
  private update?: SupergraphSdlUpdateFunction;
  private healthCheck?: SubgraphHealthCheckFunction;
  private subgraphs?: Service[];
  private serviceSdlCache: Map<string, string> = new Map();
  private timerRef: NodeJS.Timeout | null = null;
  private state: State;

  constructor(options: IntrospectAndComposeOptions) {
    this.config = options;
    this.state = { phase: 'initialized' };
  }

  public async initialize({ update, getDataSource, healthCheck }: SupergraphSdlHookOptions) {
    this.update = update;

    if (this.config.subgraphHealthCheck) {
      this.healthCheck = healthCheck;
    }

    this.subgraphs = this.config.subgraphs.map((subgraph) => ({
      ...subgraph,
      dataSource: getDataSource(subgraph),
    }));

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
    const result = await loadServicesFromRemoteEndpoint({
      serviceList: this.subgraphs!,
      getServiceIntrospectionHeaders: async (service) => {
        return typeof this.config.introspectionHeaders === 'function'
          ? await this.config.introspectionHeaders(service)
          : this.config.introspectionHeaders;
      },
      serviceSdlCache: this.serviceSdlCache,
    });

    if (!result.isNewSchema) {
      return null;
    }

    const supergraphSdl = this.createSupergraphFromSubgraphList(result.serviceDefinitions!);
    // the healthCheck fn is only assigned if it's enabled in the config
    await this.healthCheck?.(supergraphSdl);

    return supergraphSdl;
  }

  private createSupergraphFromSubgraphList(subgraphs: ServiceDefinition[]) {
    const compositionResult = composeServices(subgraphs);

    if (compositionResult.errors) {
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
      'IntrospectAndCompose failed to update supergraph with the following error: ' +
        (e.message ?? e),
    );
  }
}
