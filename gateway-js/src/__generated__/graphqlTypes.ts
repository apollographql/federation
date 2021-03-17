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
  /** The configuration as cSDL, if available. */
  csdl?: Maybe<Scalars['String']>;
  /** Messages that should be reported back to the operators of this router, eg through logs and/or monitoring. */
  messages: Array<Message>;
};

export enum FetchErrorCode {
  AuthenticationFailed = 'AUTHENTICATION_FAILED',
  AccessDenied = 'ACCESS_DENIED',
  UnknownRef = 'UNKNOWN_REF',
  RetryLater = 'RETRY_LATER'
}

export type FetchError = {
  __typename?: 'FetchError';
  /** A general category for the error */
  code: FetchErrorCode;
  /** A detailed human-readable message only complementing the error code. */
  message: Scalars['String'];
};

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

export enum CacheControlScope {
  Public = 'PUBLIC',
  Private = 'PRIVATE'
}

export type CsdlQueryVariables = Exact<{
  apiKey: Scalars['String'];
  ref: Scalars['String'];
}>;


export type CsdlQuery = (
  { __typename?: 'Query' }
  & { routerConfig: (
    { __typename: 'RouterConfigResult' }
    & Pick<RouterConfigResult, 'id' | 'csdl'>
  ) | (
    { __typename: 'FetchError' }
    & Pick<FetchError, 'code' | 'message'>
  ) }
);
