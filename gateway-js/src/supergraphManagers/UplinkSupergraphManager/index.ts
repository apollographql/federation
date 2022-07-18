import * as makeFetchHappen from 'make-fetch-happen';
import type { Logger } from '@apollo/utils.logger';
import resolvable, { Resolvable } from '@josephg/resolvable';
import { SupergraphManager, SupergraphSdlHookOptions } from '../../config';
import {
  SubgraphHealthCheckFunction,
  SupergraphSdlUpdateFunction,
} from '../..';
import { getDefaultLogger } from '../../logger';
import { loadSupergraphSdlFromUplinks } from './loadSupergraphSdlFromStorage';
import { Fetcher } from '@apollo/utils.fetcher';

export type FailureToFetchSupergraphSdlFunctionParams = {
  error: Error;
  graphRef: string;
  logger: Logger;
  fetchCount: number;
};

export type FailureToFetchSupergraphSdlDuringInit = ({
  error,
  graphRef,
  logger,
  fetchCount,
}: FailureToFetchSupergraphSdlFunctionParams) => Promise<string>;

export type FailureToFetchSupergraphSdlAfterInit = ({
  error,
  graphRef,
  logger,
  fetchCount,
  mostRecentSuccessfulFetchAt,
}:
  | FailureToFetchSupergraphSdlFunctionParams
  & { mostRecentSuccessfulFetchAt?: Date }) => Promise<string | null>;

type State =
  | { phase: 'constructed' }
  | { phase: 'initialized' }
  | {
      phase: 'polling';
      pollingPromise?: Promise<void>;
      nextFetchPromise?: Resolvable<void>;
    }
  | { phase: 'stopped' };

export class UplinkSupergraphManager implements SupergraphManager {
  public static readonly DEFAULT_UPLINK_ENDPOINTS = [
    'https://uplink.api.apollographql.com/',
    'https://aws.uplink.api.apollographql.com/',
  ];

  public readonly uplinkEndpoints: string[] =
    UplinkSupergraphManager.getUplinkEndpoints();
  private apiKey: string;
  private graphRef: string;
  private fetcher: Fetcher = makeFetchHappen.defaults();
  private maxRetries: number;
  private initialMaxRetries: number;
  private fallbackPollIntervalMs: number = 10_000;
  private logger: Logger;
  private update?: SupergraphSdlUpdateFunction;
  private shouldRunSubgraphHealthcheck: boolean = false;
  private healthCheck?: SubgraphHealthCheckFunction;
  private onFailureToFetchSupergraphSdlDuringInit?: FailureToFetchSupergraphSdlDuringInit;
  private onFailureToFetchSupergraphSdlAfterInit?: FailureToFetchSupergraphSdlAfterInit;
  private timerRef: NodeJS.Timeout | null = null;
  private state: State;
  private errorReportingEndpoint: string | undefined =
    process.env.APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT ?? undefined;
  private compositionId?: string;
  private fetchCount: number = 0;
  private minDelayMs: number | null = null;
  private earliestFetchTime: Date | null = null;
  private mostRecentSuccessfulFetchAt?: Date;

  constructor({
    apiKey,
    graphRef,
    debug,
    logger,
    fetcher,
    uplinkEndpoints,
    fallbackPollIntervalInMs,
    maxRetries,
    initialMaxRetries,
    shouldRunSubgraphHealthcheck,
    onFailureToFetchSupergraphSdlDuringInit,
    onFailureToFetchSupergraphSdlAfterInit,
  }: {
    apiKey: string;
    graphRef: string;
    debug?: boolean;
    logger?: Logger;
    fetcher?: Fetcher;
    uplinkEndpoints?: string[];
    fallbackPollIntervalInMs?: number;
    maxRetries?: number;
    initialMaxRetries?: number;
    shouldRunSubgraphHealthcheck?: boolean;
    onFailureToFetchSupergraphSdlDuringInit?: FailureToFetchSupergraphSdlDuringInit;
    onFailureToFetchSupergraphSdlAfterInit?: FailureToFetchSupergraphSdlAfterInit;
  }) {
    this.apiKey = apiKey;
    this.graphRef = graphRef;
    this.logger = logger ?? getDefaultLogger(debug);

    this.uplinkEndpoints = uplinkEndpoints ?? this.uplinkEndpoints;
    // If the user didn't pass a `maxRetries`, default to trying each endpoint
    // 3 times (minus 1 for the initial request) since we round-robin through
    // each URL on failure
    this.maxRetries = maxRetries ?? this.uplinkEndpoints.length * 3 - 1;
    this.initialMaxRetries = initialMaxRetries ?? this.maxRetries;

    this.fetcher = fetcher ?? this.fetcher;
    this.fallbackPollIntervalMs =
      fallbackPollIntervalInMs ?? this.fallbackPollIntervalMs;
    this.shouldRunSubgraphHealthcheck =
      shouldRunSubgraphHealthcheck ?? this.shouldRunSubgraphHealthcheck;
    this.onFailureToFetchSupergraphSdlDuringInit =
      onFailureToFetchSupergraphSdlDuringInit;
    this.onFailureToFetchSupergraphSdlAfterInit =
      onFailureToFetchSupergraphSdlAfterInit;

    this.state = { phase: 'constructed' };
  }

  public async initialize({ update, healthCheck }: SupergraphSdlHookOptions) {
    this.update = update;

    if (this.shouldRunSubgraphHealthcheck) {
      this.healthCheck = healthCheck;
    }

    let initialSupergraphSdl: string | undefined = undefined;
    try {
      const result = await this.updateSupergraphSdl(this.initialMaxRetries);
      if (!result) {
        throw new Error(
          'Invalid supergraph schema supplied during initialization.',
        );
      }
      initialSupergraphSdl = result.supergraphSdl;
      if (result.minDelaySeconds) {
        this.minDelayMs = 1000 * result.minDelaySeconds;
        this.earliestFetchTime = new Date(Date.now() + this.minDelayMs);
      }
    } catch (e) {
      this.logUpdateFailure(e);
      throw e;
    }

    this.state = { phase: 'initialized' };

    // Start polling after we resolve the first supergraph
    this.beginPolling();

    return {
      supergraphSdl: initialSupergraphSdl,
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

  public async nextFetch(): Promise<void | null> {
    if (this.state.phase !== 'polling') {
      return;
    }
    return this.state.nextFetchPromise;
  }

  /**
   * Configuration priority order:
   * 1. APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT environment variable
   * 2. default (GCP and AWS)
   */
  public static getUplinkEndpoints(): string[] {
    const envEndpoints =
      process.env.APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT?.split(',');
    return envEndpoints ?? UplinkSupergraphManager.DEFAULT_UPLINK_ENDPOINTS;
  }

  private async updateSupergraphSdl(maxRetries: number): Promise<{
    supergraphSdl: string;
    minDelaySeconds: number;
  } | null> {
    let supergraphSdl;
    let minDelaySeconds = this.fallbackPollIntervalMs / 1000;

    try {
      const result = await loadSupergraphSdlFromUplinks({
        graphRef: this.graphRef,
        apiKey: this.apiKey,
        endpoints: this.uplinkEndpoints,
        errorReportingEndpoint: this.errorReportingEndpoint,
        fetcher: this.fetcher,
        compositionId: this.compositionId ?? null,
        maxRetries,
        roundRobinSeed: this.fetchCount++,
        earliestFetchTime: this.earliestFetchTime,
        logger: this.logger,
      });

      if (!result) {
        return null;
      }

      this.compositionId = result.id;

      ({ supergraphSdl, minDelaySeconds } = result);
      this.mostRecentSuccessfulFetchAt = new Date();
    } catch (e) {
      this.logger.debug(
        `Error fetching supergraphSdl from Uplink during phase '${this.state.phase}'`,
      );

      if (
        this.state.phase === 'constructed' &&
        this.onFailureToFetchSupergraphSdlDuringInit
      ) {
        supergraphSdl = await this.onFailureToFetchSupergraphSdlDuringInit({
          error: e,
          graphRef: this.graphRef,
          logger: this.logger,
          fetchCount: this.fetchCount,
        });
      } else if (
        this.state.phase === 'polling' &&
        this.onFailureToFetchSupergraphSdlAfterInit
      ) {
        supergraphSdl = await this.onFailureToFetchSupergraphSdlAfterInit({
          error: e,
          graphRef: this.graphRef,
          logger: this.logger,
          fetchCount: this.fetchCount,
          mostRecentSuccessfulFetchAt: this.mostRecentSuccessfulFetchAt,
        });

        // This is really an error, but we'll let the caller decide what to do with it
        if (!supergraphSdl) {
          return null;
        }
      } else {
        throw e;
      }
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
    const delay = this.minDelayMs
      ? Math.max(this.minDelayMs, this.fallbackPollIntervalMs)
      : this.fallbackPollIntervalMs;

    if (this.state.phase !== 'polling') {
      return;
    }

    this.state.nextFetchPromise = resolvable();

    this.timerRef = setTimeout(async () => {
      if (this.state.phase === 'polling') {
        const pollingPromise = resolvable();
        this.state.pollingPromise = pollingPromise;
        try {
          const result = await this.updateSupergraphSdl(this.maxRetries);
          if (result?.minDelaySeconds) {
            this.minDelayMs = 1000 * result.minDelaySeconds;
            this.earliestFetchTime = new Date(Date.now() + this.minDelayMs);
          }
          if (result?.supergraphSdl) {
            this.update?.(result.supergraphSdl);
          }
        } catch (e) {
          this.logUpdateFailure(e);
        }
        pollingPromise.resolve();
        this.state.nextFetchPromise?.resolve();
      }

      this.poll();
    }, delay);
  }

  private logUpdateFailure(e: any) {
    this.logger.error(
      'UplinkSupergraphManager failed to update supergraph with the following error: ' +
        (e.message ?? e),
    );
  }
}
