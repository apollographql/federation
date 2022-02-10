import { fetch } from 'apollo-server-env';
import { Logger } from 'apollo-server-types';
import resolvable from '@josephg/resolvable';
import { SupergraphManager, SupergraphSdlHookOptions } from '../../config';
import { SubgraphHealthCheckFunction, SupergraphSdlUpdateFunction } from '../..';
import { loadSupergraphSdlFromUplinks } from './loadSupergraphSdlFromStorage';

export interface UplinkFetcherOptions {
  pollIntervalInMs: number;
  subgraphHealthCheck?: boolean;
  graphRef: string;
  apiKey: string;
  fetcher: typeof fetch;
  maxRetries: number;
  uplinkEndpoints: string[];
  logger?: Logger;
}

type State =
  | { phase: 'initialized' }
  | { phase: 'polling'; pollingPromise?: Promise<void> }
  | { phase: 'stopped' };

export class UplinkFetcher implements SupergraphManager {
  private config: UplinkFetcherOptions;
  private update?: SupergraphSdlUpdateFunction;
  private healthCheck?: SubgraphHealthCheckFunction;
  private timerRef: NodeJS.Timeout | null = null;
  private state: State;
  private errorReportingEndpoint: string | undefined =
    process.env.APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT ?? undefined;
  private compositionId?: string;
  private fetchCount: number = 0;

  constructor(options: UplinkFetcherOptions) {
    this.config = options;
    this.state = { phase: 'initialized' };
  }

  public async initialize({ update, healthCheck }: SupergraphSdlHookOptions) {
    this.update = update;

    if (this.config.subgraphHealthCheck) {
      this.healthCheck = healthCheck;
    }

    let initialSupergraphSdl: string | null = null;
    try {
      initialSupergraphSdl = await this.updateSupergraphSdl();
    } catch (e) {
      this.logUpdateFailure(e);
      throw e;
    }

    // Start polling after we resolve the first supergraph
    this.beginPolling();

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
    const result = await loadSupergraphSdlFromUplinks({
      graphRef: this.config.graphRef,
      apiKey: this.config.apiKey,
      endpoints: this.config.uplinkEndpoints,
      errorReportingEndpoint: this.errorReportingEndpoint,
      fetcher: this.config.fetcher,
      compositionId: this.compositionId ?? null,
      maxRetries: this.config.maxRetries,
      roundRobinSeed: this.fetchCount,
    });

    if (!result) {
      return null;
    } else {
      this.compositionId = result.id;
      // the healthCheck fn is only assigned if it's enabled in the config
      await this.healthCheck?.(result.supergraphSdl);
      return result.supergraphSdl;
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
    }, this.config.pollIntervalInMs);
  }

  private logUpdateFailure(e: any) {
    this.config.logger?.error(
      'UplinkFetcher failed to update supergraph with the following error: ' +
        (e.message ?? e),
    );
  }
}
