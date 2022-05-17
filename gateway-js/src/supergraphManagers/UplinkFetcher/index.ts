import * as makeFetchHappen from 'make-fetch-happen';
import type { Logger } from '@apollo/utils.logger';
import resolvable from '@josephg/resolvable';
import { SupergraphManager, SupergraphSdlHookOptions } from '../../config';
import { SubgraphHealthCheckFunction, SupergraphSdlUpdateFunction } from '../..';
import { getDefaultLogger } from '../../logger';
import { loadSupergraphSdlFromUplinks } from './loadSupergraphSdlFromStorage';
import { Fetcher } from '@apollo/utils.fetcher';

export const DEFAULT_UPLINK_ENDPOINTS = [
  'https://uplink.api.apollographql.com/',
  'https://aws.uplink.api.apollographql.com/',
];

function getUplinkEndpoints(): string[] {
  /**
   * Configuration priority order:
   * 1. APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT environment variable
   * 2. default (GCP and AWS)
   */
  const envEndpoints = process.env.APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT?.split(',');
  return envEndpoints ?? DEFAULT_UPLINK_ENDPOINTS;
}

export interface UpdateSupergraphSdlFailureInputs {
  error: Error;
}

export type UpdateSupergraphSdlFailureFunction = (this: UplinkFetcher, options: UpdateSupergraphSdlFailureInputs) => Promise<string>;
//   this: UplinkFetcher,
//   { error }: { error: Error }
// ) => Promise<string>;

export interface UplinkFetcherOptions {
  apiKey: string,
  graphRef: string,
  debug?: boolean;
  logger?: Logger;
  fetcher?: Fetcher;
  uplinkEndpoints?: string[];
  pollIntervalInMs?: number;
  maxRetries?: number;
  shouldRunSubgraphHealthcheck?: boolean;
  onFailureToUpdateSupergraphSdl?: UpdateSupergraphSdlFailureFunction;
}

type State =
  | { phase: 'initialized' }
  | { phase: 'polling'; pollingPromise?: Promise<void> }
  | { phase: 'stopped' };

export class UplinkFetcher implements SupergraphManager {
  protected apiKey: string;
  protected graphRef: string;
  protected _uplinkEndpoints: string[] = getUplinkEndpoints();
  protected fetcher: Fetcher = makeFetchHappen.defaults();
  protected maxRetries: number;
  protected pollIntervalMs: number = 10_000;
  protected logger: Logger;
  private update?: SupergraphSdlUpdateFunction;
  private shouldRunSubgraphHealthcheck: boolean = false;
  private healthCheck?: SubgraphHealthCheckFunction;
  private onFailureToUpdateSupergraphSdl?: UpdateSupergraphSdlFailureFunction;
  private timerRef: NodeJS.Timeout | null = null;
  private state: State;
  private errorReportingEndpoint: string | undefined =
    process.env.APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT ?? undefined;
  private compositionId?: string;
  private fetchCount: number = 0;
  private minDelayMs: number | null = null;
  private earliestFetchTime: Date | null = null;

  // TODO: Make this backwards compatible
  constructor(options: UplinkFetcherOptions) {
    this.apiKey = options.apiKey;
    this.graphRef = options.graphRef;
    if (options.uplinkEndpoints) {
      this._uplinkEndpoints = options.uplinkEndpoints;
    }

    this.maxRetries = options.maxRetries ?? this.uplinkEndpoints.length * 3 - 1;

    this.logger = options.logger ?? getDefaultLogger(options.debug);
    this.fetcher = options.fetcher ?? this.fetcher;
    this.pollIntervalMs = options.pollIntervalInMs ?? this.pollIntervalMs;
    this.shouldRunSubgraphHealthcheck = options.shouldRunSubgraphHealthcheck ?? this.shouldRunSubgraphHealthcheck;
    this.onFailureToUpdateSupergraphSdl = options.onFailureToUpdateSupergraphSdl;

    this.state = { phase: 'initialized' };
  }

  public async initialize({ update, healthCheck }: SupergraphSdlHookOptions) {
    this.update = update;

    if (this.shouldRunSubgraphHealthcheck) {
      this.healthCheck = healthCheck;
    }

    let initialSupergraphSdl: string | null = null;
    try {
      const result = await this.updateSupergraphSdl();
      initialSupergraphSdl = result?.supergraphSdl || null;
      if (result?.minDelaySeconds) {
        this.minDelayMs = 1000 * result?.minDelaySeconds;
        this.earliestFetchTime = new Date(Date.now() + this.minDelayMs);
      }
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

  public get uplinkEndpoints(): string[] {
    return this._uplinkEndpoints;
  }

  private async updateSupergraphSdl(): Promise<{supergraphSdl: string, minDelaySeconds?: number} | null> {
    let supergraphSdl;
    let minDelaySeconds: number | undefined = this.pollIntervalMs / 1000;

    try {
      const result = await loadSupergraphSdlFromUplinks({
        graphRef: this.graphRef,
        apiKey: this.apiKey,
        endpoints: this.uplinkEndpoints,
        errorReportingEndpoint: this.errorReportingEndpoint,
        fetcher: this.fetcher,
        compositionId: this.compositionId ?? null,
        maxRetries: this.maxRetries,
        roundRobinSeed: this.fetchCount++,
        earliestFetchTime: this.earliestFetchTime,
        logger: this.logger
      });

      if (!result) {
        return null;
      }

      this.compositionId = result.id;

      ({supergraphSdl, minDelaySeconds} = result);
    } catch (e) {
      if (!this.onFailureToUpdateSupergraphSdl) {
        throw e;
      }

      this.logger.debug('Error fetching supergraphSdl from Uplink, calling updateSupergraphSdlFailureCallback');
      supergraphSdl = await this.onFailureToUpdateSupergraphSdl.call(this, { error: e });
      // if (!supergraphSdl) {
      //   throw new UplinkFetcherError('updateSupergraphSdlFailureCallback returned invalid supergraphSdl');
      // }
      this.logger.debug(`Received new schema from callback (${supergraphSdl.length} chars)`);
    }

    // the healthCheck fn is only assigned if it's enabled in the config
    await this.healthCheck?.(supergraphSdl);
    return { supergraphSdl, minDelaySeconds };
  }

  private beginPolling() {
    this.state = { phase: 'polling' };
    this.poll();
  }

  private poll() {
    this.timerRef = setTimeout(
      async () => {
        if (this.state.phase === 'polling') {
          const pollingPromise = resolvable();

          this.state.pollingPromise = pollingPromise;
          try {
            const result = await this.updateSupergraphSdl();
            const maybeNewSupergraphSdl = result?.supergraphSdl || null;
            if (result?.minDelaySeconds) {
              this.minDelayMs = 1000 * result?.minDelaySeconds;
              this.earliestFetchTime = new Date(Date.now() + this.minDelayMs);
            }
            if (maybeNewSupergraphSdl) {
              this.update?.(maybeNewSupergraphSdl);
            }
          } catch (e) {
            this.logUpdateFailure(e);
          }
          pollingPromise.resolve();
        }

        this.poll();
      },
      this.minDelayMs
        ? Math.max(this.minDelayMs, this.pollIntervalMs)
        : this.pollIntervalMs
    );
  }

  private logUpdateFailure(e: any) {
    this.logger.error(
      'UplinkFetcher failed to update supergraph with the following error: ' + (e.message ?? e)
    );
  }
}
