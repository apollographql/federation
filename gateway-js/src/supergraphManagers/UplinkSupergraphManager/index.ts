import * as makeFetchHappen from 'make-fetch-happen';
import type { Logger } from '@apollo/utils.logger';
import type { Fetcher } from '@apollo/utils.fetcher';
import resolvable, { Resolvable } from '@josephg/resolvable';
import { SupergraphManager, SupergraphSdlHookOptions } from '../../config';
import {
  SubgraphHealthCheckFunction,
  SupergraphSdlUpdateFunction,
} from '../..';
import { getDefaultLogger } from '../../logger';
import { loadSupergraphSdlFromUplinks } from './loadSupergraphSdlFromStorage';

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
  | FailureToFetchSupergraphSdlFunctionParams & {
      mostRecentSuccessfulFetchAt?: Date;
    }) => Promise<string | null>;

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
  public static readonly DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
  public static readonly MIN_POLL_INTERVAL_MS = 10_000;

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
  private requestTimeoutMs: number =
    UplinkSupergraphManager.DEFAULT_REQUEST_TIMEOUT_MS;
  private initialMaxRetries: number;
  private pollIntervalMs: number = UplinkSupergraphManager.MIN_POLL_INTERVAL_MS;
  private fallbackPollIntervalInMs?: number;
  private logger: Logger;
  private update?: SupergraphSdlUpdateFunction;
  private shouldRunSubgraphHealthcheck: boolean = false;
  private healthCheck?: SubgraphHealthCheckFunction;
  private onFailureToFetchSupergraphSdlDuringInit?: FailureToFetchSupergraphSdlDuringInit;
  private onFailureToFetchSupergraphSdlAfterInit?: FailureToFetchSupergraphSdlAfterInit;
  private timerRef: NodeJS.Timeout | null = null;
  private state: State;
  private compositionId?: string;
  private fetchCount: number = 0;
  private mostRecentSuccessfulFetchAt?: Date;

  constructor({
    apiKey,
    graphRef,
    debug,
    logger,
    uplinkEndpoints,
    fallbackPollIntervalInMs,
    maxRetries,
    initialMaxRetries,
    fetcher,
    shouldRunSubgraphHealthcheck,
    onFailureToFetchSupergraphSdlDuringInit,
    onFailureToFetchSupergraphSdlAfterInit,
  }: {
    apiKey: string;
    graphRef: string;
    debug?: boolean;
    logger?: Logger;
    uplinkEndpoints?: string[];
    fallbackPollIntervalInMs?: number;
    maxRetries?: number;
    initialMaxRetries?: number;
    fetcher?: Fetcher;
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

    this.pollIntervalMs = fallbackPollIntervalInMs ?? this.pollIntervalMs;
    this.fallbackPollIntervalInMs = fallbackPollIntervalInMs;
    if (this.pollIntervalMs < UplinkSupergraphManager.MIN_POLL_INTERVAL_MS) {
      this.logger.warn(
        'Polling Apollo services at a frequency of less than once per 10 seconds (10000) is disallowed. Instead, the minimum allowed pollInterval of 10000 will be used. Please reconfigure your `fallbackPollIntervalInMs` accordingly. If this is problematic for your team, please contact support.',
      );
      this.pollIntervalMs = UplinkSupergraphManager.MIN_POLL_INTERVAL_MS;
    }

    this.fetcher = fetcher ?? this.fetcher;

    this.shouldRunSubgraphHealthcheck =
      shouldRunSubgraphHealthcheck ?? this.shouldRunSubgraphHealthcheck;
    this.onFailureToFetchSupergraphSdlDuringInit =
      onFailureToFetchSupergraphSdlDuringInit;
    this.onFailureToFetchSupergraphSdlAfterInit =
      onFailureToFetchSupergraphSdlAfterInit;

    if (!!process.env.APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT) {
      this.logger.warn('Out-of-band error reporting is no longer used by Apollo. You may remove the `APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT` environment variable at your convenience.');
    }
    this.state = { phase: 'constructed' };
  }

  public async initialize({ update, healthCheck }: SupergraphSdlHookOptions) {
    this.update = update;

    if (this.shouldRunSubgraphHealthcheck) {
      this.healthCheck = healthCheck;
    }

    let initialSupergraphSdl: string | null = null;
    try {
      initialSupergraphSdl = await this.updateSupergraphSdl(
        this.initialMaxRetries,
      );
      if (!initialSupergraphSdl) {
        throw new Error(
          'Invalid supergraph schema supplied during initialization.',
        );
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

  private async updateSupergraphSdl(
    maxRetries: number,
  ): Promise<string | null> {
    let supergraphSdl;

    try {
      const result = await loadSupergraphSdlFromUplinks({
        graphRef: this.graphRef,
        apiKey: this.apiKey,
        endpoints: this.uplinkEndpoints,
        fetcher: this.fetcher,
        compositionId: this.compositionId ?? null,
        maxRetries,
        requestTimeoutMs: this.requestTimeoutMs,
        roundRobinSeed: this.fetchCount++,
        logger: this.logger,
      });
      this.mostRecentSuccessfulFetchAt = new Date();

      this.logger.debug(
        `Received Uplink response. Has updated SDL? ${!!result?.supergraphSdl}`,
      );

      if (!result) {
        return null;
      }

      this.compositionId = result.id;

      supergraphSdl = result.supergraphSdl;
      if (result?.minDelaySeconds) {
        this.pollIntervalMs = result.minDelaySeconds * 1000;

        // We only want to take the max of the two _if_ a fallback interval is
        // configured. If we take the max above unconditionally, then a gateway
        // with an unconfigured fallback interval will only ever lengthen its
        // poll interval rather than adapt to changes coming from Uplink.
        if (this.fallbackPollIntervalInMs) {
          this.pollIntervalMs = Math.max(
            this.pollIntervalMs,
            this.fallbackPollIntervalInMs,
          );
        }
      }
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
    return supergraphSdl;
  }

  private beginPolling() {
    this.state = { phase: 'polling' };
    this.poll();
  }

  private poll() {
    if (this.state.phase !== 'polling') {
      this.logger.debug(`Stopped polling Uplink [phase: ${this.state.phase}]`);
      return;
    }

    this.state.nextFetchPromise = resolvable();

    this.logger.debug(
      `Will poll Uplink after ${this.pollIntervalMs}ms [phase: ${this.state.phase}]`,
    );
    this.timerRef = setTimeout(async () => {
      if (this.state.phase === 'polling') {
        const pollingPromise = resolvable();
        this.state.pollingPromise = pollingPromise;
        try {
          const supergraphSdl = await this.updateSupergraphSdl(this.maxRetries);
          if (supergraphSdl) {
            this.update?.(supergraphSdl);
          }
        } catch (e) {
          this.logUpdateFailure(e);
        }
        pollingPromise.resolve();
        this.state.nextFetchPromise?.resolve();
      }

      this.poll();
    }, this.pollIntervalMs);
  }

  private logUpdateFailure(e: any) {
    this.logger.error(
      'UplinkSupergraphManager failed to update supergraph with the following error: ' +
        (e.message ?? e),
    );
  }
}
