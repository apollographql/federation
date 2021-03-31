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
};

export type FetchError = {
  __typename?: 'FetchError';
  code: FetchErrorCode;
  message: Scalars['String'];
};

export enum FetchErrorCode {
  /** This token provided is not a valid graph token. Do not retry */
  AuthenticationFailed = 'AUTHENTICATION_FAILED',
  /** This token does not have access to fetch the schema for this ref. Do not retry. */
  AccessDenied = 'ACCESS_DENIED',
  /** The graphRef passed is not a valid ref or no configuration for that ref is found. Do not retry */
  UnknownRef = 'UNKNOWN_REF',
  /** An internal server error occurred. Please retry with some backoff */
  RetryLater = 'RETRY_LATER'
}

export type Message = {
  __typename?: 'Message';
  level: MessageLevel;
  body: Scalars['String'];
};

export enum MessageLevel {
  Error = 'ERROR',
  Warn = 'WARN',
  Info = 'INFO'
}

export type Query = {
  __typename?: 'Query';
  /** Fetch the configuration for a router. If a valid configuration is available, it will be readable as cSDL. */
  routerConfig: RouterConfigResponse;
};


export type QueryRouterConfigArgs = {
  ref: Scalars['String'];
  apiKey: Scalars['String'];
  supportedSpecURLs?: Array<Scalars['String']>;
};

export type RouterConfigResponse = RouterConfigResult | FetchError;

export type RouterConfigResult = {
  __typename?: 'RouterConfigResult';
  id: Scalars['ID'];
  /** The configuration as core schema */
  supergraphSDL: Scalars['String'];
  /** Messages that should be reported back to the operators of this router, eg through logs and/or monitoring. */
  messages: Array<Message>;
};

export type SupergraphSdlQueryVariables = Exact<{
  apiKey: Scalars['String'];
  ref: Scalars['String'];
}>;


export type SupergraphSdlQuery = (
  { __typename?: 'Query' }
  & { routerConfig: (
    { __typename: 'RouterConfigResult' }
    & Pick<RouterConfigResult, 'id'>
    & { supergraphSdl: RouterConfigResult['supergraphSDL'] }
  ) | (
    { __typename: 'FetchError' }
    & Pick<FetchError, 'code' | 'message'>
  ) }
);
