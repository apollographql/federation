export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  Timestamp: any;
};

export type FetchError = {
  __typename?: 'FetchError';
  code: FetchErrorCode;
  message: Scalars['String'];
  /** Minimum delay before the next fetch should occur, in seconds. */
  minDelaySeconds: Scalars['Float'];
};

export enum FetchErrorCode {
  /** This token does not have access to fetch the schema for this ref. Do not retry. */
  AccessDenied = 'ACCESS_DENIED',
  /** This token provided is not a valid graph token. Do not retry. */
  AuthenticationFailed = 'AUTHENTICATION_FAILED',
  /** This instance of Uplink does not support this feature. Please try another instance. */
  NotImplementedOnThisInstance = 'NOT_IMPLEMENTED_ON_THIS_INSTANCE',
  /** An internal server error occurred. Please retry with some backoff. */
  RetryLater = 'RETRY_LATER',
  /** The graphRef passed is not a valid ref or no configuration for that ref is found. Please retry with some backoff, eg in case of undeletion. */
  UnknownRef = 'UNKNOWN_REF'
}

export type Message = {
  __typename?: 'Message';
  body: Scalars['String'];
  level: MessageLevel;
};

export enum MessageLevel {
  Error = 'ERROR',
  Info = 'INFO',
  Warn = 'WARN'
}

/** A chunk of persisted queries */
export type PersistedQueriesChunk = {
  __typename?: 'PersistedQueriesChunk';
  /** Unique identifier. */
  id: Scalars['ID'];
  /** The chunk can be downloaded from any of those URLs, which might be transient. */
  urls: Array<Scalars['String']>;
};

export type PersistedQueriesResponse = FetchError | PersistedQueriesResult | Unchanged;

export type PersistedQueriesResult = {
  __typename?: 'PersistedQueriesResult';
  /** List of URLs chunks are to be fetched from; chunks should be cached by ID between updates. null indicates there is no configured persisted query list. */
  chunks?: Maybe<Array<PersistedQueriesChunk>>;
  /** Unique identifier. */
  id: Scalars['ID'];
  /** Minimum delay before the next fetch should occur, in seconds. */
  minDelaySeconds: Scalars['Float'];
};

export type Query = {
  __typename?: 'Query';
  /** Fetch the persisted queries for a router. */
  persistedQueries: PersistedQueriesResponse;
  /** Fetch the configuration for a router. */
  routerConfig: RouterConfigResponse;
  /** Fetch the current entitlements for a router. */
  routerEntitlements: RouterEntitlementsResponse;
};


export type QueryPersistedQueriesArgs = {
  apiKey: Scalars['String'];
  ifAfterId?: InputMaybe<Scalars['ID']>;
  ref: Scalars['String'];
};


export type QueryRouterConfigArgs = {
  apiKey: Scalars['String'];
  ifAfterId?: InputMaybe<Scalars['ID']>;
  ref: Scalars['String'];
};


export type QueryRouterEntitlementsArgs = {
  apiKey: Scalars['String'];
  ifAfterId?: InputMaybe<Scalars['ID']>;
  ref: Scalars['String'];
};

export type RouterConfigResponse = FetchError | RouterConfigResult | Unchanged;

export type RouterConfigResult = {
  __typename?: 'RouterConfigResult';
  /** Variant-unique identifier. */
  id: Scalars['ID'];
  /** Messages that should be reported back to the operators of this router, eg through logs and/or monitoring. */
  messages: Array<Message>;
  /** Minimum delay before the next fetch should occur, in seconds. */
  minDelaySeconds: Scalars['Float'];
  /** The configuration as core schema. */
  supergraphSDL: Scalars['String'];
};

export type RouterEntitlement = {
  __typename?: 'RouterEntitlement';
  /** Which audiences this entitlemnt applies to. Cloud and on-premise routers each require the presence of their own audience. */
  audience: Array<RouterEntitlementAudience>;
  /** Router should stop serving requests after this time if commercial features are in use. */
  haltAt?: Maybe<Scalars['Timestamp']>;
  /** RFC 8037 Ed25519 JWT signed representation of sibling fields. */
  jwt: Scalars['String'];
  subject: Scalars['String'];
  /** Router should warn users after this time if commercial features are in use. */
  warnAt?: Maybe<Scalars['Timestamp']>;
};

export enum RouterEntitlementAudience {
  Cloud = 'CLOUD',
  SelfHosted = 'SELF_HOSTED'
}

export type RouterEntitlementsResponse = FetchError | RouterEntitlementsResult | Unchanged;

export type RouterEntitlementsResult = {
  __typename?: 'RouterEntitlementsResult';
  /** The best available entitlement if any. May have expired already. */
  entitlement?: Maybe<RouterEntitlement>;
  /** Unique identifier for this result, to be passed in as `entitlements(unlessId:)`. */
  id: Scalars['ID'];
  /** Minimum delay before the next fetch should occur, in seconds. */
  minDelaySeconds: Scalars['Float'];
};

/** Response indicating the router configuration available is not newer than the one passed in `ifAfterId`, or the router entitlements currently match `unlessId`. */
export type Unchanged = {
  __typename?: 'Unchanged';
  /** Variant-unique identifier for the configuration that remains in place. */
  id: Scalars['ID'];
  /** Minimum delay before the next fetch should occur, in seconds. */
  minDelaySeconds: Scalars['Float'];
};

export type SupergraphSdlQueryVariables = Exact<{
  apiKey: Scalars['String'];
  ref: Scalars['String'];
  ifAfterId?: InputMaybe<Scalars['ID']>;
}>;


export type SupergraphSdlQuery = { __typename?: 'Query', routerConfig: { __typename: 'FetchError', code: FetchErrorCode, message: string } | { __typename: 'RouterConfigResult', id: string, minDelaySeconds: number, supergraphSdl: string } | { __typename: 'Unchanged' } };
