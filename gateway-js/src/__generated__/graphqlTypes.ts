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
  /** ISO 8601, extended format with nanoseconds, Zulu (or "[+-]seconds" as a string or number relative to now) */
  Timestamp: any;
};

export type ApiMonitoringReport = {
  endedAt: Scalars['Timestamp'];
  error: Error;
  request: Request;
  response?: InputMaybe<Response>;
  startedAt: Scalars['Timestamp'];
  /** Tags can include things like version and package name */
  tags?: InputMaybe<Array<Scalars['String']>>;
};

/** Input type for providing error details in field arguments. */
export type Error = {
  /** The error code. */
  code: ErrorCode;
  /** The error message. */
  message?: InputMaybe<Scalars['String']>;
};

export enum ErrorCode {
  ConnectionFailed = 'CONNECTION_FAILED',
  InvalidBody = 'INVALID_BODY',
  Other = 'OTHER',
  Timeout = 'TIMEOUT',
  UnexpectedResponse = 'UNEXPECTED_RESPONSE'
}

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
  /** This token provided is not a valid graph token. Do not retry */
  AuthenticationFailed = 'AUTHENTICATION_FAILED',
  /** An internal server error occurred. Please retry with some backoff */
  RetryLater = 'RETRY_LATER',
  /** The graphRef passed is not a valid ref or no configuration for that ref is found. Do not retry */
  UnknownRef = 'UNKNOWN_REF'
}

export type HttpHeader = {
  name: Scalars['String'];
  value?: InputMaybe<Scalars['String']>;
};

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

export type Mutation = {
  __typename?: 'Mutation';
  reportError: Scalars['Boolean'];
};


export type MutationReportErrorArgs = {
  report?: InputMaybe<ApiMonitoringReport>;
};

export type Query = {
  __typename?: 'Query';
  _empty?: Maybe<Scalars['String']>;
  /** Fetch the configuration for a router. If a valid configuration is available, it will be readable as cSDL. */
  routerConfig: RouterConfigResponse;
};


export type QueryRouterConfigArgs = {
  apiKey: Scalars['String'];
  ifAfterId?: InputMaybe<Scalars['ID']>;
  ref: Scalars['String'];
};

export type Request = {
  body?: InputMaybe<Scalars['String']>;
  headers?: InputMaybe<Array<HttpHeader>>;
  url: Scalars['String'];
};

export type Response = {
  body?: InputMaybe<Scalars['String']>;
  headers?: InputMaybe<Array<HttpHeader>>;
  httpStatusCode: Scalars['Int'];
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

/** Response indicating the router configuration available is not newer than the one passed in `ifAfterId`. */
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

export type OobReportMutationVariables = Exact<{
  input?: InputMaybe<ApiMonitoringReport>;
}>;


export type OobReportMutation = { __typename?: 'Mutation', reportError: boolean };
