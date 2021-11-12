export type Maybe<T> = T | null;
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
  /** ISO 8601, extended format with nanoseconds, Zulu (or '[+-]seconds' for times relative to now) */
  Timestamp: any;
};

export type ApiMonitoringReport = {
  endedAt: Scalars['Timestamp'];
  error: Error;
  request: Request;
  response?: Maybe<Response>;
  startedAt: Scalars['Timestamp'];
  /** Tags can include things like version and package name */
  tags?: Maybe<Array<Scalars['String']>>;
};

export type Error = {
  code: ErrorCode;
  message?: Maybe<Scalars['String']>;
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
  value?: Maybe<Scalars['String']>;
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
  report?: Maybe<ApiMonitoringReport>;
};

export type Query = {
  __typename?: 'Query';
  _empty?: Maybe<Scalars['String']>;
  /** Fetch the configuration for a router. If a valid configuration is available, it will be readable as cSDL. */
  routerConfig: RouterConfigResponse;
};


export type QueryRouterConfigArgs = {
  apiKey: Scalars['String'];
  ifAfterId?: Maybe<Scalars['ID']>;
  ref: Scalars['String'];
};

export type Request = {
  body?: Maybe<Scalars['String']>;
  headers?: Maybe<Array<HttpHeader>>;
  url: Scalars['String'];
};

export type Response = {
  body?: Maybe<Scalars['String']>;
  headers?: Maybe<Array<HttpHeader>>;
  httpStatusCode: Scalars['Int'];
};

export type RouterConfigResponse = FetchError | RouterConfigResult | Unchanged;

export type RouterConfigResult = {
  __typename?: 'RouterConfigResult';
  id: Scalars['ID'];
  /** Messages that should be reported back to the operators of this router, eg through logs and/or monitoring. */
  messages: Array<Message>;
  /** The configuration as core schema */
  supergraphSDL: Scalars['String'];
};

export type Unchanged = {
  __typename?: 'Unchanged';
  id: Scalars['ID'];
};

export type SupergraphSdlQueryVariables = Exact<{
  apiKey: Scalars['String'];
  ref: Scalars['String'];
  ifAfterId?: Maybe<Scalars['ID']>;
}>;


export type SupergraphSdlQuery = { __typename?: 'Query', routerConfig: { __typename: 'FetchError', code: FetchErrorCode, message: string } | { __typename: 'RouterConfigResult', id: string, supergraphSdl: string } | { __typename: 'Unchanged' } };

export type OobReportMutationVariables = Exact<{
  input?: Maybe<ApiMonitoringReport>;
}>;


export type OobReportMutation = { __typename?: 'Mutation', reportError: boolean };
