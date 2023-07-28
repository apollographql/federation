import opentelemetry from '@opentelemetry/api';
import type { GatewayGraphQLRequestContext } from '@apollo/server-gateway-interface';

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

export function requestContextSpanAttributes(requestContext: GatewayGraphQLRequestContext): {[key: string]: any} {
  const spanAttributes: {[key: string]: any} = {};

  if (requestContext.operationName) {
    spanAttributes["operationName"] = requestContext.operationName;
  }
  if (requestContext.source) {
    spanAttributes["graphql.document"] = requestContext.source;
  }

  return spanAttributes;
}
