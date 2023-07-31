import opentelemetry from '@opentelemetry/api';
import type { Attributes } from '@opentelemetry/api';
import type { GatewayGraphQLRequestContext } from '@apollo/server-gateway-interface';
import { OperationContext } from '../operationContext';

export enum OpenTelemetrySpanNames {
  REQUEST = 'gateway.request',
  PLAN = 'gateway.plan',
  FETCH = 'gateway.fetch',
  POST_PROCESSING = 'gateway.postprocessing',
  EXECUTE = 'gateway.execute',
  VALIDATE = 'gateway.validate',
}

const { name, version } = require('../../package.json');
export const tracer = opentelemetry.trace.getTracer(`${name}/${version}`);

export interface SpanAttributes extends Attributes {
  /**
   * @deprecated in favor of `graphql.operation.name`
   */
  operationName?: string;
  'graphql.operation.name'?: string;
  'graphql.operation.type'?: string;
  'graphql.document'?: string;
}

export function requestContextSpanAttributes(
  requestContext: GatewayGraphQLRequestContext
): SpanAttributes {
  const spanAttributes: SpanAttributes = {};

  if (requestContext.operationName) {
    spanAttributes["operationName"] = requestContext.operationName;
    spanAttributes["graphql.operation.name"] = requestContext.operationName;
  }
  if (requestContext.source) {
    spanAttributes["graphql.document"] = requestContext.source;
  }

  return spanAttributes;
}

export function operationContextSpanAttributes(
  operationContext: OperationContext
): SpanAttributes {
  const spanAttributes: SpanAttributes = {};

  if (operationContext.operation.operation) {
    spanAttributes["graphql.operation.type"] = operationContext.operation.operation;
  }

  return spanAttributes;
}
