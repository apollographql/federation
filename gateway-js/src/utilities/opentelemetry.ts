import opentelemetry from '@opentelemetry/api';

export enum OpenTelemetrySpanNames {
  REQUEST = 'gateway.request',
  PLAN = 'gateway.plan',
  FETCH = 'gateway.fetch',
  POST_PROCESSING = 'gateway.postprocessing',
  EXECUTE = 'gateway.execute',
  VALIDATE = 'gateway.validate',
}

/*
   See:
   https://opentelemetry.io/docs/specs/otel/common/attribute-naming/
   https://opentelemetry.io/docs/specs/otel/trace/semantic_conventions/instrumentation/graphql/
*/
export enum OpenTelemetryAttributeNames {
  GRAPHQL_OPERATION_NAME = 'graphql.operation.name'
}

const { name, version } = require('../../package.json');
export const tracer = opentelemetry.trace.getTracer(`${name}/${version}`);
