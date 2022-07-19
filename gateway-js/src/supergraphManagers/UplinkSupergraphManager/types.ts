import type { AbortSignal } from 'node-abort-controller';
import type { Fetcher, FetcherRequestInit } from '@apollo/utils.fetcher';

export interface AbortableFetcherRequestInit extends FetcherRequestInit {
  signal?: AbortSignal | null | undefined;
};

export interface AbortableFetcher extends Fetcher {
  init?: AbortableFetcherRequestInit;
};
