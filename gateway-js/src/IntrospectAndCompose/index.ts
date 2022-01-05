import {
  composeAndValidate,
  compositionHasErrors,
  ServiceDefinition,
} from '@apollo/federation';
import { Logger } from 'apollo-server-types';
import { HeadersInit } from 'node-fetch';
import {
  ServiceEndpointDefinition,
  SupergraphSdlUpdateFunction,
  SubgraphHealthCheckFunction,
} from '..';
import {
  getServiceDefinitionsFromRemoteEndpoint,
  Service,
} from './loadServicesFromRemoteEndpoint';
import { SupergraphSdlObject, SupergraphSdlHookOptions } from '../config';

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

export class IntrospectAndCompose implements SupergraphSdlObject {
  private config: IntrospectAndComposeOptions;
  private update?: SupergraphSdlUpdateFunction;
  private healthCheck?: SubgraphHealthCheckFunction;
  private subgraphs?: Service[];
  private serviceSdlCache: Map<string, string> = new Map();
  private pollIntervalInMs?: number;
  private timerRef: NodeJS.Timeout | null = null;
  private state: State;

  constructor(options: IntrospectAndComposeOptions) {
    this.config = options;
    this.pollIntervalInMs = options.pollIntervalInMs;
    this.state = { phase: 'initialized' };
  }

  public async initialize({ update, getDataSource, healthCheck }: SupergraphSdlHookOptions) {
    console.log(this);
    this.update = update;

    if (this.config.subgraphHealthCheck) {
      this.healthCheck = healthCheck;
    }

    this.subgraphs = this.config.subgraphs.map((subgraph) => ({
      ...subgraph,
      dataSource: getDataSource(subgraph),
    }));

    const initialSupergraphSdl = await this.updateSupergraphSdl();
    // Start polling after we resolve the first supergraph
    if (this.pollIntervalInMs) {
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
          this.timerRef.unref();
          clearInterval(this.timerRef);
          this.timerRef = null;
        }
      },
    };
  }

  private async updateSupergraphSdl() {
    const result = await getServiceDefinitionsFromRemoteEndpoint({
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

    return this.createSupergraphFromSubgraphList(result.serviceDefinitions!);
  }

  private createSupergraphFromSubgraphList(subgraphs: ServiceDefinition[]) {
    const compositionResult = composeAndValidate(subgraphs);

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
    this.state = { phase: 'polling' };
    this.poll();
  }

  private poll() {
    this.timerRef = setTimeout(async () => {
      if (this.state.phase === 'polling') {
        let pollingDone: () => void;
        const pollingPromise = new Promise<void>((resolve) => {
          pollingDone = resolve;
        });

        this.state.pollingPromise = pollingPromise;
        try {
          const maybeNewSupergraphSdl = await this.updateSupergraphSdl();
          if (maybeNewSupergraphSdl) {
            // the healthCheck fn is only assigned if it's enabled in the config
            await this.healthCheck?.(maybeNewSupergraphSdl);
            this.update?.(maybeNewSupergraphSdl);
          }
        } catch (e) {
          this.config.logger?.error(
            'IntrospectAndCompose failed to update supergraph with the following error: ' +
              (e.message ?? e),
          );
        }
        pollingDone!();
      }

      this.poll();
    }, this.pollIntervalInMs!);
  }
}
