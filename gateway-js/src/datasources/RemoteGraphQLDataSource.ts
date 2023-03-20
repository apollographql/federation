import { isObject } from '../utilities/predicates';
import { GraphQLDataSource, GraphQLDataSourceProcessOptions, GraphQLDataSourceRequestKind } from './types';
import { createHash } from '@apollo/utils.createhash';
import { ResponsePath } from '@apollo/query-planner';
import { parseCacheControlHeader } from './parseCacheControlHeader';
import fetcher from 'make-fetch-happen';
import { Headers as NodeFetchHeaders, Request as NodeFetchRequest } from 'node-fetch';
import { Fetcher, FetcherRequestInit, FetcherResponse } from '@apollo/utils.fetcher';
import { GraphQLError, GraphQLErrorExtensions } from 'graphql';
import { GatewayCacheHint, GatewayCachePolicy, GatewayGraphQLRequest, GatewayGraphQLRequestContext, GatewayGraphQLResponse } from '@apollo/server-gateway-interface';

export class RemoteGraphQLDataSource<
  TContext extends Record<string, any> = Record<string, any>,
> implements GraphQLDataSource<TContext>
{
  fetcher: Fetcher;

  constructor(
    config?: Partial<RemoteGraphQLDataSource<TContext>> &
      object &
      ThisType<RemoteGraphQLDataSource<TContext>>,
  ) {
    this.fetcher = fetcher.defaults({
      // Allow an arbitrary number of sockets per subgraph. This is the default
      // behavior of Node's http.Agent as well as the npm package agentkeepalive
      // which wraps it, but is not the default behavior of make-fetch-happen
      // which wraps agentkeepalive (that package sets this to 15 by default).
      maxSockets: Infinity,
      // although this is the default, we want to take extra care and be very
      // explicity to ensure that mutations cannot be retried. please leave this
      // intact.
      retry: false,
    });
    if (config) {
      return Object.assign(this, config);
    }
  }

  url!: string;

  /**
   * Whether the downstream request should be made with automated persisted
   * query (APQ) behavior enabled.
   *
   * @remarks When enabled, the request to the downstream service will first be
   * attempted using a SHA-256 hash of the operation rather than including the
   * operation itself. If the downstream server supports APQ and has this
   * operation registered in its APQ storage, it will be able to complete the
   * request without the entirety of the operation document being transmitted.
   *
   * In the event that the downstream service is unaware of the operation, it
   * will respond with an `PersistedQueryNotFound` error and it will be resent
   * with the full operation body for fulfillment.
   *
   * Generally speaking, when the downstream server is processing similar
   * operations repeatedly, APQ can offer substantial network savings in terms
   * of bytes transmitted over the wire between gateways and downstream servers.
   */
  apq: boolean = false;

  /**
   * Should cache-control response headers from subgraphs affect the operation's
   * cache policy? If it shouldn't, set this to false.
   */
  honorSubgraphCacheControlHeader: boolean = true;

  async process(
    options: GraphQLDataSourceProcessOptions<TContext>,
  ): Promise<GatewayGraphQLResponse> {
    const { request, context: originalContext } = options;
    const pathInIncomingRequest =
      options.kind === GraphQLDataSourceRequestKind.INCOMING_OPERATION
        ? options.pathInIncomingRequest
        : undefined;

    // Deal with a bit of a hairy situation in typings: when doing health checks
    // and schema checks we always pass in `{}` as the context even though it's
    // not really guaranteed to be a `TContext`, and then we pass it to various
    // methods on this object. The reason this "works" is that the DataSourceMap
    // and Service types aren't generic-ized on TContext at all (so `{}` is in
    // practice always legal there)... ie, the genericness of this class is
    // questionable in the first place.
    const context = originalContext as TContext;

    // Respect incoming http headers (eg, apollo-federation-include-trace).
    const headers = new NodeFetchHeaders();
    if (request.http?.headers) {
      for (const [name, value] of request.http.headers) {
        headers.append(name, value);
      }
    }
    headers.set('Content-Type', 'application/json');

    request.http = {
      method: 'POST',
      url: this.url,
      headers,
    };

    if (this.willSendRequest) {
      await this.willSendRequest(options);
    }

    if (!request.query) {
      throw new Error('Missing query');
    }

    const { query, ...requestWithoutQuery } = request;

    // Special handling of cache-control headers in response. Requires
    // Apollo Server 3, so we check to make sure the method we want is
    // there.
    const overallCachePolicy =
      this.honorSubgraphCacheControlHeader &&
      options.kind === GraphQLDataSourceRequestKind.INCOMING_OPERATION &&
      options.incomingRequestContext.overallCachePolicy &&
      'restrict' in options.incomingRequestContext.overallCachePolicy
        ? options.incomingRequestContext.overallCachePolicy
        : null;

    if (this.apq) {
      const apqHash = createHash('sha256').update(request.query).digest('hex');

      // Take the original extensions and extend them with
      // the necessary "extensions" for APQ handshaking.
      requestWithoutQuery.extensions = {
        ...request.extensions,
        persistedQuery: {
          version: 1,
          sha256Hash: apqHash,
        },
      };

      const apqOptimisticResponse = await this.sendRequest(
        requestWithoutQuery,
        context,
      );

      // If we didn't receive notice to retry with APQ, then let's
      // assume this is the best result we'll get and return it!
      if (
        !apqOptimisticResponse.errors ||
        !apqOptimisticResponse.errors.find(
          (error) => error.message === 'PersistedQueryNotFound',
        )
      ) {
        return this.respond({
          response: apqOptimisticResponse,
          request: requestWithoutQuery,
          context,
          overallCachePolicy,
          pathInIncomingRequest
        });
      }
    }

    // If APQ was enabled, we'll run the same request again, but add in the
    // previously omitted `query`.  If APQ was NOT enabled, this is the first
    // request (non-APQ, all the way).
    const requestWithQuery: GatewayGraphQLRequest = {
      query,
      ...requestWithoutQuery,
    };
    const response = await this.sendRequest(requestWithQuery, context);
    return this.respond({
      response,
      request: requestWithQuery,
      context,
      overallCachePolicy,
      pathInIncomingRequest
    });
  }

  private async sendRequest(
    request: GatewayGraphQLRequest,
    context: TContext,
  ): Promise<GatewayGraphQLResponse> {
    // This would represent an internal programming error since this shouldn't
    // be possible in the way that this method is invoked right now.
    if (!request.http) {
      throw new Error("Internal error: Only 'http' requests are supported.");
    }

    // We don't want to serialize the `http` properties into the body that is
    // being transmitted.  Instead, we want those to be used to indicate what
    // we're accessing (e.g. url) and what we access it with (e.g. headers).
    const { http, ...requestWithoutHttp } = request;
    const stringifiedRequestWithoutHttp = JSON.stringify(requestWithoutHttp);
    const requestInit: FetcherRequestInit = {
      method: http.method,
      headers: Object.fromEntries(http.headers),
      body: stringifiedRequestWithoutHttp,
    };
    // Note that we don't actually send this Request object to the fetcher; it
    // is merely sent to methods on this object that might be overridden by users.
    // We are careful to only send data to the overridable fetcher function that uses
    // plain JS objects --- some fetch implementations don't know how to handle
    // Request or Headers objects created by other fetch implementations.
    const fetchRequest = new NodeFetchRequest(http.url, requestInit);

    let fetchResponse: FetcherResponse | undefined;

    try {
      // Use our local `fetcher` to allow for fetch injection
      // Use the fetcher's `Request` implementation for compatibility
      fetchResponse = await this.fetcher(http.url, requestInit);

      if (!fetchResponse.ok) {
        throw await this.errorFromResponse(fetchResponse);
      }

      const body = await this.parseBody(fetchResponse, fetchRequest, context);

      if (!isObject(body)) {
        throw new Error(`Expected JSON response body, but received: ${body}`);
      }

      return {
        ...body,
        http: fetchResponse,
      };
    } catch (error) {
      this.didEncounterError(error, fetchRequest, fetchResponse, context);
      throw error;
    }
  }

  public willSendRequest?(
    options: GraphQLDataSourceProcessOptions<TContext>,
  ): void | Promise<void>;

  private async respond({
    response,
    request,
    context,
    overallCachePolicy,
    pathInIncomingRequest
  }: {
    response: GatewayGraphQLResponse;
    request: GatewayGraphQLRequest;
    context: TContext;
    overallCachePolicy: GatewayCachePolicy | null;
    pathInIncomingRequest?: ResponsePath
  }): Promise<GatewayGraphQLResponse> {
    const processedResponse =
      typeof this.didReceiveResponse === 'function'
        ? await this.didReceiveResponse({ response, request, context, pathInIncomingRequest })
        : response;

    if (overallCachePolicy) {
      const parsed = parseCacheControlHeader(
        response.http?.headers.get('cache-control'),
      );

      // If the subgraph does not specify a max-age, we assume its response (and
      // thus the overall response) is uncacheable. (If you don't like this, you
      // can tweak the `cache-control` header in your `didReceiveResponse`
      // method.)
      const hint: GatewayCacheHint = { maxAge: 0 };
      const maxAge = parsed['max-age'];
      if (typeof maxAge === 'string' && maxAge.match(/^[0-9]+$/)) {
        hint.maxAge = +maxAge;
      }
      if (parsed['private'] === true) {
        hint.scope = 'PRIVATE';
      }
      if (parsed['public'] === true) {
        hint.scope = 'PUBLIC';
      }
      overallCachePolicy.restrict(hint);
    }

    return processedResponse;
  }

  public didReceiveResponse?(
    requestContext: Required<
      Pick<GatewayGraphQLRequestContext<TContext>, 'request' | 'response' | 'context'>
    > & { pathInIncomingRequest?: ResponsePath }
  ): GatewayGraphQLResponse | Promise<GatewayGraphQLResponse>;

  public didEncounterError(
    error: Error,
    _fetchRequest: NodeFetchRequest,
    _fetchResponse?: FetcherResponse,
    _context?: TContext,
  ) {
    throw error;
  }

  public parseBody(
    fetchResponse: FetcherResponse,
    _fetchRequest?: NodeFetchRequest,
    _context?: TContext,
  ): Promise<object | string> {
    const contentType = fetchResponse.headers.get('Content-Type');
    if (
      contentType &&
      (contentType.startsWith('application/json') ||
        contentType.startsWith('application/graphql-response+json'))
    ) {
      return fetchResponse.json();
    } else {
      return fetchResponse.text();
    }
  }

  public async errorFromResponse(response: FetcherResponse) {
    const body = await this.parseBody(response);

    const extensions: GraphQLErrorExtensions = {
      response: {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        body,
      },
    };

    if (response.status === 401) {
      extensions.code = 'UNAUTHENTICATED';
    } else if (response.status === 403) {
      extensions.code = 'FORBIDDEN';
    }

    return new GraphQLError(`${response.status}: ${response.statusText}`, {
      extensions,
    });
  }
}
