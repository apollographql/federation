import opentelemetry from '@opentelemetry/api';
import type { Attributes, Exception, Span } from '@opentelemetry/api';
import type { GatewayGraphQLRequestContext } from '@apollo/server-gateway-interface';
import { OperationContext } from '../operationContext';

export type OpenTelemetryConfig = {
  /**
   * Whether to include the `graphql.document` attribute in the `gateway.request` OpenTelemetry spans.
   * When set to `true`, the attribute will contain the entire GraphQL document for the current request.
   *
   * Defaults to `false`, meaning that the GraphQL document will not be added as a span attribute.
   */
  includeDocument?: boolean;
  /**
   * Whether to record the GraphQL and internal errors that take place while processing a request as
   * exception events in the OpenTelemetry spans in which they occur.
   *
   * When a number is given as a value, it represents the maximum number of exceptions that will be
   * reported in each OpenTelemetry span.
   *
   * Regardless of the value of this setting, the span status code will be set to `ERROR` when a GraphQL
   * or internal error occurs.
   *
   * Defaults to `false`, meaning that no exceptions will be reported in any spans.
   */
  recordExceptions?: boolean | number;
}

export enum OpenTelemetrySpanNames {
  REQUEST = 'gateway.request',
  PLAN = 'gateway.plan',
  FETCH = 'gateway.fetch',
  POST_PROCESSING = 'gateway.postprocessing',
  EXECUTE = 'gateway.execute',
  VALIDATE = 'gateway.validate',
}

/*
   When adding any more, please refer to:
   https://opentelemetry.io/docs/specs/otel/common/attribute-naming/
   https://opentelemetry.io/docs/specs/otel/trace/semantic_conventions/instrumentation/graphql/
*/
export enum OpenTelemetryAttributeNames {
  GRAPHQL_DOCUMENT = 'graphql.document',
  GRAPHQL_OPERATION_NAME = 'graphql.operation.name',
  GRAPHQL_OPERATION_NAME_DEPRECATED = 'operationName', // deprecated in favor of GRAPHQL_OPERATION_NAME
  GRAPHQL_OPERATION_TYPE = 'graphql.operation.type',
}

const { name, version } = require('../../package.json');
export const tracer = opentelemetry.trace.getTracer(`${name}/${version}`);

export interface SpanAttributes extends Attributes {
  /**
   * @deprecated in favor of `graphql.operation.name`
   */
  [OpenTelemetryAttributeNames.GRAPHQL_OPERATION_NAME_DEPRECATED]?: string;
  [OpenTelemetryAttributeNames.GRAPHQL_OPERATION_NAME]?: string;
  [OpenTelemetryAttributeNames.GRAPHQL_OPERATION_TYPE]?: string;
  [OpenTelemetryAttributeNames.GRAPHQL_DOCUMENT]?: string;
}

export function requestContextSpanAttributes(
  requestContext: GatewayGraphQLRequestContext,
  config: OpenTelemetryConfig | undefined
): SpanAttributes {
  const spanAttributes: SpanAttributes = {};

  if (requestContext.operationName) {
    spanAttributes[
      OpenTelemetryAttributeNames.GRAPHQL_OPERATION_NAME_DEPRECATED
    ] = requestContext.operationName;
    spanAttributes[OpenTelemetryAttributeNames.GRAPHQL_OPERATION_NAME] =
      requestContext.operationName;
  }
  if (config?.includeDocument && requestContext.source) {
    spanAttributes[OpenTelemetryAttributeNames.GRAPHQL_DOCUMENT] =
      requestContext.source;
  }

  return spanAttributes;
}

export function operationContextSpanAttributes(
  operationContext: OperationContext
): SpanAttributes {
  const spanAttributes: SpanAttributes = {};

  if (operationContext.operation.operation) {
    spanAttributes[OpenTelemetryAttributeNames.GRAPHQL_OPERATION_TYPE] =
      operationContext.operation.operation;
  }

  return spanAttributes;
}

export function recordExceptions(
  span: Span,
  exceptions: readonly Exception[],
  config: OpenTelemetryConfig | undefined
) {
  const recordExceptions = config?.recordExceptions;

  if (recordExceptions === undefined || recordExceptions === false) {
    return;
  }

  let exceptionsToRecord;

  if (recordExceptions === true) {
    exceptionsToRecord = exceptions;
  } else if (recordExceptions <= 0) {
    return;
  } else {
    exceptionsToRecord = exceptions.slice(0, recordExceptions)
  }

  for (const exception of exceptionsToRecord) {
    span.recordException(exception);
  }
}
