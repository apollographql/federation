import {
  composeAndValidate,
  compositionHasErrors,
  ServiceDefinition,
} from '@apollo/federation';
import { Logger } from 'apollo-server-types';
import CallableInstance from 'callable-instance';
import { HeadersInit } from 'node-fetch';
import {
  ServiceEndpointDefinition,
  SupergraphSdlHook,
  SupergraphSdlUpdateFunction,
} from '..';
import {
  getServiceDefinitionsFromRemoteEndpoint,
  Service,
} from './loadServicesFromRemoteEndpoint';
import { waitUntil } from '../utilities/waitUntil';

export interface IntrospectAndComposeOptions {
  subgraphs: ServiceEndpointDefinition[];
  introspectionHeaders?:
    | HeadersInit
    | ((
        service: ServiceEndpointDefinition,
      ) => Promise<HeadersInit> | HeadersInit);
  pollIntervalInMs?: number;
  logger?: Logger;
}

type State =
  | { phase: 'initialized' }
  | { phase: 'polling'; pollingPromise?: Promise<void> }
  | { phase: 'stopped' };

export class IntrospectAndCompose extends CallableInstance<
  Parameters<SupergraphSdlHook>,
  ReturnType<SupergraphSdlHook>
> {
  private config: IntrospectAndComposeOptions;
  private update?: SupergraphSdlUpdateFunction;
  private subgraphs?: Service[];
  private serviceSdlCache: Map<string, string> = new Map();
  private pollIntervalInMs?: number;
  private timerRef: NodeJS.Timeout | null = null;
  private state: State;

  constructor(options: IntrospectAndComposeOptions) {
    super('instanceCallableMethod');

    this.config = options;
    this.pollIntervalInMs = options.pollIntervalInMs;
    this.state = { phase: 'initialized' };
  }

  // @ts-ignore noUsedLocals
  private async instanceCallableMethod(
    ...[{ update, getDataSource }]: Parameters<SupergraphSdlHook>
  ) {
    this.update = update;
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
      supergraphSdl: initialSupergraphSdl,
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
        const [pollingPromise, donePolling] = waitUntil();
        this.state.pollingPromise = pollingPromise;
        try {
          const maybeNewSupergraphSdl = await this.updateSupergraphSdl();
          if (maybeNewSupergraphSdl) {
            this.update?.(maybeNewSupergraphSdl);
          }
        } catch (e) {
          this.config.logger?.error(
            'IntrospectAndCompose failed to update supergraph with the following error: ' +
              (e.message ?? e),
          );
        }
        donePolling!();
      }

      this.poll();
    }, this.pollIntervalInMs!);
  }
}
